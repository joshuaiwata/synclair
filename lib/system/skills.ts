import { cache } from "react"

import { readFile, readdir } from "node:fs/promises"
import path from "node:path"

import { layerOf, type CapabilityLayer } from "./capability-categories"
import { readFrontmatter, summarize } from "./frontmatter"

const SKILLS_DIR = path.join(process.cwd(), ".claude", "skills")
const LOCK_PATH = path.join(process.cwd(), "skills-lock.json")

export interface SkillEntry {
  name: string
  summary: string
  /** "official" (tracked in skills-lock.json) | "custom" */
  source: string
  /** Capability taxonomy id from frontmatter — see capability-categories.ts. */
  category?: string
  /** "foundation" (ships with Synclair) | "project" (this repo's own). */
  layer: CapabilityLayer
  /** repo-relative path to the SKILL.md file */
  file: string
}

/** Names of skills vendored from an external source (skills-lock.json). */
async function lockedSkillDirs(): Promise<Set<string>> {
  try {
    const lock = JSON.parse(await readFile(LOCK_PATH, "utf8")) as {
      skills?: Record<string, unknown>
    }
    return new Set(Object.keys(lock.skills ?? {}))
  } catch {
    return new Set()
  }
}

/** Request-memoised — one build per render pass (react cache). */
export const getSkills = cache(getSkillsUncached)

async function getSkillsUncached(): Promise<SkillEntry[]> {
  let dirs: string[] = []
  try {
    const dirents = await readdir(SKILLS_DIR, { withFileTypes: true })
    dirs = dirents.filter((d) => d.isDirectory()).map((d) => d.name)
  } catch {
    return []
  }
  const locked = await lockedSkillDirs()
  const entries = await Promise.all(
    dirs.map(async (dir) => {
      const fm = await readFrontmatter(path.join(SKILLS_DIR, dir, "SKILL.md"))
      const name = fm.name ?? dir
      return {
        name,
        summary: summarize(fm.description),
        source: locked.has(dir) || locked.has(name) ? "official" : "custom",
        category: fm.category,
        layer: layerOf(fm.layer),
        file: `.claude/skills/${dir}/SKILL.md`,
      }
    })
  )
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}
