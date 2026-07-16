/**
 * The three altitudes of the component library. One source of truth for the
 * vocabulary and routing — each tier is its own top-level page in the sidebar.
 */
import type { ComponentKind } from "./components"
import { synclair } from "./routes"

export interface TierMeta {
  kind: ComponentKind
  /** Plural display label (sidebar + page title). */
  label: string
  /** Singular label (detail-page badge). */
  singular: string
  /** Top-level route for this tier's gallery. */
  path: string
  /** One-line definition of what lives at this tier. */
  description: string
}

export const TIERS: TierMeta[] = [
  {
    kind: "component",
    label: "Components",
    singular: "Component",
    path: synclair("/components"),
    description:
      "Focused, single-purpose UI pieces built on shadcn primitives — a status badge, a stat card, a page header.",
  },
  {
    kind: "block",
    label: "Blocks",
    singular: "Block",
    path: synclair("/blocks"),
    description:
      "Larger reusable parts assembled from components. A block owns its internal layout and states and takes data via props — it never fetches or knows about routes.",
  },
  {
    kind: "template",
    label: "Templates",
    singular: "Template",
    path: synclair("/templates"),
    description:
      "Documented views: full screen designs assembled from blocks and components, registered from the routes that instantiate them. The doc page is the UX documentation of the view; its example embeds the running route.",
  },
]

const BY_KIND = new Map(TIERS.map((t) => [t.kind, t]))

export function tier(kind: ComponentKind): TierMeta {
  return BY_KIND.get(kind) ?? TIERS[0]
}

/** URL segment for a tier ("components" | "blocks" | "templates"). */
export function tierSlug(kind: ComponentKind): string {
  return tier(kind).path.split("/").pop() ?? "components"
}

/** Tier for a URL segment, or undefined for an unknown one. */
export function tierBySlug(slug: string): TierMeta | undefined {
  return TIERS.find((t) => tierSlug(t.kind) === slug)
}

/**
 * Detail-page href for a registered item. Pass the item's surface in
 * multi-surface projects — names may collide across surfaces (a web `button`
 * vs an RN `button`), and the surface-scoped path (`/synclair/library/<surface>/
 * <tier>/<name>`) disambiguates. Without a surface: the flat path — today's
 * canonical URL, and the concept page when a name spans surfaces.
 */
export function itemHref(kind: ComponentKind, name: string, surface?: string): string {
  if (surface) return synclair(`/library/${surface}/${tierSlug(kind)}/${name}`)
  return `${tier(kind).path}/${name}`
}
