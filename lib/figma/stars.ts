import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

/**
 * Starred Figma files — pinned to the top of the Manifest. Stars are **team
 * curation** ("this file matters"), not personal favorites, so the file is
 * committed and synced through git like the rest of the foundation (see
 * docs/foundation-model.md §11). Per-user favorites would need the DB layer.
 */
const STARS_PATH = path.join(process.cwd(), "data", "figma-manifest", "stars.json")

export async function readStars(): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readFile(STARS_PATH, "utf8"))
    return Array.isArray(parsed?.keys) ? (parsed.keys as string[]) : []
  } catch {
    return [] // missing / unreadable → no favorites
  }
}

export async function writeStars(keys: string[]): Promise<void> {
  await mkdir(path.dirname(STARS_PATH), { recursive: true })
  await writeFile(STARS_PATH, `${JSON.stringify({ keys }, null, 2)}\n`, "utf8")
}
