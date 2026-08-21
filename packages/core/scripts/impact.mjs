#!/usr/bin/env node
/**
 * IMPACT — what does this change affect?
 *
 * Answers, from the edges the hub already holds, the question a reviewer asks
 * and nothing could previously tell them: change these files, and which screens,
 * which catalog items, which UX docs and which specs are now suspect?
 *
 * No model, no network, no re-derivation — it reads `pages-map`,
 * `external-catalog`, `ux-docs/anchors` and the knowledge cache. Cheap enough
 * for a hook, a PR gate, or fifty runs a day.
 *
 * ADVISORY BY DESIGN. It exits 0 even with findings: "this touches eight
 * screens" is context for a human, not a failure. `--strict` is there for a gate
 * that wants otherwise.
 *
 *   npm run impact                     working tree vs HEAD
 *   npm run impact -- main..HEAD       a branch / PR range
 *   npm run impact -- --files a.tsx b.tsx
 *   npm run impact -- --json
 */

import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { emitJson } from "./lib/emit.mjs"
import { buildGraph, impactOf } from "./lib/edges.mjs"

const HUB_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const args = process.argv.slice(2)
const has = (n) => args.includes(n)
const asJson = has("--json")
const strict = has("--strict")

if (has("--help") || has("-h")) {
  console.log(
    [
      "impact — which screens, items, docs and specs a change touches",
      "",
      "  npm run impact                  working tree vs HEAD",
      "  npm run impact -- main..HEAD    a branch or PR range",
      "  npm run impact -- --files a b   explicit paths (product-repo-relative)",
      "  npm run impact -- --json        machine-readable",
    ].join("\n")
  )
  process.exit(0)
}

const graph = buildGraph(HUB_ROOT)

/** Changed files, product-repo-relative, from git or from --files. */
function changedFiles() {
  const i = args.indexOf("--files")
  if (i !== -1) return args.slice(i + 1).filter((a) => !a.startsWith("--"))
  const range = args.find((a) => !a.startsWith("--"))
  const gitArgs = range
    ? ["diff", "--name-only", range]
    : ["status", "--porcelain=v1", "--untracked-files=all"]
  try {
    const out = execFileSync("git", gitArgs, {
      cwd: graph.hostRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
      maxBuffer: 16 * 1024 * 1024,
    })
    return out
      .split("\n")
      .map((l) => (range ? l.trim() : l.slice(3).trim()))
      .filter(Boolean)
  } catch {
    return []
  }
}

const changed = changedFiles()
const result = impactOf(graph, changed)
const label = (k) => graph.itemLabels.get(k) ?? k

if (asJson) {
  // Flush before exiting: a populated clone's payload exceeds the pipe buffer,
  // and `process.exit()` would cut it mid-JSON.
  emitJson(
    {
      hostRoot: graph.hostRoot,
      changed,
      graph: graph.counts,
      ...result,
      items: result.items.map((k) => ({ key: k, name: label(k) })),
      docs: result.docs.map((k) => ({ key: k, name: label(k) })),
    },
    strict && (result.pages.length || result.docs.length) ? 1 : 0
  )
}

if (changed.length === 0) {
  console.log("impact: nothing changed.")
  process.exit(0)
}

const touched = result.items.length + result.pages.length + result.docs.length + result.knowledge.length
console.log(`\nimpact — ${changed.length} changed file(s)\n`)

if (touched === 0) {
  console.log("  Nothing the hub tracks. (Not the same as nothing important —")
  console.log("  most of a companion clone's diff is code the catalog never covered.)\n")
  process.exit(0)
}

const list = (title, arr, cap = 12) => {
  if (!arr.length) return
  console.log(`  ${title} (${arr.length})`)
  for (const x of arr.slice(0, cap)) console.log(`    · ${x}`)
  if (arr.length > cap) console.log(`    · +${arr.length - cap} more`)
  console.log("")
}

list("Catalog items", result.items.map(label))
list("Screens that render them", result.pages)
list("UX docs now suspect", result.docs.map(label))
list("Specs covering these files", result.knowledge)

if (result.reachUnknown.length) {
  // Unknown reach sorts ABOVE proven zero, and says why. A shared component
  // consumed by frontends the pages map doesn't cover would otherwise read as
  // "affects no screens", which is the one wrong answer worth avoiding here.
  console.log(`  Reach unknown (${result.reachUnknown.length})`)
  for (const k of result.reachUnknown.slice(0, 8)) {
    console.log(`    · ${label(k)} — its surface isn't in the pages map, so screen reach couldn't be checked`)
  }
  console.log("")
}

if (result.unmatched.length) {
  // Say what we could NOT place. A silent drop makes "0 affected" and "we have
  // no idea" look identical, which is the reporting failure `rank:hygiene`
  // already refuses to make about reach.
  console.log(`  ${result.unmatched.length} changed file(s) match nothing the hub tracks.\n`)
}

process.exit(strict && touched ? 1 : 0)
