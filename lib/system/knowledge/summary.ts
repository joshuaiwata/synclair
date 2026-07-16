import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { SLUG_RE, type SummaryIndex } from "./summary-types"

/**
 * Project summaries — on-demand distilled views of the knowledge layer (the
 * docs a product owner hands new team members): audience briefs, diagrams, or
 * custom cuts. Each summary is *defined* in `index.json` (what to generate,
 * for whom) and *generated* by an agent — the web app can't run the AI itself,
 * so the UI queues a request that an agent drains per the `product-summary`
 * skill. Every generation is an immutable version file; `current` is just a
 * pointer, so restoring an old version never loses anything. Archiving hides
 * a summary without deleting its history.
 *
 * Types + client-safe constants: `summary-types.ts`. This module is the fs
 * side (server-only).
 */
export const SUMMARIES_DIR = path.join(process.cwd(), "data", "knowledge", "summaries")

export async function readSummaryIndex(): Promise<SummaryIndex> {
  try {
    const parsed = JSON.parse(
      await readFile(path.join(SUMMARIES_DIR, "index.json"), "utf8")
    )
    return { summaries: Array.isArray(parsed?.summaries) ? parsed.summaries : [] }
  } catch {
    return { summaries: [] } // none defined yet
  }
}

export async function writeSummaryIndex(index: SummaryIndex): Promise<void> {
  await mkdir(SUMMARIES_DIR, { recursive: true })
  await writeFile(
    path.join(SUMMARIES_DIR, "index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
    "utf8"
  )
}

/** Read one version's markdown; null when the id is unknown or the file is gone. */
export async function readSummaryContent(versionId: string): Promise<string | null> {
  if (!SLUG_RE.test(versionId)) return null
  try {
    return await readFile(path.join(SUMMARIES_DIR, `${versionId}.md`), "utf8")
  } catch {
    return null
  }
}
