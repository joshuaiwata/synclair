#!/usr/bin/env node
/**
 * REFRESH — close every gap that can be closed without an agent, then say
 * plainly what's left and who has to do it.
 *
 * Synclair's digests drift for two different reasons, and only one of them is
 * fixable for free:
 *
 *   FACTS drift when code moves — a file's hash, its props, which routes exist,
 *   how many places render a component. Deriving those again costs nothing, is
 *   reproducible, and cannot invent anything. That's what this does.
 *
 *   JUDGMENT goes stale when the product changes — what a screen is FOR, when to
 *   reach for a component, what a PRD now says. No script writes that, and a
 *   script that tried would produce confident fiction.
 *
 * This matters here specifically because the agent-driven auto-sync was retired
 * (see .github/workflows/synclair-catalog.yml): it ran a model on every PR,
 * cost real tokens, and minted preview scenes on branches that then collided.
 * Everything below is deterministic — no model, no network, no tokens — so it's
 * safe to run on a hook, in CI, or fifty times a day. Repowise gets continuous
 * freshness the same way: its index is derived, so `update` is cheap enough to
 * run on every commit.
 *
 *   npm run refresh            refresh what can be refreshed, report the rest
 *   npm run refresh -- --check report only, change nothing (CI)
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const checkOnly = process.argv.includes("--check")

const readJson = (rel) => {
  const p = path.join(ROOT, rel)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

function run(script, args = []) {
  try {
    const out = execFileSync(process.execPath, [path.join(ROOT, "scripts", script), ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { ok: true, out }
  } catch (e) {
    // A step that fails must not stop the others — they're independent, and a
    // half-refreshed clone is worse than a fully-attempted one.
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}`.trim() || String(e) }
  }
}

/** One line of what a step actually did, pulled from its own output. */
const summarise = (out, re, fallback) => (re.exec(out ?? "")?.[0] ?? fallback).trim()

const pagesMap = readJson("data/pages-map.json")
const hostMode = typeof pagesMap?.repo?.root === "string" && pagesMap.repo.root

console.log(`\nSynclair refresh${checkOnly ? " (check only)" : ""}\n`)

// ---------------------------------------------------------------- derivable

const steps = []

// The host catalog: hashes, props, usage. Prose is never touched.
steps.push({
  label: "host catalog",
  run: () => run("draft-host-catalog.mjs", checkOnly ? ["--refresh", "--print"] : ["--refresh"]),
  read: (out) => summarise(out, /facts refreshed: \d+/, "nothing to refresh"),
})

/**
 * The pages map is only derivable for THIS repo's own routes. A host-mode map
 * describes another repo's router, which `scan:pages` deliberately refuses —
 * so in companion mode this is an agent job and gets reported below, not run.
 */
/**
 * Refresh refreshes; it never CREATES. A clone with no pages map yet needs the
 * `pages-map` skill — routes without summaries are an inventory, not a map, and
 * the mother repo deliberately ships this file blank. Generating one here would
 * quietly replace a considered blank with a directory listing.
 */
const hasPagesMap = Array.isArray(pagesMap?.pages) && pagesMap.pages.length > 0

if (!hostMode && hasPagesMap) {
  steps.push({
    label: "pages map",
    run: () => (checkOnly ? run("scan-pages.mjs", ["--check"]) : run("scan-pages.mjs")),
    read: (out) => summarise(out, /\d+ route\(s\) from app\//, "no routes"),
  })
  if (!checkOnly) {
    steps.push({
      label: "page composition",
      run: () => run("resolve-page-items.mjs"),
      read: (out) => summarise(out, /\d+ page\(s\)[^\n]*/, "resolved"),
    })
    steps.push({
      label: "page anchors",
      run: () => run("check-pages.mjs", ["--reanchor"]),
      read: (out) => summarise(out, /\d+ page\(s\) hashed/, "anchored"),
    })
  }
}

steps.push({
  label: "AGENTS.md block",
  run: () => run("gen-agents-block.mjs", checkOnly ? ["--check"] : []),
  read: (out) => (/already current|is current/.test(out) ? "already current" : "updated"),
})
steps.push({
  label: "capability manifest",
  run: () => run("gen-plugin-manifest.mjs", checkOnly ? ["--check"] : []),
  read: (out) => summarise(out, /\d+ skills, \d+ agents|\d+ skills · \d+ agents/, "written"),
})

let failed = 0
for (const step of steps) {
  const { ok, out } = step.run()
  if (!ok) failed++
  console.log(`  ${ok ? "✓" : "✗"} ${step.label.padEnd(20)} ${ok ? step.read(out) : out.split("\n")[0]}`)
}

// ------------------------------------------------------------ needs a human

console.log(`\n  Not derivable — these need someone who knows the product:\n`)

const pending = []

if (hostMode) {
  const stale = run("check-freshness.mjs", ["--json"])
  const parsed = (() => {
    try {
      return JSON.parse(stale.out)
    } catch {
      return null
    }
  })()
  const pagesEntry = parsed?.artifacts?.find((a) => a.artifact === "pages")
  if (pagesEntry?.state === "stale") {
    pending.push(
      `pages map — ${pagesEntry.detail}. It describes the HOST's router, which no `
      + `scanner here reads. Regenerate with the \`pages-map\` skill.`
    )
  }
}

const ux = run("check-ux-docs.mjs")
const uxCount = (ux.out.match(/^\s*[·✗]/gm) ?? []).length
if (uxCount) {
  pending.push(`${uxCount} item(s) need UX docs written or re-affirmed — the \`ux-doc\` skill.`)
}

const knowledge = run("check-knowledge.mjs")
const kLine = /(\d+) fresh · (\d+) stale · (\d+) never · (\d+) unverifiable · (\d+) unreachable/.exec(knowledge.out)
if (kLine) {
  const [, , staleK, never, unver, unreach] = kLine.map(Number)
  if (Number(staleK) || Number(never)) {
    pending.push(`${staleK} source(s) moved upstream, ${never} never distilled — the \`product-spec\` skill.`)
  }
  if (Number(unver) + Number(unreach) > 0) {
    pending.push(
      `${unver + unreach} knowledge source(s) can't be PROBED at all (auth/network). `
      + `Freshness there is unknown, not fresh — worth fixing access before trusting it.`
    )
  }
}

if (pending.length === 0) console.log("    nothing — everything that needs judgment is current.\n")
else {
  for (const p of pending) console.log(`    · ${p}`)
  console.log("")
}

console.log(
  `  Everything above the line is deterministic — no model, no network, no tokens.\n`
  + `  Safe on a hook or in CI, unlike the agent-driven auto-sync this replaces.\n`
)

process.exit(checkOnly && failed ? 1 : 0)
