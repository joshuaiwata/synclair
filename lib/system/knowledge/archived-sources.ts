import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

/**
 * Archived knowledge sources — a soft-remove sidecar. The sources themselves are
 * CODE (the `KNOWLEDGE_SOURCES` array in sources.ts); this list only hides an entry
 * from the hub without rewriting that file, mirroring how summaries archive. It's
 * reversible (restore). A hard delete is still a code edit — remove the entry from
 * sources.ts — which is the right tool for the "git is the DB" model.
 */
const STORE_PATH = path.join(process.cwd(), "data", "knowledge", "archived-sources.json")

/** Ids of sources the user has archived (soft-removed). */
export async function readArchivedSources(): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readFile(STORE_PATH, "utf8"))
    return Array.isArray(parsed?.ids) ? (parsed.ids as string[]) : []
  } catch {
    return [] // missing / unreadable → nothing archived
  }
}

export async function writeArchivedSources(ids: string[]): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true })
  await writeFile(STORE_PATH, `${JSON.stringify({ ids }, null, 2)}\n`, "utf8")
}
