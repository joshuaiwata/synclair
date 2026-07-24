import { TabsNav } from "@/components/tabs-nav"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const doc: ComponentDoc = {
  intent:
    "THE one control for flipping between a multi-frontend project's app surfaces (web app, companion app, shared packages) — the same switcher on the tier galleries and the pages sitemap, so the switch reads identically everywhere instead of each page inventing its own. Renders nothing for single-surface projects, so callers place it unconditionally.",
  examples: [
    {
      title: "On a tier gallery",
      description:
        "All-surfaces plus one tab per surface and the Shared packages, with live counts. (Shown here via TabsNav — the real component gates on isMultiSurface() and reads the seed.)",
      code: `<SurfaceSwitcher
  active={scope}
  allHref={t.path}
  hrefFor={(id) => synclair(\`/library/\${id}/\${tierSlug(kind)}\`)}
  includeShared
  counts={perSurfaceCounts}
/>`,
      preview: live(
        <TabsNav
          aria-label="Surface"
          value="portal"
          options={[
            { value: "all", label: "All surfaces", href: "#all" },
            { value: "portal", label: "Portal", href: "#portal", count: 24 },
            { value: "mobile", label: "Mobile", href: "#mobile", count: 9 },
            { value: "shared", label: "Shared", href: "#shared", count: 12 },
          ]}
        />
      ),
      viewports: false,
    },
  ],
  props: [
    {
      name: "active",
      type: "string",
      description: "The active surface id; undefined marks the all-surfaces tab.",
    },
    {
      name: "hrefFor",
      type: "(surfaceId: string) => string",
      description: "Where a surface's scoped view lives (also called for SHARED_SURFACE_ID).",
    },
    {
      name: "allHref",
      type: "string",
      description: "The unscoped all-surfaces view; omit to hide that tab.",
    },
    {
      name: "counts",
      type: "Record<string, number>",
      description: "Optional per-surface item counts, keyed by surface id.",
    },
    {
      name: "includeShared",
      type: "boolean",
      default: "false",
      description: "Offer the Shared (packages) scope as its own tab.",
    },
  ],
  notes:
    "Built on `TabsNav` (URL-driven, server-safe, deep-linkable). The `isMultiSurface()` gate lives inside the component — single-app clones pay zero chrome and no conditional at the call site. Declared surfaces come from `lib/system/seed/surfaces.ts`.",
}

export default doc
