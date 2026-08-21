#!/usr/bin/env node
/**
 * RANK hygiene findings by BLAST RADIUS instead of by count.
 *
 * `scan:hygiene` answers "where does the host step outside its own foundation",
 * and ranks the answer by how many findings each file has. That ordering is easy
 * to compute and quietly wrong as a work list: a screen with 19 raw hex values
 * that one route renders matters less than a shared primitive with 4, sitting
 * under thirty pages.
 *
 * Reach is already knowable without any dependency graph — `pages-map.json`
 * records each page's source files and the catalog items it composes. This walks
 * those edges:
 *
 *   direct     the offending file IS a page's source file
 *   composed   the offending file is a cataloged item that pages compose
 *
 * REACH UNKNOWN IS NOT REACH ZERO. A hygiene report can cover several hosts
 * while the pages map covers one, so plenty of files have no computable reach.
 * Ranking those last would bury them under files we merely proved unimportant —
 * so they sort ABOVE known-zero, and say why. Same rule as `unanchored` in
 * lib/system/provenance.ts: never assert a verdict the data can't support.
 *
 *   node scripts/rank-hygiene.mjs           ranked triage list
 *   node scripts/rank-hygiene.mjs --json    machine-readable
 *   node scripts/rank-hygiene.mjs --top 20  how many to show (default 15)
 */

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const args = process.argv.slice(2)
const asJson = args.includes("--json")
const topN = Number(args[args.indexOf("--top") + 1]) || 15

function readJson(rel) {
  const p = path.join(ROOT, rel)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, "utf8"))
  } catch (e) {
    console.error(`${rel} unreadable: ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  }
}

const hygiene = readJson(".synclair/cache/host-hygiene.json")
if (!hygiene?.topFiles?.length) {
  console.log(
    "Hygiene ranking: no scan on record — run `npm run scan:hygiene` first."
  )
  process.exit(0)
}

const pages = readJson("data/pages-map.json")
const catalog = readJson("data/external-catalog.json")

// ------------------------------------------------------------ reach indexes

const pageNodes = pages?.pages ?? []
/** source file → routes that are built from it */
const bySourceFile = new Map()
for (const pg of pageNodes) {
  for (const f of pg.sourceFiles ?? []) {
    if (!bySourceFile.has(f)) bySourceFile.set(f, [])
    bySourceFile.get(f).push(pg.route)
  }
}
/** catalog item name → routes that compose it */
const byItem = new Map()
for (const pg of pageNodes) {
  for (const it of pg.items ?? []) {
    if (!byItem.has(it.name)) byItem.set(it.name, [])
    byItem.get(it.name).push(pg.route)
  }
}
/** host path → catalog entry */
const catByPath = new Map((catalog?.items ?? []).map((i) => [i.hostPath, i]))

/**
 * Which host does the pages map describe? Anything outside it can't have its
 * reach computed here, and saying so is the point.
 */
const mappedHost = pages?.repo?.root ?? null

function reachOf(hostPath) {
  const direct = bySourceFile.get(hostPath)
  if (direct?.length) return { known: true, pages: direct.length, via: "direct", routes: direct }

  const item = catByPath.get(hostPath)
  if (item) {
    const composed = byItem.get(item.name) ?? []
    return {
      known: true,
      pages: composed.length,
      via: "composed",
      item: item.name,
      routes: composed,
    }
  }

  if (!pageNodes.length) return { known: false, why: "no pages map in this clone" }
  return {
    known: false,
    why: mappedHost
      ? `not reachable from the mapped host (${mappedHost})`
      : "not found in the pages map or the catalog",
  }
}

// -------------------------------------------------------------------- rank

const ranked = hygiene.topFiles.map((f) => ({
  hostPath: f.hostPath,
  findings: f.count,
  byRule: f.byRule,
  reach: reachOf(f.hostPath),
}))

/**
 * Order: known-reach descending, then unknowns, then known-zero. Unknown sits
 * above proven-zero deliberately — "we couldn't tell" is a worse reason to
 * ignore something than "we checked and nothing uses it".
 */
const bucket = (r) => (r.reach.known ? (r.reach.pages > 0 ? 0 : 2) : 1)
ranked.sort((a, b) => {
  const ba = bucket(a)
  const bb = bucket(b)
  if (ba !== bb) return ba - bb
  if (ba === 0) {
    // Reach first, then finding count — a widely used file with fewer problems
    // still outranks a one-off with many.
    if (b.reach.pages !== a.reach.pages) return b.reach.pages - a.reach.pages
  }
  return b.findings - a.findings
})

if (asJson) {
  console.log(JSON.stringify({ rankedBy: "blast-radius", files: ranked }, null, 2))
  process.exit(0)
}

const known = ranked.filter((r) => r.reach.known)
const unknown = ranked.length - known.length

console.log(
  `\nHygiene by blast radius — ${hygiene.totals?.findings ?? "?"} findings across `
  + `${hygiene.totals?.files ?? "?"} files`
)
console.log(
  `Ranked by how many pages consume each file, not by how many findings it has.\n`
)

for (const r of ranked.slice(0, topN)) {
  const rules = Object.entries(r.byRule ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${id}×${n}`)
    .join(" ")
  const reach = r.reach.known
    ? r.reach.pages > 0
      ? `${r.reach.pages} page${r.reach.pages === 1 ? "" : "s"}`
        + (r.reach.via === "composed" ? ` via ${r.reach.item}` : "")
      : "no page uses it"
    : "reach unknown"
  console.log(`  ${String(r.findings).padStart(3)} findings · ${reach}`)
  console.log(`      ${r.hostPath}`)
  console.log(`      ${rules}`)
  if (!r.reach.known) console.log(`      (${r.reach.why})`)
}

if (unknown) {
  console.log(
    `\n  ${unknown} file(s) have no computable reach and are ranked above proven-unused,`
    + `\n  not below — an unknown is not a zero. Map that host's pages to resolve them.`
  )
}
