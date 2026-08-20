#!/usr/bin/env node
/**
 * GIT MERGE DRIVER for Synclair's derived digests.
 *
 * These files are generated, so a textual three-way merge is the wrong tool for
 * them. Two developers who each add an endpoint and re-index locally produce
 * conflicting hunks in `data/system-map.json` — not because their work
 * disagrees, but because two machines wrote overlapping regions of a sorted
 * array. Resolving that by hand means editing JSON at a conflict marker, which
 * is exactly the task most likely to produce a file that parses and lies.
 *
 * The correct resolution for a derived file is never "pick a side". It is
 * "combine what both sides recorded, then let the scan decide what is true".
 * So this driver:
 *
 *   1. UNIONS the authored content from both sides — every endpoint row either
 *      developer had, deduplicated by (method, path, source), preferring
 *      whichever copy carries prose so nobody's written summary is dropped.
 *   2. Takes the higher-information provenance and lets the next `scan:system`
 *      re-anchor it, which the post-merge hook and CI both do.
 *
 * Never invents. If either side is unparseable it exits non-zero and git leaves
 * the normal conflict markers — a driver that silently produces a plausible
 * file from a broken input is worse than one that gives up loudly.
 *
 * Registered by `npm run install:hooks` (git requires the driver to be
 * configured locally; .gitattributes alone cannot execute anything).
 *
 *   node scripts/merge-digest.mjs %O %A %B %P
 */

import { readFileSync, writeFileSync } from "node:fs"

const [, , , ours, theirs, placeholder] = process.argv
const target = process.argv[3] // %A — git wants the result written here

const read = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

const a = read(ours)
const b = read(theirs)
if (!a || !b) {
  console.error(
    `synclair: cannot merge ${placeholder ?? "digest"} — one side is not valid JSON. ` +
      `Leaving conflict markers for a human.`
  )
  process.exit(1)
}

/** Prefer the row that carries prose; a blank summary must never overwrite one. */
const richer = (x, y) => {
  if (!x) return y
  if (!y) return x
  const score = (r) => (r.summary ? 2 : 0) + (r.details ? 1 : 0)
  return score(y) > score(x) ? y : x
}

/** Union a list of records by a stable key, keeping the richer duplicate. */
const unionBy = (listA, listB, keyOf) => {
  const out = new Map()
  for (const r of [...(listA ?? []), ...(listB ?? [])]) {
    const k = keyOf(r)
    out.set(k, richer(out.get(k), r))
  }
  return [...out.values()]
}

const merged = { ...a, ...b }

// Endpoints: keyed with the source, because two services legitimately expose
// the same method and path.
if (Array.isArray(a.api) || Array.isArray(b.api)) {
  merged.api = unionBy(a.api, b.api, (e) => `${e.method} ${e.path} ${e.source}`).sort(
    (x, y) => String(x.path).localeCompare(String(y.path)) || String(x.method).localeCompare(String(y.method))
  )
}
if (Array.isArray(a.data) || Array.isArray(b.data)) {
  merged.data = unionBy(a.data, b.data, (d) => `${d.name}|${d.source ?? ""}`)
}
if (Array.isArray(a.areas) || Array.isArray(b.areas)) {
  merged.areas = unionBy(a.areas, b.areas, (x) => x.path ?? x.name)
}
// Routes, when pointed at pages-map.json.
//
// This case was MISSING while `.gitattributes` already routed pages-map here,
// which made the driver strictly worse than no driver: an unrecognised shape
// falls through to `{...a, ...b}`, so one developer's whole `pages` array
// replaced the other's — silently, with git reporting a clean merge.
//
// Found by merging two branches that had each added a page: the second one
// simply wasn't there afterwards. Keyed by (surface, route) because two
// frontends legitimately serve the same path.
if (Array.isArray(a.pages) || Array.isArray(b.pages)) {
  merged.pages = unionBy(
    a.pages,
    b.pages,
    (p) => `${p.surface ?? ""} ${p.route}`
  ).sort(
    (x, y) =>
      String(x.surface ?? "").localeCompare(String(y.surface ?? "")) ||
      String(x.route).localeCompare(String(y.route))
  )
}
// The per-surface roots travel with the pages that resolve against them.
if (Array.isArray(a.repos) || Array.isArray(b.repos)) {
  merged.repos = unionBy(a.repos, b.repos, (r) => r.surface ?? r.root ?? r.name)
}
// Contract links, when this driver is pointed at contracts.json.
if (Array.isArray(a.links) || Array.isArray(b.links)) {
  merged.links = unionBy(
    a.links,
    b.links,
    (l) => `${l.method} ${l.path} ${l.consumer}`
  )
}
// Hygiene findings. Unioned rather than taken from one side: this digest is
// regenerated wholesale, so either side alone is a valid answer — but a union
// keeps whichever findings each developer's tree could see, and the next scan
// replaces the lot anyway. A real merge surfaced this one: it was the only
// derived file not covered by this driver, and it conflicted first time out.
if (Array.isArray(a.findings) || Array.isArray(b.findings)) {
  merged.findings = unionBy(
    a.findings,
    b.findings,
    (f) => `${f.rule}|${f.hostPath}|${f.line ?? ""}`
  )
}

/**
 * Provenance is re-derived, not merged. Whichever anchor survives here is
 * provisional: the hash no longer describes this combined file, and the next
 * scan replaces it. Marking it explicitly beats leaving a stale hash that reads
 * as a verified one — `check:freshness` will report `stale` until a scan runs,
 * which is the honest state of a just-merged digest.
 */
if (merged.provenance) {
  merged.provenance = { ...merged.provenance, sourceHash: undefined, confidence: "medium" }
  delete merged.provenance.sourceHash
}

writeFileSync(target, `${JSON.stringify(merged, null, 2)}\n`)
const rows = Array.isArray(merged.api) ? merged.api.length : (merged.links?.length ?? 0)
console.error(
  `synclair: merged ${placeholder ?? "digest"} by union (${rows} records). ` +
    `Re-anchor with \`cd synclair && npm run scan:system -- --write\`.`
)
process.exit(0)
