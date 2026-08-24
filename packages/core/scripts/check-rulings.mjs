#!/usr/bin/env node
/**
 * check:rulings — the standing decisions that govern this codebase.
 *
 * Scans for explicitly-written rulings (inline `RULING:` / `DECISION:` markers
 * and ADR-style documents), reports which files each governs, and flags the ones
 * whose subject has disappeared.
 *
 * REPORTS; NEVER WRITES THE REGISTER. A scan yields candidates, and candidates
 * are not decisions — the same restraint `draft:host-catalog` applies to
 * components. `--write` persists to `.synclair/cache/rulings.json` only when a human asks.
 *
 * No model, no network. The delivery half lives in `agent-brief`, which surfaces
 * the rulings governing whatever you're currently editing.
 *
 *   npm run check:rulings
 *   npm run check:rulings -- --json
 *   npm run check:rulings -- --write          persist .synclair/cache/rulings.json
 *   npm run check:rulings -- --for <file>...  which rulings govern these files
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { emitJson } from "./lib/emit.mjs"
import { rulingState, rulingsFor, scanDocs, scanMarkers } from "./lib/rulings.mjs"
import { resolveTarget } from "./lib/topology.mjs"

const HUB_ROOT = process.cwd() // the hub root is the CALLER'S cwd (the CLI guarantees it) — never derived from import.meta.url, which points into the core package
const hostRoot = resolveTarget(HUB_ROOT).hostRoot ?? HUB_ROOT
const OUT = path.join(HUB_ROOT, ".synclair", "cache", "rulings.json")

const args = process.argv.slice(2)
const asJson = args.includes("--json")
const write = args.includes("--write")
const forIdx = args.indexOf("--for")
const forFiles = forIdx === -1 ? null : args.slice(forIdx + 1).filter((a) => !a.startsWith("--"))

/**
 * Scan the product's own code, not its dependencies — and in embedded topology
 * not the hub either, whose own source comments are foundation commentary rather
 * than this product's rulings.
 */
function roots() {
  const out = []
  for (const d of ["apps", "packages", "services", "src", "app", "lib", "components"]) {
    if (existsSync(path.join(hostRoot, d))) out.push(d)
  }
  return out.length ? out : ["."]
}

const rulings = [...scanMarkers(hostRoot, roots()), ...scanDocs(hostRoot)].map((r) => ({
  ...r,
  state: rulingState(hostRoot, r),
}))

if (forFiles) {
  const matched = rulingsFor(rulings, forFiles)
  if (asJson) emitJson({ files: forFiles, rulings: matched })
  if (matched.length === 0) {
    console.log("No ruling governs those files.")
    process.exit(0)
  }
  for (const r of matched) console.log(`  · ${r.statement}\n      (${r.governs.join(", ")})`)
  process.exit(0)
}

const byState = {}
for (const r of rulings) byState[r.state] = (byState[r.state] ?? 0) + 1

const report = { scannedAt: new Date().toISOString(), roots: roots(), rulings, byState }

if (write) {
  mkdirSync(path.dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n")
}

if (asJson) emitJson(report)

if (rulings.length === 0) {
  // The honest empty state: nothing found is not a problem, it is an absence of
  // written-down decisions — and the fix is a sentence in a comment, not a tool.
  console.log(
    `check:rulings — no written rulings found in ${roots().join(", ")}.\n`
    + `  Record one where it applies:  // RULING: this surface stays isolated pending design review\n`
    + `  Or add an ADR under docs/decisions/.`
  )
  process.exit(0)
}

console.log(`\ncheck:rulings — ${rulings.length} written ruling(s)\n`)
for (const r of rulings.slice(0, 20)) {
  const where = r.doc ?? (r.governs.length ? `${r.governs[0]}${r.governs.length > 1 ? ` +${r.governs.length - 1}` : ""}` : "—")
  const flag = r.state === "gone" ? " ⚠ subject deleted" : r.state === "unanchored" ? " (governs no file)" : ""
  console.log(`  · ${r.statement}`)
  console.log(`      ${r.kind} · ${where}${flag}`)
}
if (rulings.length > 20) console.log(`  · +${rulings.length - 20} more`)

console.log(`\n${Object.entries(byState).map(([k, v]) => `${v} ${k}`).join(" · ")}`)
if (byState.gone) {
  console.log(
    `\n  ${byState.gone} ruling(s) govern files that no longer exist. Retire them —`
    + `\n  guidance whose subject is gone is the kind people learn to skip.`
  )
}
console.log(write ? `\n  Written → .synclair/cache/rulings.json\n` : `\n  Report only. Add --write to persist.\n`)
