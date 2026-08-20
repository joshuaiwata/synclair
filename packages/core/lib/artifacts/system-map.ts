import { readFileSync } from "node:fs"
import path from "node:path"

import { z } from "zod"

import { writeArtifact } from "./shared"

/**
 * SYSTEM MAP — one owner (battery B3) for `data/system-map.json` file access.
 *
 * A MIXED artifact (derived rows + authored summaries), so it stays
 * COMMITTED. The write contract pins exactly the fields downstream consumers
 * assert on — the audit's self-maintenance suite requires every api row to
 * carry method/path/source, and every check reads the top-level arrays — and
 * stays loose everywhere else. Domain normalization of legacy shapes remains
 * in lib/system/system-map.ts.
 */

export const apiRowWriteSchema = z.looseObject({
  method: z.string(),
  path: z.string(),
  source: z.string(),
})

export const systemMapWriteSchema = z.looseObject({
  repo: z.looseObject({ root: z.string().optional() }).nullable().optional(),
  areas: z.array(z.looseObject({ name: z.string().optional(), path: z.string().optional() })),
  api: z.array(apiRowWriteSchema),
  data: z.array(z.looseObject({ name: z.string() })),
  jobs: z.array(z.looseObject({})),
  integrations: z.array(z.looseObject({})),
})

export const SYSTEM_MAP_PATH = () => path.join(process.cwd(), "data", "system-map.json")

export type SystemMapRead =
  | { state: "ok"; value: unknown }
  | { state: "absent" }
  | { state: "unreadable"; error: string }

export function readSystemMapFile(): SystemMapRead {
  let raw: string
  try {
    raw = readFileSync(SYSTEM_MAP_PATH(), "utf8")
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

export function writeSystemMap(value: unknown) {
  return writeArtifact(SYSTEM_MAP_PATH(), systemMapWriteSchema, value)
}
