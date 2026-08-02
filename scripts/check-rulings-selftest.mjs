#!/usr/bin/env node
/**
 * SELF-TEST for the rulings layer (scripts/lib/rulings.mjs).
 *
 * Two ways this fails quietly. It can find nothing because the scanner is blind
 * — the failure mode that produced "75 unused endpoints" and "every component
 * used nowhere" earlier in this same plan — or it can find noise, promoting a
 * TODO or a documentation example into standing law that then gets pushed at
 * every agent editing that file.
 *
 * Hermetic: fixture files in a temp dir. No network, no git.
 *
 *   node scripts/check-rulings-selftest.mjs [--verbose]
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { rulingState, rulingsFor, scanDocs, scanMarkers } from "./lib/rulings.mjs"

const verbose = process.argv.includes("--verbose")
let pass = 0
const failures = []
const ok = (n, c, d = "") => {
  if (c) {
    pass++
    if (verbose) console.log(`  ✓ ${n}`)
  } else failures.push(`${n}${d ? ` — ${d}` : ""}`)
}

const root = mkdtempSync(path.join(os.tmpdir(), "synclair-rulings-"))
const write = (rel, body) => {
  const p = path.join(root, rel)
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, body)
}

try {
  write("src/theme.ts", `
// RULING: controls never share the container background — same-on-same reads as bare outlines
export const x = 1
`)
  write("src/api.py", `
# DECISION: all write endpoints require an idempotency key on retryable verbs
def handler(): pass
`)
  write("src/legacy.ts", `
/* WHY: this adapter stays until the roster migration lands in Q3 */
export const y = 2
`)
  // Noise that must NOT become law.
  write("src/todo.ts", `
// RULING: tbd
// TODO: decide later
export const z = 3
`)
  write("docs/guide.md", `
Example of how to record one:

\`\`\`ts
// RULING: this is only an illustration and must not be captured
\`\`\`
`)
  // Same ruling written in two files → one record governing both.
  write("src/a.ts", `// RULING: every mutation goes through the audit log wrapper\n`)
  write("src/b.ts", `// RULING: every mutation goes through the audit log wrapper\n`)

  const markers = scanMarkers(root, ["src", "docs"])
  const find = (frag) => markers.find((m) => m.statement.toLowerCase().includes(frag))

  ok("finds a // RULING marker", !!find("container background"), JSON.stringify(markers.map((m) => m.statement)))
  ok("finds a # DECISION marker in Python", !!find("idempotency key"))
  ok("finds a /* WHY marker", !!find("roster migration"))
  ok("a marker with no real statement is skipped", !find("tbd"))
  ok("a marker inside fenced markdown is NOT captured", !find("illustration"),
    JSON.stringify(markers.map((m) => m.statement)))

  const dup = find("audit log wrapper")
  ok("the same ruling in two files becomes ONE record", !!dup && dup.governs.length === 2,
    JSON.stringify(dup))

  const themed = find("container background")
  ok("a ruling governs the file it was written in", themed.governs[0] === "src/theme.ts")
  ok("it records the line", themed.line > 0)
  ok("ids are stable across runs",
    scanMarkers(root, ["src"]).find((m) => m.statement.includes("container"))?.id === themed.id)

  // ── documents ──────────────────────────────────────────────────────────────
  write("docs/decisions/0001-use-postgres.md", `# Use Postgres over Mongo\n\nStatus: Accepted\n`)
  write("docs/decisions/0002-draft.md", `# Split the billing service\n\nStatus: Proposed\n`)
  write("docs/decisions/0003-old.md", `# Use REST\n\nStatus: Superseded\n`)
  write("docs/decisions/0004-unknown.md", `# Something\n\nNo status line here.\n`)
  const docs = scanDocs(root)
  const byTitle = (t) => docs.find((d) => d.statement.includes(t))
  ok("reads ADR titles", !!byTitle("Postgres"), JSON.stringify(docs.map((d) => d.statement)))
  ok("Accepted maps to active", byTitle("Postgres").status === "active")
  ok("Proposed stays proposed", byTitle("billing service").status === "proposed")
  ok("Superseded is preserved", byTitle("REST").status === "superseded")
  /**
   * An unreadable status must not become `active`. A document whose status we
   * can't parse is not thereby current law.
   */
  ok("an unrecognised status defaults to proposed, never active",
    byTitle("Something").status === "proposed")

  // ── governance lookup ──────────────────────────────────────────────────────
  const hits = rulingsFor(markers, ["src/theme.ts"])
  ok("looks up rulings by changed file", hits.length === 1 && hits[0].id === themed.id)
  ok("an unrelated file matches nothing", rulingsFor(markers, ["src/unrelated.ts"]).length === 0)
  ok("a ruling governing two files matches either",
    rulingsFor(markers, ["src/b.ts"]).some((r) => r.id === dup.id))

  // ── state ──────────────────────────────────────────────────────────────────
  ok("a ruling whose file exists is current", rulingState(root, themed) === "current")
  ok("a ruling whose files are all gone is `gone`",
    rulingState(root, { governs: ["src/deleted.ts"] }) === "gone")
  ok("a ruling governing no file is unanchored, not gone",
    rulingState(root, { governs: [] }) === "unanchored")
  /**
   * Deliberately NOT the audited staleness score, which decays a rule as its
   * area gets busy. A rule nobody has broken must not fade out for being in a
   * popular file.
   */
  ok("a rule in a busy file does not decay merely for being edited",
    rulingState(root, themed) === "current")

  // ── robustness ─────────────────────────────────────────────────────────────
  ok("a missing root doesn't throw", scanMarkers(root, ["nope"]).length === 0)
  ok("a repo with no decisions returns none, without inventing any",
    scanDocs(mkdtempSync(path.join(os.tmpdir(), "synclair-empty-"))).length === 0)
} finally {
  rmSync(root, { recursive: true, force: true })
}

if (failures.length) {
  console.log(`check:rulings self-test — ${failures.length} failure(s):`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`check:rulings self-test: ${pass} checks passed (markers, ADRs, governance, state).`)
