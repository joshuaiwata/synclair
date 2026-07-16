"use server"

import { readFile } from "node:fs/promises"
import path from "node:path"

const SKILLS_DIR = path.join(process.cwd(), ".claude", "skills")

// Same shape as `in-app-doc.ts`'s DOC_RE, anchored: `<skill>:references/…​.md`.
// No dots in the path except the trailing `.md`, so `..` can't appear.
const REF_RE = /^([a-z0-9-]+):(references\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.md)$/

/** Drop a leading `---` YAML frontmatter block so the drawer shows prose only. */
function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
}

/**
 * Read an in-repo knowledge digest for the drawer. The ref is validated against a
 * strict pattern and the resolved path is confirmed to stay within `.claude/skills/`
 * — the client path is never trusted (mirrors `file-actions.ts`).
 */
export async function readKnowledgeDoc(ref: string): Promise<string> {
  const match = ref.match(REF_RE)
  if (!match) throw new Error("Invalid knowledge doc ref")
  const [, skill, rel] = match

  const full = path.join(SKILLS_DIR, skill, rel)
  const within = path.relative(SKILLS_DIR, full)
  if (within.startsWith("..") || path.isAbsolute(within)) {
    throw new Error("Resolved path is outside .claude/skills/")
  }

  return stripFrontmatter(await readFile(full, "utf8"))
}
