/**
 * The taxonomy that groups skills and agents on the AI Setup page, so a human
 * can see at a glance what each capability is FOR. One controlled vocabulary
 * shared by both — the category id lives in each `.md`'s frontmatter
 * (`category: <id>`, self-describing and travels with the file through clones),
 * while the labels, order, and section descriptions live here so the UI stays
 * consistent and typos fall into "Other" instead of inventing a group.
 */

export interface CapabilityCategory {
  id: string
  /** Section heading in the UI. */
  label: string
  /** One line under the heading — what this group of capabilities is for. */
  description: string
}

/** Display order is this array's order. */
export const CAPABILITY_CATEGORIES: CapabilityCategory[] = [
  {
    id: "build",
    label: "Build",
    description: "Design, build, document, and maintain the product's UI and component library.",
  },
  {
    id: "knowledge",
    label: "Knowledge",
    description: "Capture, distill, and retrieve what the product must do.",
  },
  {
    id: "intake",
    label: "Codebase intake",
    description: "Survey an existing codebase and reflect it into the hub.",
  },
  {
    id: "foundation",
    label: "Foundation",
    description: "Keep the Synclair foundation itself healthy and in sync with upstream.",
  },
  {
    id: "tooling",
    label: "Tooling",
    description: "Run and operate Synclair.",
  },
]

/** Catch-all for capabilities whose frontmatter category is missing or unknown. */
export const UNCATEGORIZED: CapabilityCategory = {
  id: "other",
  label: "Other",
  description: "Not yet categorized — add a `category:` to its frontmatter.",
}

/**
 * Which layer a skill/agent belongs to — the same split as components'
 * `meta.layer`. "foundation" ships with Synclair and syncs from upstream via
 * synclair-sync; "project" is this repo's own work and never syncs (like seed).
 */
export type CapabilityLayer = "foundation" | "project"

/** Coerce a frontmatter `layer:` string to the union; absent/unknown ⇒ project. */
export function layerOf(raw?: string): CapabilityLayer {
  return raw === "foundation" ? "foundation" : "project"
}

const BY_ID = new Map(CAPABILITY_CATEGORIES.map((c) => [c.id, c]))

/** Resolve a frontmatter category id to a category, falling back to "Other". */
export function categoryFor(id?: string): CapabilityCategory {
  return (id && BY_ID.get(id)) || UNCATEGORIZED
}

/**
 * Group entries into taxonomy order, dropping empty categories. "Other" only
 * appears when something is genuinely uncategorized.
 */
export function groupByCategory<T>(
  items: T[],
  getCategoryId: (item: T) => string | undefined
): { category: CapabilityCategory; items: T[] }[] {
  const order = [...CAPABILITY_CATEGORIES, UNCATEGORIZED]
  return order
    .map((category) => ({
      category,
      items: items.filter((it) => categoryFor(getCategoryId(it)).id === category.id),
    }))
    .filter((group) => group.items.length > 0)
}
