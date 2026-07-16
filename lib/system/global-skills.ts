import { readFile, readdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { readFrontmatter, summarize } from "./frontmatter"

/**
 * Global capabilities available to Claude on this machine — read live from the
 * user's ~/.claude, so the dashboard reflects what's actually installed rather
 * than a hardcoded guess. Covers two readable sources:
 *   - ~/.claude/skills/            → personal skills (frontmatter name + summary)
 *   - settings.json enabledPlugins → installed plugins (manifest description)
 * The Claude app's own marketplace-enabled skills are managed in app state with
 * no single local enable-list, so they are intentionally not mirrored here.
 */

const CLAUDE_HOME = path.join(os.homedir(), ".claude")
const GLOBAL_SKILLS_DIR = path.join(CLAUDE_HOME, "skills")
const SETTINGS_PATH = path.join(CLAUDE_HOME, "settings.json")
const INSTALLED_PLUGINS_PATH = path.join(CLAUDE_HOME, "plugins", "installed_plugins.json")

export interface GlobalCapability {
  name: string
  kind: "skill" | "plugin"
  purpose: string
}

async function getGlobalSkills(): Promise<GlobalCapability[]> {
  let dirs: string[] = []
  try {
    const ents = await readdir(GLOBAL_SKILLS_DIR, { withFileTypes: true })
    dirs = ents.filter((d) => d.isDirectory()).map((d) => d.name)
  } catch {
    return []
  }
  const items = await Promise.all(
    dirs.map(async (dir) => {
      const fm = await readFrontmatter(path.join(GLOBAL_SKILLS_DIR, dir, "SKILL.md"))
      return {
        name: fm.name ?? dir,
        kind: "skill" as const,
        purpose: summarize(fm.description),
      }
    })
  )
  return items.sort((a, b) => a.name.localeCompare(b.name))
}

async function pluginPurpose(key: string): Promise<string> {
  try {
    const installed = JSON.parse(await readFile(INSTALLED_PLUGINS_PATH, "utf8")) as {
      plugins?: Record<string, { installPath?: string; version?: string }[]>
    }
    const entry = installed.plugins?.[key]?.[0]
    if (entry?.installPath) {
      const manifest = JSON.parse(
        await readFile(path.join(entry.installPath, ".claude-plugin", "plugin.json"), "utf8")
      ) as { description?: string }
      const ver = entry.version ? ` (v${entry.version})` : ""
      return `${manifest.description ?? "Installed plugin"}${ver}`
    }
  } catch {
    // fall through
  }
  return "Installed plugin"
}

async function getEnabledPlugins(): Promise<GlobalCapability[]> {
  let enabled: Record<string, boolean> = {}
  try {
    const settings = JSON.parse(await readFile(SETTINGS_PATH, "utf8")) as {
      enabledPlugins?: Record<string, boolean>
    }
    enabled = settings.enabledPlugins ?? {}
  } catch {
    return []
  }
  const keys = Object.keys(enabled).filter((k) => enabled[k])
  const items = await Promise.all(
    keys.map(async (key) => ({
      // key looks like "figma@claude-plugins-official"
      name: key.split("@")[0],
      kind: "plugin" as const,
      purpose: await pluginPurpose(key),
    }))
  )
  return items.sort((a, b) => a.name.localeCompare(b.name))
}

/** Enabled plugins first, then personal skills — both live from ~/.claude. */
export async function getGlobalCapabilities(): Promise<GlobalCapability[]> {
  const [plugins, skills] = await Promise.all([getEnabledPlugins(), getGlobalSkills()])
  return [...plugins, ...skills]
}
