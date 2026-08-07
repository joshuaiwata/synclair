import {
  Blocks,
  BookOpen,
  Bot,
  ClipboardList,
  Component,
  FileClock,
  GitCommitHorizontal,
  Library,
  LayoutTemplate,
  Map as MapIcon,
  Palette,
  PanelsTopLeft,
  Server,
  ShieldCheck,
  Waypoints,
  type LucideIcon,
} from "lucide-react"

import { synclair } from "@/lib/system/routes"

/**
 * The extensibility catalog — the client-safe half of the Core/Extensions
 * layer (docs/extensibility.md). This module DECLARES what exists: the core
 * hub sections a clone may hide, and the Extension manifests with what each
 * contributes. On/off STATE lives in `data/extensions.json`, read and written
 * only by `lib/system/extensions.ts` (server) — never here, so the sidebar
 * (a client component) can import this without dragging in node APIs.
 *
 * Two axes, per the RFC: Core sections are always installed and only ever
 * HIDDEN (nav-level; their routes stay reachable). Extensions are optional
 * capabilities that can be DISABLED — nav entry gone and their routes answer
 * with an off notice — with their data always left untouched.
 */

export type ExtensionLayer = "foundation" | "project"

export interface ExtensionManifest {
  id: string
  name: string
  description: string
  /** foundation = ships with Synclair and syncs from upstream; project = this clone's own. */
  layer: ExtensionLayer
  type: "section" | "integration" | "surface" | "ops"
  nav: {
    group: string
    title: string
    icon: LucideIcon
    href: string
    /** Where the entry sits inside its group. Default "end". */
    placement?: "start" | "end"
  }
  /** Route prefix the extension owns — guarded by its layout when disabled. */
  routePrefix: string
  defaultEnabled: boolean
}

export const EXTENSIONS: readonly ExtensionManifest[] = [
  /**
   * Empty by design. Extensions are what a PROJECT adds; the foundation ships
   * the contract and the machinery around it. A clone appends its own entries
   * here, and they never sync back — the same rule the rest of the seed follows.
   *
   * A minimal entry:
   *
   *   {
   *     id: "my-extension",
   *     name: "My Extension",
   *     description: "One line, shown on the Settings row.",
   *     layer: "project",
   *     type: "section",
   *     nav: { group: "Project", title: "My Extension", icon: Sparkles,
   *            href: synclair("/my-extension"), placement: "end" },
   *     routePrefix: synclair("/my-extension"),
   *     defaultEnabled: true,
   *   }
   *
   * The route's own layout is what enforces the gate — call
   * `isExtensionEnabled(id)` there and render an off notice when it is false.
   * Nav removal alone is not a gate.
   */
]

export function extensionById(id: string): ExtensionManifest | undefined {
  return EXTENSIONS.find((extension) => extension.id === id)
}

export interface CoreSection {
  id: string
  title: string
  description: string
  group: string
  icon: LucideIcon
  href: string
  /** Extra route prefixes that keep the nav item highlighted. */
  also?: readonly string[]
  /** Internal working surface — shown in local dev, hidden on the DEPLOYED
   *  hub (NODE_ENV=production). Routes stay reachable by URL — this hides,
   *  it doesn't gate. */
  internal?: boolean
}

/**
 * Every core hub section, grouped to mirror the sidebar. The Library group
 * changes shape with the surfaces seed, so this is a function of that flag —
 * the same fork the sidebar always made.
 */
export function coreSections(multiSurface: boolean): readonly CoreSection[] {
  return [
    {
      id: "overview",
      title: "Overview",
      description: "The current state of the foundation at a glance.",
      group: "Synclair",
      icon: PanelsTopLeft,
      href: synclair(),
    },
    {
      id: "reports",
      title: "Reports",
      description: "Build and coverage reports with ranked next steps.",
      group: "Synclair",
      icon: ClipboardList,
      href: synclair("/reports"),
      internal: true,
    },
    {
      id: "knowledge",
      title: "Knowledge",
      description: "Sources of record and their distilled summaries.",
      group: "Project",
      icon: Library,
      href: synclair("/knowledge"),
    },
    {
      id: "system",
      title: "System Map",
      description: "Areas, API surface, data model, jobs, integrations.",
      group: "Project",
      icon: Waypoints,
      href: synclair("/system"),
    },
    {
      id: "hygiene",
      title: "Hygiene",
      description: "Where host code steps outside its own foundation.",
      group: "Project",
      icon: ShieldCheck,
      href: synclair("/hygiene"),
      internal: true,
    },
    {
      id: "figma-manifest",
      title: "Figma Manifest",
      description: "Figma files as knowledge sources and their freshness.",
      group: "Project",
      icon: FileClock,
      href: synclair("/figma-manifest"),
    },
    {
      id: "references",
      title: "References",
      description: "The project research library — prior art and findings.",
      group: "Project",
      icon: BookOpen,
      href: synclair("/references"),
    },
    {
      id: "github",
      title: "GitHub",
      description: "Recent repo activity — commits and diffs.",
      group: "Project",
      icon: GitCommitHorizontal,
      href: synclair("/github"),
    },
    {
      id: "pages",
      title: "Pages",
      description: "The app sitemap — every view, previewed and mapped.",
      group: "Library",
      icon: MapIcon,
      href: synclair("/pages"),
    },
    {
      id: "foundations",
      title: "Foundations",
      description: "Design tokens — color, type, spacing.",
      group: "Library",
      icon: Palette,
      href: synclair("/foundations"),
    },
    ...(multiSurface
      ? ([
          {
            id: "library",
            title: "Library",
            description: "Per-surface component libraries.",
            group: "Library",
            icon: Component,
            href: synclair("/library"),
            also: [
              synclair("/components"),
              synclair("/blocks"),
              synclair("/templates"),
            ],
          },
        ] as const)
      : ([
          {
            id: "components",
            title: "Components",
            description: "The component tier of the library.",
            group: "Library",
            icon: Component,
            href: synclair("/components"),
          },
          {
            id: "blocks",
            title: "Blocks",
            description: "The block tier of the library.",
            group: "Library",
            icon: Blocks,
            href: synclair("/blocks"),
          },
          {
            id: "templates",
            title: "Templates",
            description: "The template tier of the library.",
            group: "Library",
            icon: LayoutTemplate,
            href: synclair("/templates"),
          },
        ] as const)),
    {
      id: "ai-setup",
      title: "AI Setup",
      description: "The skills and agents registry every agent reads.",
      group: "System",
      icon: Bot,
      href: synclair("/ai-setup"),
    },
    {
      id: "environment",
      title: "Environment",
      description: "Setup mode and foundation freshness.",
      group: "System",
      icon: Server,
      href: synclair("/environment"),
    },
  ]
}

export interface NavEntry {
  id: string
  title: string
  icon: LucideIcon
  href: string
  also?: readonly string[]
  internal?: boolean
}

export interface NavGroup {
  label: string
  items: NavEntry[]
}

const GROUP_ORDER = ["Synclair", "Project", "Library", "System"] as const

/**
 * The sidebar's nav, derived: core sections minus the hidden ones, plus the
 * nav entries of enabled Extensions. Fail-open — an unknown id in either list
 * changes nothing, and a missing state file means everything shows.
 */
export function buildNavGroups(options: {
  multiSurface: boolean
  hiddenSections: readonly string[]
  enabledExtensionIds: readonly string[]
}): NavGroup[] {
  const hidden = new Set(options.hiddenSections)
  const enabled = new Set(options.enabledExtensionIds)

  const groups = new Map<string, NavEntry[]>(
    GROUP_ORDER.map((label) => [label, []])
  )
  for (const section of coreSections(options.multiSurface)) {
    if (hidden.has(section.id)) continue
    groups.get(section.group)?.push(section)
  }
  for (const extension of EXTENSIONS) {
    if (!enabled.has(extension.id)) continue
    const items = groups.get(extension.nav.group)
    if (!items) continue
    const entry: NavEntry = { id: extension.id, ...extension.nav }
    if (extension.nav.placement === "start") items.unshift(entry)
    else items.push(entry)
  }

  return GROUP_ORDER.filter(
    (label) => (groups.get(label) ?? []).length > 0
  ).map((label) => ({
    label,
    items: groups.get(label)!,
  }))
}
