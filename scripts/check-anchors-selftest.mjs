#!/usr/bin/env node
/**
 * SELF-TEST for claim anchors (scripts/lib/anchors.mjs).
 *
 * The verdicts have to survive the two things specs actually do: get reworded
 * without changing meaning, and get reversed while looking similar. A checker
 * that shouts at every reflow is switched off within a week; one that calls a
 * reversal "fine" is worse than nothing.
 *
 * Hermetic: fixture files in a temp dir. No network, no git.
 *
 *   node scripts/check-anchors-selftest.mjs [--verbose]
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { currentHash, overlap, parseAnchors, reanchor, sectionBody, verifyAnchor } from "./lib/anchors.mjs"

const verbose = process.argv.includes("--verbose")
let pass = 0
const failures = []
const ok = (n, c, d = "") => {
  if (c) {
    pass++
    if (verbose) console.log(`  ✓ ${n}`)
  } else failures.push(`${n}${d ? ` — ${d}` : ""}`)
}

const root = mkdtempSync(path.join(os.tmpdir(), "synclair-anchors-"))
const write = (rel, body) => {
  const p = path.join(root, rel)
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, body)
  return p
}

const SPEC = `---
title: Billing
---

# Pricing

Seats are billed monthly in arrears. Enterprise plans may negotiate net-30 terms.

# Refunds

Refunds are issued to the original payment method within ten days.
`

try {
  write("spec.md", SPEC)

  // ── parsing ────────────────────────────────────────────────────────────────
  const digest = `---
anchors:
  - source: spec.md
    section: Pricing
    quote: 'Seats are billed monthly in arrears'
    hash: deadbeef
  - source: spec.md
    section: Refunds
---

# Digest
`
  const parsed = parseAnchors(digest)
  ok("parses multiple anchors", parsed.length === 2, JSON.stringify(parsed))
  ok("reads the quote", parsed[0].quote === "Seats are billed monthly in arrears")
  ok("an anchor without a quote still parses", parsed[1].section === "Refunds" && !parsed[1].quote)
  ok("a digest with no frontmatter yields none", parseAnchors("# Just a doc\n").length === 0)
  ok("frontmatter without an anchors block yields none",
    parseAnchors("---\ntitle: x\n---\n\n# D\n").length === 0)

  ok("finds a section body", /arrears/.test(sectionBody(SPEC, "Pricing") ?? ""))
  ok("a missing section is null", sectionBody(SPEC, "Nope") === null)

  // ── verdicts ───────────────────────────────────────────────────────────────
  const A = { source: "spec.md", section: "Pricing", quote: "Seats are billed monthly in arrears" }
  ok("an intact quote is exact", verifyAnchor(root, A).verdict === "exact")

  // Reworded, same meaning.
  write("spec.md", SPEC.replace(
    "Seats are billed monthly in arrears.",
    "Seats are billed in arrears, monthly."
  ))
  let v = verifyAnchor(root, A)
  ok("a reworded passage is fuzzy, not a failure", v.verdict === "fuzzy", JSON.stringify(v))
  ok("and it asks for a glance rather than declaring it fine",
    /still present/.test(v.detail) && /confirm/.test(v.detail), v.detail)

  // Reversed — the case that must NOT read as fine.
  write("spec.md", SPEC.replace(
    "Seats are billed monthly in arrears. Enterprise plans may negotiate net-30 terms.",
    "Billing was removed entirely; the product is now free for all tiers."
  ))
  v = verifyAnchor(root, A)
  ok("a REVERSED passage is unverified, never fuzzy", v.verdict === "unverified", JSON.stringify(v))

  // Heading gone.
  write("spec.md", SPEC.replace("# Pricing", "# Plans and Pricing"))
  v = verifyAnchor(root, A)
  ok("a renamed heading is unverified", v.verdict === "unverified", JSON.stringify(v))
  ok("and it names the heading it looked for", /Pricing/.test(v.detail))

  // Source gone.
  v = verifyAnchor(root, { source: "nope.md", section: "X", quote: "y" })
  ok("a missing source is unverified, not a crash", v.verdict === "unverified")

  // ── hash-only anchors ──────────────────────────────────────────────────────
  write("spec.md", SPEC)
  const h = currentHash(root, { source: "spec.md", section: "Refunds" })
  ok("a hash can be computed", typeof h === "string" && h.length === 16, String(h))
  ok("a matching hash with no quote is exact",
    verifyAnchor(root, { source: "spec.md", section: "Refunds", hash: h }).verdict === "exact")

  write("spec.md", SPEC.replace("within ten days", "within thirty days"))
  v = verifyAnchor(root, { source: "spec.md", section: "Refunds", hash: h })
  ok("a changed section with NO quote is unverified, not an unearned 'fuzzy'",
    v.verdict === "unverified", JSON.stringify(v))
  ok("and it says why a quote would have helped", /quote/.test(v.detail))

  v = verifyAnchor(root, { source: "spec.md", section: "Refunds" })
  ok("an anchor with neither quote nor hash is unverified with an instruction",
    v.verdict === "unverified" && /--update/.test(v.detail), JSON.stringify(v))

  // Whitespace must not matter — the reflow trap again.
  write("spec.md", SPEC.split("\n").map((l) => l + "  ").join("\n"))
  ok("a whitespace-only reflow stays exact",
    verifyAnchor(root, A).verdict === "exact",
    JSON.stringify(verifyAnchor(root, A)))

  // ── overlap ────────────────────────────────────────────────────────────────
  ok("identical text overlaps fully", overlap("alpha beta gamma", "alpha beta gamma") === 1)
  ok("unrelated text overlaps near zero", overlap("alpha beta", "zulu yankee") < 0.2)
  ok("stopwords don't inflate the score", overlap("the of and", "the of and") === 1)
  /**
   * The bug this replaced: a short quote inside a long section scored 0.40 under
   * Jaccard and read as a reversal.
   */
  ok("a short quote inside a much longer passage still scores 1",
    overlap("seats billed monthly arrears",
      "seats are billed in arrears, monthly. enterprise plans may negotiate net-30 terms and other things entirely") === 1)

  // ── reanchor ───────────────────────────────────────────────────────────────
  write("spec.md", SPEC)
  const dpath = write("digest.md", digest)
  const { text: next, updated } = reanchor(readFileSync(dpath, "utf8"), root)
  ok("reanchor rewrites a stale hash", updated >= 1 && !next.includes("deadbeef"),
    `updated=${updated}`)
  /**
   * Re-PARSE rather than counting `hash:` occurrences. The weaker assertion
   * passed while reanchor was fusing the hash onto the following line, producing
   * `hash: <sha>quote: '...'` — a corrupt block that still contained "hash:".
   */
  const reparsed = parseAnchors(next)
  ok("reanchor adds a hash to an anchor that had none",
    reparsed.length === 2 && reparsed.every((a) => /^[0-9a-f]{16}$/.test(a.hash ?? "")),
    JSON.stringify(reparsed))
  ok("reanchor does not corrupt the neighbouring fields",
    reparsed[0].quote === "Seats are billed monthly in arrears", JSON.stringify(reparsed[0]))
  ok("every anchor still verifies after reanchoring",
    reparsed.every((a) => verifyAnchor(root, a).verdict === "exact"),
    JSON.stringify(reparsed.map((a) => verifyAnchor(root, a))))
  ok("reanchor leaves the body alone", next.includes("# Digest"))
  ok("re-running reanchor is a no-op", reanchor(next, root).updated === 0)
} finally {
  rmSync(root, { recursive: true, force: true })
}

if (failures.length) {
  console.log(`check:anchors self-test — ${failures.length} failure(s):`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`check:anchors self-test: ${pass} checks passed (parsing, three verdicts, reanchoring).`)
