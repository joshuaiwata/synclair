import { live, scene, type ComponentDoc } from "@/lib/system/doc-types"

/**
 * The gallery IS the Components/Blocks/Templates page, so its example renders
 * the real block via its standalone preview scene — the live catalog, live
 * thumbs.
 */
const doc: ComponentDoc = {
  intent:
    "The card gallery a library tier page renders: filter chips, category-grouped cards with live zoom-to-fit preview thumbnails (a registered item may opt into a screenshot thumb via meta.previewImage) and status/origin badges, the host-coverage strip in companion mode, and educating empty states. It exists so all three tiers (and every surface scope) present the catalog identically — one gallery, parameterized by tier.",
  examples: [
    {
      title: "Live",
      description:
        "The real gallery over the live catalog (components tier) — filter chips, grouped cards, zoom-to-fit thumbs.",
      preview: scene("tier-gallery", { height: 560 }),
      code: `<TierGallery kind="component" filters={{ origin, usage }} />`,
    },
  ],
  interactions: [
    {
      trigger: "Click a filter chip",
      behavior: "Toggles that facet's query param, preserving the others.",
      result: "A shareable filtered URL.",
    },
    {
      trigger: "Click a card",
      behavior: "Routes to the item's doc page (or its concept page on multi-surface collisions).",
    },
  ],
  states: [
    {
      name: "Empty tier",
      description: "No items registered in this tier — an educating empty state, not an error.",
      preview: live(
        <div className="bg-card text-muted-foreground rounded-md border border-dashed p-4 text-xs">
          No templates yet — register one via the component-library skill.
        </div>
      ),
    },
  ],
  responsive: [
    { viewport: "mobile", behavior: "Single-column cards; filter chips wrap." },
    { viewport: "tablet", behavior: "Two-column card grid." },
    { viewport: "desktop", behavior: "Three-column card grid grouped by category." },
  ],
  props: [
    { name: "kind", type: "ComponentKind", description: "Which tier to render (component / block / template)." },
    { name: "surface", type: "string", description: "Optional surface scope (multi-surface projects)." },
    {
      name: "searchParams",
      type: "Record<string, string>",
      description: "Active facet values (origin, usage) — the FilterBar chips derive from these.",
    },
  ],
  notes:
    "Deliberate deviation from the block contract, recorded here: TierGallery fetches its own data (`getCatalog`, `getUsageMap`, host coverage) instead of taking it via props — it is the catalog's rendering, so the seam is acceptable until a second consumer needs it injected. Card internals (`component-card.tsx`, `card-thumb.tsx`) ride as files of this block rather than as separate registry entries.",
}

export default doc
