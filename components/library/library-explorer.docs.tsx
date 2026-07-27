import { live, scene, type ComponentDoc } from "@/lib/system/doc-types"

/**
 * The explorer IS the shell every library route renders in — it can't mount a
 * second time inside itself, so its example renders the real block via its
 * standalone preview scene.
 */
const doc: ComponentDoc = {
  intent:
    "The two-pane shell of the library: a flat, hairline-separated explorer rail (the docs double-sidebar pattern — no card chrome, so it reads as a nested level rather than a second app sidebar) that scopes by surface and tier over a grouped, filterable item list, with the routed page beside it. It exists so every library route shares one navigation model — scope and tier live in the URL, so any filtered position is a shareable link. Single-surface projects get the same shell minus the surface level.",
  examples: [
    {
      title: "Live",
      description:
        "The real explorer over the real catalog tree — tier select, '/' filter, grouped item list, all working.",
      preview: scene("library-explorer", { height: 520 }),
      code: `const tree = buildLibraryTree(await getCatalog(), await isFoundationVisible())
return <LibraryExplorer tree={tree}>{children}</LibraryExplorer>`,
    },
  ],
  interactions: [
    {
      trigger: "Pick a tier (or surface) in the selects",
      behavior:
        "Navigates to that scope's route; the item list re-groups. The surface select offers surfaces only — back to the library home (or all-surfaces views) via the breadcrumb.",
      result: "Scope is in the URL path — shareable.",
    },
    {
      trigger: "Click a group header",
      behavior:
        "Collapses/expands the group (chevron rotates). Groups over 10 items start collapsed — except the one holding the current page's item — and a manual choice sticks while browsing.",
    },
    {
      trigger: "Switch the grouping (By function / By app area)",
      behavior:
        "Regroups the rail AND the tier gallery — function is the shadcn category taxonomy, app area derives from source paths (features/<area>, screens/<area>). Applies to scoped views and to single-surface projects; only a MULTI-surface list with nothing entered groups by surface instead, since that axis is the salient one there. (With one surface it would put every item in a single group, so the rail falls through to this grouping.)",
      result: "Grouping is ?group=area in the URL — shareable.",
    },
    {
      trigger: "Type in the filter",
      behavior:
        "Narrows the item list live (name, title, categories, area); matching group headers stay.",
      keyboard: "/ focuses the filter",
    },
    {
      trigger: "Click an item",
      behavior: "Routes to its doc page inside the same shell; the item takes the active dot.",
    },
    {
      trigger: "Scan for the right-side blue dot on an item",
      behavior:
        "Marks items that entered the catalog in the last 48 hours (day-precision addedAt), alongside the status dots (beta/deprecated).",
    },
  ],
  states: [
    {
      name: "No matches",
      description: "Filter text that matches nothing keeps the rail and shows an empty list.",
      preview: live(
        <div className="bg-card text-muted-foreground rounded-md border border-dashed p-4 text-xs">
          No items match &ldquo;xyz&rdquo;
        </div>
      ),
    },
  ],
  responsive: [
    { viewport: "mobile", behavior: "Rail stacks above the page content; selects stay first." },
    { viewport: "tablet", behavior: "Two panes; the rail narrows before the content does." },
    { viewport: "desktop", behavior: "Floating rail card beside the routed page." },
  ],
  props: [
    { name: "surface", type: "string", description: "Active surface scope (multi-surface projects)." },
    { name: "tier", type: "ComponentKind", description: "Active tier driving the grouped list." },
    { name: "children", type: "ReactNode", description: "The routed page rendered beside the rail." },
  ],
  notes:
    "Mounted once in `app/synclair/(library)/layout.tsx`; all ten library routes render inside it. Opts out of HubPage deliberately — it owns its own breadcrumb shell. On the multi-surface library HOME the rail is hidden: that page is the surface-picker dashboard, so a second sidebar beside it would be noise.",
}

export default doc
