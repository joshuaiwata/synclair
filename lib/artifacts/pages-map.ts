import { readFileSync } from "node:fs"
import path from "node:path"

import { z } from "zod"

import { writeArtifact } from "./shared"

/**
 * PAGES MAP — one owner (battery B3) for `data/pages-map.json` file access.
 *
 * A MIXED artifact: derived rows (routes, source files, hashes) carrying
 * authored prose (titles, summaries) — so it stays COMMITTED, unlike the
 * cache artifacts. The write contract is strict on the fields every reader
 * and check depends on (a page must name its route; the map must carry
 * `pages`); everything else is loose so the map can grow fields without
 * ceremony. Normalization of legacy shapes stays in lib/system/pages-map.ts —
 * this module owns the FILE, not the domain model.
 */

export const pageNodeWriteSchema = z
  .looseObject({
    route: z.string().optional(),
    path: z.string().optional(),
  })
  .refine((p) => Boolean(p.route || p.path), {
    message: "a page must carry `route` (or legacy `path`)",
  })

export const pagesMapWriteSchema = z
  .looseObject({
    repo: z.looseObject({ root: z.string().optional() }).nullable().optional(),
    repos: z.array(z.looseObject({})).optional(),
    pages: z.array(pageNodeWriteSchema).optional(),
    nodes: z.array(pageNodeWriteSchema).optional(),
  })
  .refine((m) => Array.isArray(m.pages) || Array.isArray(m.nodes), {
    message: "the map must carry a `pages` (or legacy `nodes`) array",
  })

export const PAGES_MAP_PATH = () => path.join(process.cwd(), "data", "pages-map.json")

export type PagesMapRead =
  | { state: "ok"; value: unknown }
  | { state: "absent" }
  | { state: "unreadable"; error: string }

/** The one file-access point for readers (domain normalization stays theirs). */
export function readPagesMapFile(): PagesMapRead {
  let raw: string
  try {
    raw = readFileSync(PAGES_MAP_PATH(), "utf8")
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

/** Scanners write through here — an invalid shape fails in the scanner's run. */
export function writePagesMap(value: unknown) {
  return writeArtifact(PAGES_MAP_PATH(), pagesMapWriteSchema, value)
}
