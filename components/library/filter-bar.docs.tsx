import { FilterBar } from "@/components/library/filter-bar"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const doc: ComponentDoc = {
  intent:
    "URL-driven facet chips for galleries. Each chip is a link that toggles its query param while preserving the others, so any filtered view is a shareable URL and the server component needs zero client state. The pills themselves are PillToggle in URL mode — one component owns the pill look.",
  examples: [
    {
      title: "Two facets",
      description: "Origin and usage groups; the active chip per group is filled.",
      code: `<FilterBar
  basePath={synclair("/components")}
  groups={[{ param: "origin", label: "Origin", options: [...] }]}
  active={{ origin: "custom", usage: "all" }}
/>`,
      preview: live(
        <FilterBar
          basePath="#"
          groups={[
            {
              param: "origin",
              label: "Origin",
              options: [
                { value: "all", label: "All", count: 33 },
                { value: "custom", label: "Custom", count: 11 },
                { value: "native", label: "shadcn", count: 22 },
              ],
            },
            {
              param: "usage",
              label: "Usage",
              options: [
                { value: "all", label: "All", count: 33 },
                { value: "used", label: "In use", count: 12 },
              ],
            },
          ]}
          active={{ origin: "custom", usage: "all" }}
        />
      ),
    },
  ],
  props: [
    { name: "basePath", type: "string", description: "Route the chips link back to." },
    {
      name: "groups",
      type: "FilterGroup[]",
      description: "One group per facet: `param`, `label`, and options with counts.",
    },
    {
      name: "active",
      type: "Record<string, string>",
      description: "Current value per param; \"all\" means the param is absent.",
    },
    {
      name: "preserve",
      type: "Record<string, string | undefined>",
      description: "Params outside these groups to keep on every chip href (e.g. the surface scope).",
    },
  ],
  notes:
    "Counts ride on every chip so a facet's size is visible before clicking — never color alone. Composes `PillToggle`; the pill markup lives there, not here.",
}

export default doc
