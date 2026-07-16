import { isLibraryVisible, type RegistryComponent } from "./components"
import { synclair } from "./routes"
import {
  defaultSurfaceId,
  getSurfaces,
  isMultiSurface,
  PLATFORM_BADGE,
  SHARED_SURFACE_ID,
} from "./surfaces"
import { TIERS, tierSlug } from "./tiers"

/**
 * The LIBRARY TREE — the serializable navigation structure behind the library
 * explorer's dense sidebar (Storybook-style). Built server-side as a pure
 * projection of `getCatalog()` (foundation-model §1) and handed to the client
 * tree, which only handles expand/filter state.
 *
 * Levels: root (surface, multi-surface only) → tier → category → item.
 * Single-surface projects get one root that the explorer renders WITHOUT the
 * root level — same data, collapsed chrome.
 */

export interface TreeLeaf {
  name: string
  title: string
  href: string
  surface: string
  status?: string
  /** Filterable haystack: name + title + categories. */
  terms: string
}

export interface TreeCategoryNode {
  label: string
  items: TreeLeaf[]
}

export interface TreeTierNode {
  kind: string
  label: string
  href: string
  count: number
  categories: TreeCategoryNode[]
}

export interface TreeRootNode {
  /** Surface id, or SHARED_SURFACE_ID for the shared-packages root. */
  id: string
  label: string
  /** Short chip next to the root label — platform ("Web", "RN") or "pkg". */
  badge?: string
  href: string
  count: number
  tiers: TreeTierNode[]
}

export interface LibraryTreeData {
  multiSurface: boolean
  roots: TreeRootNode[]
  /** Scope-select options (id + label), including Shared when it has items. */
  scopes: { id: string; label: string; badge?: string }[]
}

function prettyCategory(cat: string): string {
  const s = cat.replace(/[-_]/g, " ")
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function tiersFor(items: RegistryComponent[], scopeId: string, scoped: boolean): TreeTierNode[] {
  return TIERS.map((t) => {
    const ofTier = items.filter((c) => c.kind === t.kind)
    const byCategory = new Map<string, TreeLeaf[]>()
    for (const c of ofTier) {
      const label = c.categories[0] ? prettyCategory(c.categories[0]) : "Other"
      const list = byCategory.get(label) ?? []
      list.push({
        name: c.name,
        title: c.title,
        href: scoped ? synclair(`/library/${scopeId}/${tierSlug(t.kind)}/${c.name}`) : `${t.path}/${c.name}`,
        surface: c.surface ?? scopeId,
        status: c.status,
        terms: `${c.name} ${c.title} ${c.categories.join(" ")}`.toLowerCase(),
      })
      byCategory.set(label, list)
    }
    return {
      kind: t.kind,
      label: t.label,
      href: scoped ? synclair(`/library/${scopeId}/${tierSlug(t.kind)}`) : t.path,
      count: ofTier.length,
      categories: [...byCategory.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, leaves]) => ({
          label,
          items: leaves.sort((a, b) => a.title.localeCompare(b.title)),
        })),
    }
  }).filter((t) => t.count > 0 || !scopedEmptyHidden)
}

// Tiers with zero items still render (they anchor the structure); flip this if
// empty tiers ever read as noise.
const scopedEmptyHidden = false

/** Build the full tree (all roots) — the client scopes it by pathname. */
export function buildLibraryTree(
  catalog: RegistryComponent[],
  foundationVisible: boolean
): LibraryTreeData {
  const items = catalog.filter((c) => isLibraryVisible(c, foundationVisible))
  const multiSurface = isMultiSurface()
  const surfaceOf = (c: RegistryComponent) => c.surface ?? defaultSurfaceId()

  if (!multiSurface) {
    const only = getSurfaces()[0]
    return {
      multiSurface,
      roots: [
        {
          id: only.id,
          label: only.label,
          href: synclair("/components"),
          count: items.length,
          tiers: tiersFor(items, only.id, false),
        },
      ],
      scopes: [],
    }
  }

  const sharedItems = items.filter((c) => surfaceOf(c) === SHARED_SURFACE_ID)
  const roots: TreeRootNode[] = getSurfaces().map((s) => {
    const own = items.filter((c) => surfaceOf(c) === s.id)
    return {
      id: s.id,
      label: s.label,
      badge: PLATFORM_BADGE[s.platform],
      href: synclair(`/library/${s.id}`),
      count: own.length,
      tiers: tiersFor(own, s.id, true),
    }
  })
  if (sharedItems.length > 0) {
    roots.push({
      id: SHARED_SURFACE_ID,
      label: "Shared",
      badge: "pkg",
      href: synclair(`/library/${SHARED_SURFACE_ID}`),
      count: sharedItems.length,
      tiers: tiersFor(sharedItems, SHARED_SURFACE_ID, true),
    })
  }
  return {
    multiSurface,
    roots,
    scopes: roots.map((r) => ({ id: r.id, label: r.label, badge: r.badge })),
  }
}
