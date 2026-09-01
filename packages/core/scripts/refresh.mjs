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
 * This matters here specifically because the agent-driven auto-sync was NARROWED
 * (see .github/workflows/synclair-catalog.yml): running a model on every PR push
 * cost real tokens and minted preview scenes on branches that then collided, so
 * the agent job now fires only on PR open/reopen/ready-for-review, and only when
 * an ANTHROPIC_API_KEY secret is present. The cheap scan still runs every push.
 * Everything below is deterministic — no model, no network, no tokens — so it's
 * safe to run on a hook, in CI, or fifty times a day. Repowise gets continuous
 * freshness the same way: its index is derived, so `update` is cheap enough to
 * run on every commit.
 *
 *   npm run refresh            refresh what can be refreshed, report the rest
 *   npm run refresh -- --check report only, change nothing (CI)
 */

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { runner } from "./lib/runner.mjs"

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = process.cwd() // the hub root is the CALLER'S cwd (the CLI guarantees it) — never derived from import.meta.url, which points into the core package
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

// TS CLIs (artifact-module wrappers, battery B3) run under tsx, which may live
// in the package's own node_modules or hoisted at the hub root.
const TSX_DIRS = [path.join(SCRIPTS_DIR, ".."), ROOT]

function run(script, args = []) {
  try {
    const out = execFileSync(...runner(path.join(SCRIPTS_DIR, script), args, TSX_DIRS), {
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

/**
 * The freshness board — check-freshness's --json output written to data/, so
 * the Environment page can show the whole team whether what the hub says is
 * still true. The check is the single owner of that judgment; this step only
 * makes its answer renderable. Runs in --check too: reporting on freshness
 * IS the check.
 */
/**
 * The discovery loop — what appeared beside registered documents that nothing
 * covers. Never registers; recording is a deliberate human/agent act. See
 * scripts/check-discovery.mjs for the doctrine.
 */
steps.push({
  label: "doc discovery",
  run: () => run("check-discovery.ts", checkOnly ? ["--check"] : []),
  read: (out) => {
    const m = out.match(/(\d+) file\(s\) no manifest entry covers/)
    return m ? `${m[1]} uncovered file(s)` : "nothing uncovered"
  },
})

steps.push({
  label: "freshness board",
  run: () => {
    const res = run("check-freshness.mjs", ["--json"])
    if (res.ok) {
      const body = res.out.endsWith("\n") ? res.out : res.out + "\n"
      mkdirSync(path.join(ROOT, ".synclair", "cache"), { recursive: true })
      writeFileSync(path.join(ROOT, ".synclair", "cache", "digest-freshness.json"), body)
    }
    return res
  },
  read: (out) => {
    try {
      const parsed = JSON.parse(out)
      const stale = parsed.artifacts.filter((a) => a.state === "stale").length
      return stale ? `${parsed.artifacts.length} artifact(s) · ${stale} stale` : `${parsed.artifacts.length} artifact(s) · all fresh`
    } catch {
      return "written"
    }
  },
})

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
  /**
   * In host mode the scan can now READ the router (when it's Next app-router),
   * but applying it is not a hook's call: on a real clone it would take a
   * curated 51-route sitemap to 69 by adding API handlers. That's a content
   * change to a reviewed artifact, so detect here and let a person apply it.
   */
  const drift = run("scan-pages.mjs", ["--check"])
  if (!drift.ok) {
    const added = /\+ (\d+) new/.exec(drift.out)?.[1]
    const gone = /− (\d+) gone/.exec(drift.out)?.[1]
    pending.push(
      `pages map — the host's routes moved (${added ?? "?"} new, ${gone ?? 0} gone). `
      + `Review and apply with \`npm run map:pages\`, then write summaries for anything new.`
    )
  }

  const stale = run("check-freshness.mjs", ["--json"])
  const parsed = (() => {
    try {
      return JSON.parse(stale.out)
    } catch {
      return null
    }
  })()
  // Only if the route LIST is current — otherwise the drift line above already
  // says it, and saying it twice (once wrongly) is worse than saying it once.
  const pagesEntry = parsed?.artifacts?.find((a) => a.artifact === "pages")
  if (pagesEntry?.state === "stale" && drift.ok) {
    pending.push(
      `pages map — ${pagesEntry.detail}. The routes are right but their source `
      + `moved; \`npm run map:pages\` re-anchors them, then re-check the summaries.`
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
  + `  Safe on a hook or in CI, unlike the agent-driven PR auto-sync it complements.\n`
)

process.exit(checkOnly && failed ? 1 : 0)
