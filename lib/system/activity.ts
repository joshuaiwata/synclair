import { getStoredFigmaFiles } from "@/lib/figma/manifest"

import { getAgents } from "./agents"
import { getProjectComponents } from "./components"
import { fileDates } from "./git-dates"
import { getKnowledgeSources } from "./knowledge/sources"
import { getReferences } from "./references"
import { synclair } from "./routes"
import { getSkills } from "./skills"
import { TIERS } from "./tiers"

/**
 * Recent activity — a unified, dated feed of what has changed across the
 * foundation lately: library items and AI setup (git file dates), knowledge
 * documents (git dates of their committed mirror), references (their `addedOn`),
 * and Figma files (their `lastModified` from the stored manifest snapshot).
 * Nothing here is hand-maintained — every date comes from a real source.
 * Powers the "Recent" section of the Overview.
 */

export type ActivityKind =
  | "component"
  | "block"
  | "template"
  | "skill"
  | "agent"
  | "doc"
  | "figma"
  | "reference"

export interface ActivityItem {
  kind: ActivityKind
  /** Display label for the kind ("Component", "Figma", …). */
  label: string
  title: string
  /** Where to view it (always in Synclair). */
  href: string
  /** "added" when it first landed and hasn't been touched since; else "updated". */
  action: "added" | "updated"
  /** ISO datetime of the most recent change. */
  at: string
}

const KIND_LABEL: Record<ActivityKind, string> = {
  component: "Component",
  block: "Block",
  template: "Template",
  skill: "Skill",
  agent: "Agent",
  doc: "Doc",
  figma: "Figma",
  reference: "Reference",
}

const TIER_PATH = new Map(TIERS.map((t) => [t.kind, t.path]))

/** Keep any single source from swamping the merged feed. */
const FIGMA_CAP = 3
const DOC_CAP = 4

/**
 * The most recently changed items across the library, AI setup, knowledge docs,
 * references, and Figma, newest first. Undated items are dropped.
 */
export async function getRecentActivity(limit = 10): Promise<ActivityItem[]> {
  const [components, skills, agents, figmaFiles] = await Promise.all([
    getProjectComponents(),
    getSkills(),
    getAgents(),
    getStoredFigmaFiles(),
  ])

  const items: ActivityItem[] = []

  // Library — components, blocks, templates (git file dates)
  for (const c of components) {
    if (!c.updatedAt) continue
    items.push({
      kind: c.kind,
      label: KIND_LABEL[c.kind],
      title: c.title,
      href: `${TIER_PATH.get(c.kind) ?? synclair("/components")}/${c.name}`,
      action: c.addedAt === c.updatedAt ? "added" : "updated",
      at: c.updatedAt,
    })
  }

  // AI setup — skills and agents (git file dates)
  for (const { entries, kind } of [
    { entries: skills, kind: "skill" as const },
    { entries: agents, kind: "agent" as const },
  ]) {
    for (const e of entries) {
      const { addedAt, updatedAt } = await fileDates(e.file)
      if (!updatedAt) continue
      items.push({
        kind,
        label: KIND_LABEL[kind],
        title: e.name,
        href: synclair("/ai-setup"),
        action: addedAt === updatedAt ? "added" : "updated",
        at: updatedAt,
      })
    }
  }

  // Knowledge documents — dated by their committed in-repo mirror/digest. Sources
  // that only live behind an external URL (no repo `ref`) carry no local change
  // signal, so they're skipped here (Figma is covered separately below).
  const docs: ActivityItem[] = []
  for (const s of getKnowledgeSources()) {
    if (!s.ref) continue
    const { addedAt, updatedAt } = await fileDates(s.ref)
    if (!updatedAt) continue
    docs.push({
      kind: "doc",
      label: KIND_LABEL.doc,
      title: s.title,
      href: synclair("/knowledge"),
      action: addedAt === updatedAt ? "added" : "updated",
      at: updatedAt,
    })
  }
  items.push(...docs.sort((a, b) => b.at.localeCompare(a.at)).slice(0, DOC_CAP))

  // References — dated by their `addedOn`
  for (const r of getReferences()) {
    if (!r.addedOn) continue
    items.push({
      kind: "reference",
      label: KIND_LABEL.reference,
      title: r.title,
      href: synclair("/references"),
      action: "added",
      at: r.addedOn,
    })
  }

  // Figma — the design files that changed most recently (stored snapshot).
  // Skip blank "Untitled" scratch files; they're noise, not real design work.
  const figma = [...figmaFiles]
    .filter((f) => f.lastModified && f.name.trim().toLowerCase() !== "untitled")
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified))
    .slice(0, FIGMA_CAP)
  for (const f of figma) {
    items.push({
      kind: "figma",
      label: KIND_LABEL.figma,
      title: f.name,
      href: synclair("/figma-manifest"),
      action: "updated",
      at: f.lastModified,
    })
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}
