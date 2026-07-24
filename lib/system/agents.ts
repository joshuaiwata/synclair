import { cache } from "react"

import { readdir } from "node:fs/promises"
import path from "node:path"

import { layerOf, type CapabilityLayer } from "./capability-categories"
import { readFrontmatter, summarize } from "./frontmatter"

const AGENTS_DIR = path.join(process.cwd(), ".claude", "agents")

export interface AgentEntry {
  name: string
  summary: string
  /** "custom" | "adapted" — display tag only */
  source: string
  /** Capability taxonomy id from frontmatter — see capability-categories.ts. */
  category?: string
  /** "foundation" (ships with Synclair) | "project" (this repo's own). */
  layer: CapabilityLayer
  /** repo-relative path to the .md file */
  file: string
}

/**
 * Curated source tags. Agents not listed still appear (defaulting to "custom"),
 * so newly-added agents show up automatically.
 */
const SOURCE_OVERRIDES: Record<string, string> = {
  "ui-visual-validator": "adapted",
  "design-system-architect": "adapted",
}

/** Request-memoised — one build per render pass (react cache). */
export const getAgents = cache(getAgentsUncached)

async function getAgentsUncached(): Promise<AgentEntry[]> {
  let files: string[] = []
  try {
    files = (await readdir(AGENTS_DIR)).filter((f) => f.endsWith(".md"))
  } catch {
    return []
  }
  const entries = await Promise.all(
    files.map(async (f) => {
      const fm = await readFrontmatter(path.join(AGENTS_DIR, f))
      const name = fm.name ?? f.replace(/\.md$/, "")
      return {
        name,
        summary: summarize(fm.description),
        source: SOURCE_OVERRIDES[name] ?? "custom",
        category: fm.category,
        layer: layerOf(fm.layer),
        file: `.claude/agents/${f}`,
      }
    })
  )
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}
