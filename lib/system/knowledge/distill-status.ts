import type { ManifestFile } from "../../figma/manifest"
import { readDistillQueue } from "./distill-queue"
import { getKnowledgeSources } from "./sources"

/** none = never distilled · distilled = fresh · stale = file changed since distill. */
export type DistillState = "none" | "distilled" | "stale"

export interface FileDistillStatus {
  state: DistillState
  /** How many of the file's pages carry a digest. */
  pages: number
  /** ISO date of the newest page digest, if any. */
  distilledAt?: string
  /** A (re)distill request is pending in the queue. */
  queued: boolean
}

/**
 * Per-file distill status, keyed by Figma file key. Cross-references the knowledge
 * registry (figma page entries whose `ref` is `<fileKey>#<pageNodeId>`) and the
 * distill queue. Stale = the file was modified after its newest page was distilled.
 */
export async function getFileDistillStatuses(
  files: ManifestFile[]
): Promise<Record<string, FileDistillStatus>> {
  const sources = getKnowledgeSources()
  const queued = new Set((await readDistillQueue()).map((r) => r.fileKey))

  // Aggregate distilled PAGE entries by their file key.
  const byFile = new Map<string, { pages: number; distilledAt?: string }>()
  for (const s of sources) {
    if (s.kind !== "figma" || !s.ref?.includes("#")) continue
    const fileKey = s.ref.split("#")[0]
    const cur = byFile.get(fileKey) ?? { pages: 0 }
    cur.pages += 1
    if (s.distilledAt && (!cur.distilledAt || s.distilledAt > cur.distilledAt)) {
      cur.distilledAt = s.distilledAt
    }
    byFile.set(fileKey, cur)
  }

  const out: Record<string, FileDistillStatus> = {}
  for (const f of files) {
    const d = byFile.get(f.key)
    const isQueued = queued.has(f.key)
    if (!d) {
      out[f.key] = { state: "none", pages: 0, queued: isQueued }
      continue
    }
    const stale = d.distilledAt
      ? new Date(f.lastModified).getTime() > new Date(d.distilledAt).getTime()
      : false
    out[f.key] = {
      state: stale ? "stale" : "distilled",
      pages: d.pages,
      distilledAt: d.distilledAt,
      queued: isQueued,
    }
  }
  return out
}
