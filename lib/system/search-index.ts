import { getAgents } from "./agents"
import { getCatalog, isFoundationVisible, isLibraryVisible } from "./components"
import { getKnowledgeSources } from "./knowledge/sources"
import { getSkills } from "./skills"
import { synclair } from "./routes"
import { getSurface, isMultiSurface, surfaceLabel } from "./surfaces"
import { itemHref, tier } from "./tiers"

export type SearchGroup =
  | "Components"
  | "Blocks"
  | "Templates"
  | "Skills"
  | "Agents"
  | "Knowledge"
  | "Pages"

export interface SearchEntry {
  id: string
  label: string
  sublabel?: string
  group: SearchGroup
  href: string
  /** Extra terms folded into the fuzzy match (categories, deps, summary). */
  keywords: string[]
}

const GROUP_BY_KIND = {
  component: "Components",
  block: "Blocks",
  template: "Templates",
} as const

/** Static app routes so navigation is reachable from ⌘K too. */
const PAGES: SearchEntry[] = [
  { id: "page:overview", label: "Overview", group: "Pages", href: synclair(), keywords: ["home", "synclair"] },
  { id: "page:figma", label: "Figma Manifest", group: "Pages", href: synclair("/figma-manifest"), keywords: ["design"] },
  { id: "page:ai-setup", label: "AI Setup", group: "Pages", href: synclair("/ai-setup"), keywords: ["skills", "agents"] },
  { id: "page:knowledge", label: "Knowledge", group: "Pages", href: synclair("/knowledge"), keywords: ["prd", "spec", "docs", "sources", "context", "figma", "decks"] },
  { id: "page:pages", label: "Pages", group: "Pages", href: synclair("/pages"), keywords: ["sitemap", "views", "routes", "screens", "preview", "app map", "navigation"] },
  { id: "page:system", label: "System Map", group: "Pages", href: synclair("/system"), keywords: ["architecture", "backend", "api", "endpoints", "database", "schema", "data model", "jobs", "services", "integrations", "codebase"] },
  { id: "page:github", label: "GitHub", group: "Pages", href: synclair("/github"), keywords: ["git", "commits", "history", "activity", "changes", "diff"] },
  { id: "page:environment", label: "Environment", group: "Pages", href: synclair("/environment"), keywords: ["stack", "foundation"] },
  { id: "page:foundations", label: "Foundations", group: "Pages", href: synclair("/foundations"), keywords: ["library", "tokens", "colors", "typography", "spacing", "radius", "theme", "design tokens"] },
  { id: "page:components", label: "Components", group: "Pages", href: synclair("/components"), keywords: ["library", "ui", "docs"] },
  { id: "page:blocks", label: "Blocks", group: "Pages", href: synclair("/blocks"), keywords: ["library", "panels", "docs"] },
  { id: "page:templates", label: "Templates", group: "Pages", href: synclair("/templates"), keywords: ["views", "screens"] },
]

/**
 * One flat, server-built index of everything searchable in the system:
 * registry items, skills, agents, and routes. Passed to the ⌘K palette.
 */
export async function getSearchIndex(): Promise<SearchEntry[]> {
  // getCatalog, not getComponents: the index must agree with the galleries,
  // which show natives and (in existing-project mode) host externals too.
  const [components, skills, agents, foundationVisible] = await Promise.all([
    getCatalog(),
    getSkills(),
    getAgents(),
    isFoundationVisible(),
  ])
  const knowledge = getKnowledgeSources()

  // Multi-surface: ids stay unique across colliding names (web vs RN `button`),
  // hrefs carry the ?surface= disambiguator, and the surface label leads the
  // sublabel so the palette says WHICH button before what it does.
  const multiSurface = isMultiSurface()
  const componentEntries: SearchEntry[] = components
    .filter((c) => isLibraryVisible(c, foundationVisible))
    .map((c) => ({
    id: multiSurface ? `component:${c.surface}:${c.name}` : `component:${c.name}`,
    label: c.title,
    sublabel: multiSurface ? `${surfaceLabel(c.surface)} · ${c.description}` : c.description,
    group: GROUP_BY_KIND[c.kind],
    href: itemHref(c.kind, c.name, multiSurface ? c.surface : undefined),
    keywords: [
      c.name,
      tier(c.kind).label,
      c.origin,
      ...(multiSurface && c.surface
        ? [c.surface, getSurface(c.surface)?.platform ?? ""].filter(Boolean)
        : []),
      ...c.categories,
      ...c.dependencies,
    ],
  }))

  const skillEntries: SearchEntry[] = skills.map((s) => ({
    id: `skill:${s.name}`,
    label: s.name,
    sublabel: s.summary,
    group: "Skills",
    href: synclair("/ai-setup"),
    keywords: ["skill", s.source],
  }))

  const agentEntries: SearchEntry[] = agents.map((a) => ({
    id: `agent:${a.name}`,
    label: a.name,
    sublabel: a.summary,
    group: "Agents",
    href: synclair("/ai-setup"),
    keywords: ["agent", a.source],
  }))

  const knowledgeEntries: SearchEntry[] = knowledge.map((k) => ({
    id: `knowledge:${k.id}`,
    label: k.title,
    sublabel: k.distilledInto ?? k.notes,
    group: "Knowledge",
    href: synclair("/knowledge"),
    keywords: ["knowledge", "source", k.kind, k.area, k.access, ...(k.surfaces ?? [])],
  }))

  return [
    ...componentEntries,
    ...skillEntries,
    ...agentEntries,
    ...knowledgeEntries,
    ...PAGES,
    // The Library drill-in landing only exists for multi-surface projects.
    ...(multiSurface
      ? [
          {
            id: "page:library",
            label: "Library",
            group: "Pages" as const,
            href: synclair("/library"),
            keywords: ["surfaces", "libraries", "components", "web", "mobile"],
          },
        ]
      : []),
  ]
}
