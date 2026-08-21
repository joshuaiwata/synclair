import { readFileSync } from "node:fs"
import path from "node:path"

import { z } from "zod"

import { cachePath, writeArtifact } from "./shared"

/**
 * SYSTEM MAP — one owner (battery B3) for the system digest's file access, and
 * — since the prose/derived split (north-star Phase 2 leftover) — the one
 * place the split LIVES:
 *
 *   data/system-map.json            COMMITTED — the AUTHORED map. Repo config
 *                                   and every row the system-mapper wrote a
 *                                   summary for (grouped by hand, carrying
 *                                   prose no scan can produce).
 *   .synclair/cache/system-map.json DERIVED — the scanner's inventory: rows it
 *                                   found in code that no authored row covers
 *                                   (the skeletons that used to be appended to
 *                                   the committed file), plus scan stamps.
 *                                   Gitignored; rebuilt by `synclair index`.
 *
 * Writers and readers keep speaking the FULL map: `writeSystemMap()` splits
 * row-wise — a row with an authored (non-empty) `summary` is judgment and
 * stays committed; a summary-less row is inventory and goes to the cache.
 * `readSystemMapFile()` merges them back, deduping grouped api rows (an
 * authored "a | b" row covers the inventory rows a and b). The pre-commit
 * reindex hook retires with this: scans no longer touch the committed file.
 *
 * A LEGACY mixed committed file (skeletons still in data/) reads fine and is
 * split by its first write through this module.
 */

export const apiRowWriteSchema = z.looseObject({
  method: z.string(),
  path: z.string(),
  source: z.string(),
})

export const systemMapWriteSchema = z.looseObject({
  repo: z.looseObject({ root: z.string().nullable().optional() }).nullable().optional(),
  areas: z.array(z.looseObject({ name: z.string().optional(), path: z.string().optional() })),
  api: z.array(apiRowWriteSchema),
  data: z.array(z.looseObject({ name: z.string() })),
  jobs: z.array(z.looseObject({})),
  integrations: z.array(z.looseObject({})),
})

export const SYSTEM_MAP_PATH = () => path.join(process.cwd(), "data", "system-map.json")
export const SYSTEM_MAP_CACHE_PATH = () => cachePath("system-map.json")

type Row = Record<string, unknown>

/** The five row collections the map carries, each with its own identity. */
const COLLECTIONS = ["areas", "api", "data", "jobs", "integrations"] as const
type Collection = (typeof COLLECTIONS)[number]

/**
 * Row identity per collection. An api row can group several wire names in one
 * authored `path` ("a | b"), so it expands to one key per name — that is what
 * lets an authored group suppress its inventory skeletons on merge.
 */
function rowKeys(collection: Collection, row: Row): string[] {
  if (collection === "api") {
    const method = String(row.method ?? "")
    return String(row.path ?? "")
      .split("|")
      .map((p) => `${method} ${p.trim()}`)
      .filter((k) => k !== `${method} `)
  }
  if (collection === "areas") return [String(row.path ?? row.name ?? "")]
  return [String(row.name ?? "").toLowerCase()]
}

/** An authored row is one somebody wrote prose for; a bare row is inventory. */
function isAuthored(row: Row): boolean {
  return typeof row.summary === "string" && row.summary.trim().length > 0
}

export type SystemMapRead =
  | { state: "ok"; value: unknown }
  | { state: "absent" }
  | { state: "unreadable"; error: string }

function readJsonFile(abs: string): SystemMapRead {
  let raw: string
  try {
    raw = readFileSync(abs, "utf8")
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { state: "absent" }
    return { state: "unreadable", error: e instanceof Error ? e.message : String(e) }
  }
  try {
    return { state: "ok", value: JSON.parse(raw) }
  } catch (e) {
    return { state: "unreadable", error: e instanceof Error ? e.message : String(e) }
  }
}

const REPO_STAMP_FIELDS = ["commit", "digestedAt"] as const

/**
 * The one file-access point for readers: authored rows (committed) plus the
 * inventory rows (cache) no authored key covers, presented as the full map.
 * No cache → the authored map alone; no committed map → inventory alone.
 */
export function readSystemMapFile(): SystemMapRead {
  const prose = readJsonFile(SYSTEM_MAP_PATH())
  const cache = readJsonFile(SYSTEM_MAP_CACHE_PATH())
  if (prose.state === "unreadable") return prose
  if (prose.state === "absent" && cache.state !== "ok") return prose

  const proseMap = (prose.state === "ok" ? prose.value : {}) as Row
  const cacheMap = (cache.state === "ok" ? cache.value : {}) as Row

  const value: Row = { ...cacheMap, ...proseMap }
  for (const c of COLLECTIONS) {
    const authored = Array.isArray(proseMap[c]) ? (proseMap[c] as Row[]) : []
    const inventory = Array.isArray(cacheMap[c]) ? (cacheMap[c] as Row[]) : []
    const covered = new Set(authored.flatMap((r) => rowKeys(c, r)))
    value[c] = [...authored, ...inventory.filter((r) => !rowKeys(c, r).some((k) => covered.has(k)))]
  }
  // Repo: config from the committed file, scan stamps from the cache.
  const p = proseMap.repo && typeof proseMap.repo === "object" ? (proseMap.repo as Row) : undefined
  const s = cacheMap.repo && typeof cacheMap.repo === "object" ? (cacheMap.repo as Row) : undefined
  if (p || s) value.repo = { ...(s ?? {}), ...(p ?? {}) }
  else if (proseMap.repo === null) value.repo = null
  return { state: "ok", value }
}

/**
 * Scanners and the system-mapper skill write the FULL map through here — an
 * invalid shape fails in the writer's own run. The module splits it row-wise:
 * authored rows (non-empty summary) to the committed file, bare inventory rows
 * to the cache, scan stamps and provenance to the cache. Repeated writes of
 * the same content are byte-stable on the committed side.
 */
export function writeSystemMap(value: unknown) {
  const parsed = systemMapWriteSchema.parse(value) as Row

  const proseMap: Row = { ...parsed }
  const cacheMap: Row = {}
  for (const c of COLLECTIONS) {
    const rows = Array.isArray(parsed[c]) ? (parsed[c] as Row[]) : []
    proseMap[c] = rows.filter(isAuthored)
    cacheMap[c] = rows.filter((r) => !isAuthored(r))
  }
  if (parsed.provenance !== undefined) {
    cacheMap.provenance = parsed.provenance
    delete proseMap.provenance
  }
  if (parsed.repo && typeof parsed.repo === "object") {
    const r = parsed.repo as Row
    const stamps: Row = {}
    const config: Row = { ...r }
    for (const f of REPO_STAMP_FIELDS) {
      if (r[f] !== undefined) stamps[f] = r[f]
      delete config[f]
    }
    proseMap.repo = config
    if (Object.keys(stamps).length) cacheMap.repo = stamps
  }

  writeArtifact(SYSTEM_MAP_PATH(), systemMapWriteSchema, proseMap)
  writeArtifact(SYSTEM_MAP_CACHE_PATH(), systemMapWriteSchema, {
    ...cacheMap,
    areas: cacheMap.areas ?? [],
    api: cacheMap.api ?? [],
    data: cacheMap.data ?? [],
    jobs: cacheMap.jobs ?? [],
    integrations: cacheMap.integrations ?? [],
  })
  return parsed
}
