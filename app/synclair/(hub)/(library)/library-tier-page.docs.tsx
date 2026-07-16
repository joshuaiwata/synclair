import { live, route, type ComponentDoc } from "@/lib/system/doc-types"
import { synclair } from "@/lib/system/routes"
import { SkeletonBar, SkeletonRow, WireframeBlock, WireframeFrame } from "@/components/wireframe-kit"

/**
 * The reference implementation for the TEMPLATE tier: a template documents a
 * VIEW — a full screen design that real routes instantiate — so its docs are
 * UX documentation first (intent, anatomy, interactions, responsive) and its
 * Example embeds the RUNNING route via route(), never a re-mount of the page
 * inside the doc column.
 */
const doc: ComponentDoc = {
  intent:
    "The one screen design behind the whole library catalog: Components, Blocks, and Templates are not three pages but ONE view instantiated three times with a different catalog slice. It exists so the catalog reads identically at every altitude — same census line, same facet filters, same category-grouped card gallery — and so adding a tier (or a surface scope) never invents a new screen. Reach for it as the copy-and-adapt starting point for any 'browse a catalog of registered things' view; don't reach for it when the collection needs a dense tree or comparison table instead of cards.",
  anatomy: {
    description:
      "Hub chrome (sidebar + sticky page header) comes from the (hub) layout, and the (library) layout wraps every library route in the two-pane explorer (tree rail + content pane); the view owns the content pane. One view, parameterized by tier.",
    preview: live(
      <div className="bg-card flex w-full max-w-2xl gap-3 rounded-lg border p-3">
        <WireframeFrame label="Sidebar" solid className="w-24 shrink-0">
          <SkeletonBar className="w-14" />
          <SkeletonBar className="w-16" />
          <SkeletonBar className="w-12" />
        </WireframeFrame>
        <div className="flex min-w-0 grow flex-col gap-3">
          <WireframeFrame label="Page header" solid>
            <SkeletonRow widths={["w-24", "w-40"]} />
          </WireframeFrame>
          <div className="flex gap-3">
            <WireframeFrame label="Explorer tree" solid className="w-24 shrink-0">
              <SkeletonBar className="w-14" />
              <SkeletonBar className="w-16" />
              <SkeletonBar className="w-12" />
            </WireframeFrame>
            <div className="flex min-w-0 grow flex-col gap-3">
              <WireframeFrame label="Title strip + census">
                <SkeletonRow widths={["w-28", "w-48"]} />
                <SkeletonBar className="w-3/4" />
              </WireframeFrame>
              <WireframeFrame label="Filter bar">
                <SkeletonRow widths={["w-16", "w-16", "w-16"]} />
              </WireframeFrame>
              <WireframeFrame label="Card gallery" focal>
                <div className="grid grid-cols-3 gap-2">
                  <WireframeBlock label="Card" />
                  <WireframeBlock label="Card" />
                  <WireframeBlock label="Card" />
                </div>
              </WireframeFrame>
            </div>
          </div>
        </div>
      </div>
    ),
    regions: [
      {
        name: "Explorer tree",
        purpose:
          "The (library) layout's dense filterable rail — every library route shares it; the view never owns navigation (the library-explorer block).",
      },
      {
        name: "Title strip + census",
        purpose:
          "Tier name with the live census line (registered / custom / in-use counts; host-basis split in companion mode) — the at-a-glance health of the tier.",
      },
      {
        name: "Filter bar",
        purpose: "Facet chips (origin, usage) that write shareable query params.",
      },
      {
        name: "Card gallery",
        purpose:
          "The point of the page: category-grouped cards with live zoom-to-fit thumbs, each linking to the item's doc page (the tier-gallery block).",
      },
      {
        name: "Empty state",
        purpose:
          "Replaces the gallery when the tier has no items (educates how it populates) or when filters match nothing (offers a reset).",
      },
    ],
  },
  examples: [
    {
      title: "Live route — Components tier",
      description:
        "The running view itself, embedded via route(): the same screen serves /synclair/components, /synclair/blocks, and /synclair/templates.",
      preview: route(synclair("/components"), { height: 560 }),
      code: `// app/synclair/(hub)/(library)/<tier>/page.tsx — the whole instantiation:
<TierGallery kind="component" filters={{ origin, usage }} />`,
    },
  ],
  interactions: [
    {
      trigger: "Click a filter chip",
      behavior: "Toggles that facet's query param, preserving the others.",
      result: "A shareable filtered URL; the gallery re-slices server-side.",
    },
    {
      trigger: "Click a card",
      behavior: "Navigates to the item's doc page at /{tier}/[name].",
      result: "The concept page instead, when the name spans surfaces.",
    },
    {
      trigger: "Visit with a legacy ?surface= param",
      behavior: "Redirects to the surface-scoped path /library/<surface>/<tier>.",
      result: "Surface lives in the PATH, never a query param.",
    },
  ],
  states: [
    {
      name: "Empty tier",
      description:
        "No items registered at this tier yet — an educating empty state pointing at the component-library skill, not an error.",
      preview: live(
        <div className="bg-card text-muted-foreground rounded-md border border-dashed p-4 text-xs">
          No templates yet — build a view and register it via the component-library skill.
        </div>
      ),
    },
    {
      name: "Filtered to nothing",
      description: "Facets match zero items — offers clearing the filters instead of educating.",
      preview: live(
        <div className="bg-card text-muted-foreground rounded-md border border-dashed p-4 text-xs">
          Nothing matches these filters · Clear filters
        </div>
      ),
    },
    {
      name: "Companion coverage strip",
      description:
        "Existing-project mode, components tier only: the live host scan surfaces uncataloged component files and cataloged-but-unused entries above the filters.",
      preview: live(
        <div className="bg-card text-muted-foreground rounded-md border p-4 text-xs">
          Live host scan: 3 component files in the app aren&apos;t cataloged yet · 1 cataloged but
          unused
        </div>
      ),
    },
  ],
  responsive: [
    {
      viewport: "mobile",
      behavior:
        "Sidebar goes off-canvas; the explorer tree stacks above the content; single-column cards, filter chips wrap.",
    },
    { viewport: "tablet", behavior: "Icon-rail sidebar; tree rail narrows; two-column card grid." },
    {
      viewport: "desktop",
      behavior: "Full sidebar; floating tree rail beside the view; three-column card grid grouped by category.",
    },
  ],
  props: [
    {
      name: "route",
      type: "{components | blocks | templates} (under the hub mount)",
      description: "The tier is the instantiation — each route passes a fixed kind to the view.",
    },
    {
      name: "?origin",
      type: '"native" | "custom" | ...',
      default: "all",
      description: "Origin facet filter, written by the filter bar.",
    },
    {
      name: "?usage",
      type: '"in-use" | "unused"',
      default: "all",
      description: "Usage facet filter, from the live route-tree usage scan.",
    },
  ],
  notes:
    "**A template documents a view, not a component.** Its registered files are the routes that instantiate the design — here `/synclair/components`, `/synclair/blocks`, and `/synclair/templates` (the surface-scoped `/library/[surface]/[tier]` explorer reuses the same view). The page-level props table is the URL contract: route params + query params, because that IS a view's API. Composition: each instantiation is a one-line wrapper around the `tier-gallery` block, which owns the gallery internals (documented on its own doc page — this page documents the screen, not the block). Deviation recorded there: the gallery fetches its own catalog data rather than taking props.",
}

export default doc
