import { live, scene, type ComponentDoc } from "@/lib/system/doc-types"

/**
 * The doc view renders the page this documentation appears on, so its example
 * renders the real block via its standalone preview scene — documenting a real
 * item (stat-card).
 */
const doc: ComponentDoc = {
  intent:
    "Renders one registered item's documentation page from its ComponentDoc: identity header, previews, and the Intent / Anatomy / Examples / Interactions / Responsive / States / Props / Used-in sections. It exists so a docs module is pure data — every item page is this one renderer, which is what keeps the library one system instead of hand-built pages.",
  examples: [
    {
      title: "Live",
      description:
        "The real doc view rendering a real item's page (stat-card) — the same renderer producing the page you are reading.",
      preview: scene("component-doc-view", { height: 560 }),
      code: `<ComponentDocView name="stat-card" expectedKind="component" />`,
    },
  ],
  interactions: [
    {
      trigger: "Visit a bare name that exists on several surfaces",
      behavior: "Renders the concept page — one card per implementation.",
      result: "Choosing a surface routes to its scoped doc page.",
    },
    {
      trigger: "Interact with a live example (open a dialog, hover a tooltip)",
      behavior: "Examples are real mounted components, not screenshots.",
    },
  ],
  states: [
    {
      name: "No docs module",
      description: "Registered item without a .docs.tsx — an instructing empty state.",
      preview: live(
        <div className="bg-card text-muted-foreground rounded-md border border-dashed p-4 text-xs">
          No documentation module yet — add name.docs.tsx and register it in lib/system/docs.ts.
        </div>
      ),
    },
    {
      name: "Docs stale",
      description: "Commit-anchored sync check failed — badge in the identity header.",
      preview: live(
        <div className="bg-card text-warning rounded-md border p-4 text-xs">docs stale</div>
      ),
    },
  ],
  responsive: [
    { viewport: "mobile", behavior: "Single column; tables scroll horizontally in place." },
    { viewport: "tablet", behavior: "Same column, wider preview frames." },
    { viewport: "desktop", behavior: "Reading column at max-w-3xl; templates widen the page to a max-w-6xl lane so the render areas (Live preview, Examples) breathe while prose, tables, and code stay at the reading width. Template examples also offer fullscreen in the viewport frame." },
  ],
  props: [
    { name: "name", type: "string", description: "The registry item (or concept) to render." },
    { name: "expectedKind", type: "ComponentKind", description: "Route guard — /components/foo can't resolve a block." },
    { name: "surface", type: "string", description: "Disambiguates name collisions across surfaces." },
  ],
  notes:
    "Origin decides the sourcing: registered items read their colocated docs module, natives read the native-previews map + upstream link, host items read the external catalog (live import or documented screenshot). One renderer, four sourcing paths.",
}

export default doc
