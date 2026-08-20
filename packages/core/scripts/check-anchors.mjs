#!/usr/bin/env node
/**
 * check:anchors — are this hub's distilled claims still supported by their sources?
 *
 * `check:knowledge` asks whether a source MOVED. This asks whether the passage a
 * digest actually cited still says what it said. Those come apart constantly: a
 * spec can sit unchanged while the one paragraph a digest rested on gets
 * reversed, and nothing today would notice.
 *
 * No model, no network, no git. Just: read the digest's cited passages, find
 * them in the source, and report a verdict. Cheap enough for `verify-ui`.
 *
 * NON-FATAL by default, like `check:ux-docs` — an unverified claim is a prompt
 * to re-read one paragraph, not a build break. `--strict` for a gate.
 *
 * ANCHORS ARE OPTIONAL EVERYWHERE. A digest with none is `unanchored`, never
 * `stale` and never a failure. That is what lets this land in an existing clone
 * without turning every digest written before today into a finding.
 *
 *   npm run check:anchors
 *   npm run check:anchors -- --json
 *   npm run check:anchors -- --update   re-record hashes from the sources as they stand
 *   npm run check:anchors -- --strict   exit 1 if any claim is unverified
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { parseAnchors, reanchor, verifyAnchor } from "./lib/anchors.mjs"
import { emitJson } from "./lib/emit.mjs"
import { resolveTarget } from "./lib/topology.mjs"

const HUB_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const hostRoot = resolveTarget(HUB_ROOT).hostRoot ?? HUB_ROOT

const args = process.argv.slice(2)
const asJson = args.includes("--json")
const strict = args.includes("--strict")
const update = args.includes("--update")

/**
 * Every in-repo digest, found the same way the hub finds them: skills carry
 * their references alongside. No manifest to keep in sync.
 */
function digests() {
  const out = []
  const skillsDir = path.join(HUB_ROOT, ".claude", "skills")
  if (!existsSync(skillsDir)) return out
  const walk = (dir, depth = 0) => {
    if (depth > 6) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p, depth + 1)
      else if (e.name.endsWith(".md")) out.push(p)
    }
  }
  walk(skillsDir)
  return out
}

const results = []
let updatedFiles = 0

for (const file of digests()) {
  let text
  try {
    text = readFileSync(file, "utf8")
  } catch {
    continue
  }
  const anchors = parseAnchors(text)
  if (anchors.length === 0) continue // unanchored — not a finding

  if (update) {
    const { text: next, updated } = reanchor(text, hostRoot)
    if (updated > 0 && next !== text) {
      writeFileSync(file, next)
      updatedFiles++
      text = next
    }
  }

  const rel = path.relative(HUB_ROOT, file)
  for (const a of parseAnchors(text)) {
    results.push({ digest: rel, ...a, ...verifyAnchor(hostRoot, a) })
  }
}

const counts = { exact: 0, fuzzy: 0, unverified: 0 }
for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1

const report = { checkedAt: new Date().toISOString(), counts, claims: results }

if (asJson) emitJson(report, strict && counts.unverified > 0 ? 1 : 0)

if (update) {
  console.log(`check:anchors — re-recorded hashes in ${updatedFiles} digest(s).`)
  process.exit(0)
}

if (results.length === 0) {
  // The honest empty state. A clone whose digests carry no anchors has work
  // available, not a problem — and saying "0 claims verified" would read as a
  // failure in every clone that predates this check.
  console.log(
    `check:anchors — no digest cites its sources yet. Nothing to verify.\n`
    + `  Add an \`anchors:\` block to a digest's frontmatter to start:\n`
    + `    anchors:\n      - source: .prds/Billing_PRD.md\n        section: Pricing\n        quote: 'Seats are billed monthly in arrears'`
  )
  process.exit(0)
}

const glyph = { exact: "✓", fuzzy: "~", unverified: "✗" }
for (const r of results) {
  if (r.verdict === "exact") continue
  console.log(`  ${glyph[r.verdict]} ${r.digest}`)
  console.log(`      ${r.source} › “${r.section}” — ${r.detail}`)
}

console.log(
  `\n${counts.exact} exact · ${counts.fuzzy} reworded · ${counts.unverified} unverified`
)
if (counts.fuzzy) {
  console.log(`\n  "Reworded" is not a problem — the source says the same thing differently.`)
  console.log(`  Re-record it with: npm run check:anchors -- --update`)
}
if (counts.unverified) {
  console.log(`\n  ${counts.unverified} claim(s) rest on a passage that is gone or changed beyond recognition.`)
  console.log(`  Re-read those sections before trusting the digest (product-spec skill).`)
}

process.exit(strict && counts.unverified > 0 ? 1 : 0)
