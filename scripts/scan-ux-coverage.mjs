#!/usr/bin/env node
/**
 * UX-DOC COVERAGE — which documented facts the source can prove are missing.
 *
 * `check:ux-docs` already answers "have the docs gone stale since the source
 * moved" (sha256 anchors, a queue the ux-doc-writer drains). It cannot answer
 * the other question: whether the docs were ever COMPLETE. A doc written when a
 * component had two variants stays perfectly fresh after a third is added — the
 * anchor moves, the gap doesn't show.
 *
 * Two things are mechanically checkable, and only two:
 *
 *   VARIANTS   `cva` declares every variant group and value. If the source
 *              offers `size: sm | lg` and the docs never mention `lg`, that is
 *              a fact, not an opinion.
 *   SECTIONS   whether a `.docs.tsx` has the sections its TIER requires
 *              (components stay light; blocks and templates carry the anatomy,
 *              interaction and responsive load per the ux-doc skill).
 *
 * Everything else a UX doc is for — what the thing is FOR, when to reach for it,
 * how it should behave — is judgment and isn't graded here. This reports gaps
 * for the ux-doc-writer to fill; it never writes docs and never fails a build by
 * default. Documentation debt is triage, not corruption.
 *
 *   node scripts/scan-ux-coverage.mjs            report
 *   node scripts/scan-ux-coverage.mjs --strict   exit 1 on gaps (CI)
 *   node scripts/scan-ux-coverage.mjs --json     machine-readable
 */

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const args = process.argv.slice(2)
const strict = args.includes("--strict")
const asJson = args.includes("--json")

const read = (rel) => (existsSync(path.join(ROOT, rel)) ? readFileSync(path.join(ROOT, rel), "utf8") : null)

const registry = (() => {
  const raw = read("registry.json")
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (e) {
    console.error(`registry.json unreadable: ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  }
})()

if (!registry?.items?.length) {
  console.log("UX coverage: registry is empty — nothing to check.")
  process.exit(0)
}

/**
 * Depth expected per tier, from the ux-doc skill. A component is often a single
 * element and doesn't need an anatomy wireframe; a template is a whole screen
 * and does. Grading them the same would just teach people to ignore the check.
 */
const REQUIRED = {
  component: ["intent"],
  block: ["intent", "anatomy", "interactions"],
  template: ["intent", "anatomy", "interactions", "responsive"],
}

const tierOf = (type) =>
  type?.includes("block") ? "block" : type?.includes("template") ? "template" : "component"

/** Variant groups and values declared by a cva() call. */
function variantsOf(src) {
  if (!src) return {}
  const at = src.indexOf("variants:")
  if (at === -1) return {}
  // Walk braces from `variants: {` so nested value objects are captured whole.
  const open = src.indexOf("{", at)
  if (open === -1) return {}
  let depth = 0
  let end = -1
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end === -1) return {}
  const body = src.slice(open + 1, end)

  const out = {}
  const groupRe = /(\w+)\s*:\s*\{/g
  let m
  while ((m = groupRe.exec(body)) !== null) {
    const gName = m[1]
    let d = 1
    let i = m.index + m[0].length
    const start = i
    for (; i < body.length && d > 0; i++) {
      if (body[i] === "{") d++
      else if (body[i] === "}") d--
    }
    const inner = body.slice(start, i - 1)
    const values = [...inner.matchAll(/(?:^|\n)\s*["']?([\w-]+)["']?\s*:/g)].map((v) => v[1])
    if (values.length) out[gName] = values
    groupRe.lastIndex = i
  }
  return out
}

// ------------------------------------------------------------------- assess

const rows = []
for (const item of registry.items) {
  const tier = tierOf(item.type)
  const srcPath = item.files?.[0]?.path
  const src = srcPath ? read(srcPath) : null
  const docsPath = item.docs
  const docs = docsPath ? read(docsPath) : null

  const variants = variantsOf(src)
  const undocumented = []
  if (docs) {
    for (const [group, values] of Object.entries(variants)) {
      for (const v of values) {
        // A variant counts as documented if it's named anywhere in the doc —
        // prose, an example, or a props table. Deliberately generous: the point
        // is to catch what was never mentioned at all.
        if (!new RegExp(`\\b${v}\\b`).test(docs)) undocumented.push(`${group}.${v}`)
      }
    }
  }

  const missingSections = docs
    ? (REQUIRED[tier] ?? []).filter((s) => !new RegExp(`\\b${s}\\s*:`).test(docs))
    : REQUIRED[tier] ?? []

  if (!docs || undocumented.length || missingSections.length) {
    rows.push({
      name: item.name,
      tier,
      hasDocs: Boolean(docs),
      variantCount: Object.values(variants).reduce((n, v) => n + v.length, 0),
      undocumented,
      missingSections,
    })
  }
}

if (asJson) {
  console.log(JSON.stringify({ checked: registry.items.length, gaps: rows }, null, 2))
  process.exit(strict && rows.length ? 1 : 0)
}

console.log(`\nUX-doc coverage — ${registry.items.length} registered item(s)`)

if (!rows.length) {
  console.log("  Every item documents its variants and carries the sections its tier needs.\n")
  process.exit(0)
}

console.log(`  ${rows.length} item(s) with a checkable gap:\n`)
for (const r of rows) {
  const bits = []
  if (!r.hasDocs) bits.push("no docs file")
  if (r.missingSections.length) bits.push(`missing: ${r.missingSections.join(", ")}`)
  if (r.undocumented.length) bits.push(`undocumented variants: ${r.undocumented.join(", ")}`)
  console.log(`  ${r.name.padEnd(22)} ${r.tier.padEnd(9)} ${bits.join(" · ")}`)
}

console.log(
  `\n  Only two things are graded here: variants the source declares, and the`
  + `\n  sections a tier requires. Whether the prose is any GOOD is the`
  + `\n  doc-quality skill's call, not this script's.`
  + `\n  Freshness is separate — that's check:ux-docs.\n`
)

process.exit(strict ? 1 : 0)
