#!/usr/bin/env node
/**
 * status — one derived read of the hub's own condition.
 *
 * `/synclair/reports` is agent-written: a considered read, but it cannot be
 * recomputed, so it ages exactly like everything it describes. This is the
 * complement, not the replacement — the NUMBERS become derived, the
 * interpretation stays authored.
 *
 * It also surfaces something the hub has recorded since Phase 1 and never
 * shown: `provenance.generator` and `provenance.confidence`. A fact a scanner
 * derived and a sentence a person wrote eight months ago render identically
 * today, so readers discount all of it equally. Naming which is which is most of
 * what "how sure is the hub" needs.
 *
 * No model, no network. Safe on a hook.
 *
 *   npm run status
 *   npm run status -- --json
 */

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { emitJson } from "./lib/emit.mjs"
import { buildGraph } from "./lib/edges.mjs"

const HUB_ROOT = process.cwd() // the hub root is the CALLER'S cwd (the CLI guarantees it) — never derived from import.meta.url, which points into the core package
const asJson = process.argv.includes("--json")

const readJson = (rel) => {
  const p = path.join(HUB_ROOT, rel)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

const catalog = readJson("data/external-catalog.json")
const registry = readJson("registry.json")
const pages = readJson("data/pages-map.json")
const knowledge = readJson(".synclair/cache/knowledge/freshness.json")
const contracts = readJson(".synclair/cache/contracts.json")
const system = readJson("data/system-map.json")

/**
 * Every artifact reports the same four things, in the same vocabulary, so the
 * page reads as one system rather than six unrelated scorecards.
 *
 * `blank` is a first-class answer and is NEVER rendered as 0%. A fresh clone has
 * generated nothing, and scoring that as "0% documented" would be the most
 * discouraging possible first impression of a tool whose whole job is honesty
 * about what it does and does not know.
 */
function artifact(name, present, total, covered, provenance) {
  return {
    name,
    state: !present ? "blank" : total === 0 ? "empty" : "populated",
    total,
    covered,
    coverage: !present || total === 0 ? null : covered / total,
    generator: provenance?.generator ?? null,
    confidence: provenance?.confidence ?? null,
  }
}

const catalogItems = catalog?.items ?? []
const registryItems = registry?.items ?? []
const pageList = pages?.pages ?? []
const sources = knowledge?.sources ?? []

const rows = [
  artifact(
    "Component catalog",
    !!catalog,
    catalogItems.length,
    // "Documented" means a human wrote what it is for — not merely that a
    // scanner found the file.
    catalogItems.filter((i) => i.description || i.notes).length,
    catalog?.provenance
  ),
  artifact("Registry (native)", !!registry, registryItems.length,
    registryItems.filter((i) => i.description).length, registry?.provenance),
  artifact("Pages", !!pages, pageList.length,
    pageList.filter((p) => p.summary).length, pages?.provenance),
  artifact("Knowledge sources", !!knowledge, sources.length,
    sources.filter((s) => s.distilledInto).length, null),
  artifact("System map areas", !!system, (system?.areas ?? []).length,
    (system?.areas ?? []).filter((a) => a.summary).length, system?.provenance),
]

/** The seam is derived, so it reports differently: linked vs total endpoints. */
const seam = contracts
  ? {
      state: "populated",
      providers: contracts.providers?.length ?? 0,
      links: contracts.links?.length ?? 0,
      orphansAsserted: contracts.diagnostics?.orphanProviders !== null,
      why: contracts.diagnostics?.orphanConfidence?.why ?? null,
    }
  : { state: "blank" }

let graph = { files: 0, items: 0, pages: 0 }
try {
  graph = buildGraph(HUB_ROOT).counts
} catch {
  /* a blank clone has no edges — not an error */
}

const knowledgeStates = {}
for (const s of sources) knowledgeStates[s.state] = (knowledgeStates[s.state] ?? 0) + 1

const report = { generatedAt: new Date().toISOString(), artifacts: rows, seam, graph, knowledgeStates }

if (asJson) emitJson(report)

const pct = (v) => (v === null ? "  —  " : `${String(Math.round(v * 100)).padStart(3)}%`)

console.log(`\nSynclair status — derived, recomputable, no model involved\n`)
console.log(`  ${"Artifact".padEnd(22)} ${"Items".padStart(6)}  ${"Written".padStart(7)}  Source`)
for (const r of rows) {
  if (r.state === "blank") {
    // Say "not generated yet", never a number. Zero is a measurement; blank is
    // the absence of one, and the difference decides whether someone panics.
    console.log(`  ${r.name.padEnd(22)} ${"—".padStart(6)}  ${"—".padStart(7)}  not generated yet`)
    continue
  }
  /**
   * No provenance recorded is NOT "authored" — it is unknown. Artifacts written
   * before the field existed carry nothing, and printing a confident "authored"
   * for them would be the exact failure this column exists to fix: asserting
   * how a fact got here when we cannot tell.
   */
  const src = r.generator
    ? `${r.generator}${r.confidence ? ` (${r.confidence})` : ""}`
    : "unrecorded"
  console.log(`  ${r.name.padEnd(22)} ${String(r.total).padStart(6)}  ${pct(r.coverage).padStart(7)}  ${src}`)
}

console.log(`\n  Edges: ${graph.files} file(s) → ${graph.items} item(s) → ${graph.pages} page(s)`)

if (seam.state === "populated") {
  console.log(`  Seam:  ${seam.links} call(s) linked to ${seam.providers} endpoint(s)`)
  if (!seam.orphansAsserted) console.log(`         unused-endpoint check withheld — ${seam.why}`)
} else {
  console.log(`  Seam:  not generated yet (npm run scan:contracts -- --write)`)
}

if (Object.keys(knowledgeStates).length) {
  console.log(
    `  Specs: ` + Object.entries(knowledgeStates).map(([k, v]) => `${v} ${k}`).join(" · ")
  )
}

console.log(
  `\n  "Written" is the share a person has described, not the share a scanner found.`
  + `\n  Blank means never generated — it is not zero.\n`
)
