import { readFile } from "node:fs/promises"

export interface Frontmatter {
  name?: string
  description?: string
  /** Capability taxonomy id — see lib/system/capability-categories.ts. */
  category?: string
  /**
   * Which layer this capability belongs to (mirrors components' meta.layer):
   * "foundation" = ships with Synclair and syncs from upstream; "project" =
   * this repo's own. Absent ⇒ project (the default for a clone's own work).
   */
  layer?: string
}

/** Pull `name` / `description` / `category` / `layer` out of a leading `---` block. */
export function parseFrontmatter(content: string): Frontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const fm: Frontmatter = {}
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s?(.*)$/)
    if (!kv) continue
    const [, key, value] = kv
    if (key === "name") fm.name = value.trim()
    else if (key === "description") fm.description = value.trim()
    else if (key === "category") fm.category = value.trim()
    else if (key === "layer") fm.layer = value.trim()
  }
  return fm
}

/**
 * The first human sentence(s) of a description — drops the embedded `\n<example>`
 * blocks that agent frontmatter carries, so tables show a clean summary.
 */
export function summarize(description = ""): string {
  return description.split(/\\n|<example>/)[0].trim()
}

/** Read a file's frontmatter, resilient to a missing/unreadable file. */
export async function readFrontmatter(filePath: string): Promise<Frontmatter> {
  try {
    return parseFrontmatter(await readFile(filePath, "utf8"))
  } catch {
    return {}
  }
}
