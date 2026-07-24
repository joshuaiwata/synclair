import { TabsNav } from "@/components/tabs-nav"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const doc: ComponentDoc = {
  examples: [
    {
      title: "URL-driven view switch",
      description:
        "Each option is a real `<Link>` — a server component drives the active view from a URL param, and every view is deep-linkable.",
      code: `<TabsNav
  aria-label="Environment view"
  value={active}
  options={[
    { value: "project", label: "Acme", href: synclair("/environment") },
    { value: "synclair", label: "Synclair", href: \`\${synclair("/environment")}?view=synclair\` },
  ]}
/>`,
      preview: live(
        <TabsNav
          aria-label="Environment view"
          value="project"
          options={[
            { value: "project", label: "Acme", href: "#project" },
            { value: "synclair", label: "Synclair", href: "#synclair" },
          ]}
        />
      ),
    },
    {
      title: "With counts",
      description: "A trailing tabular count per view — number rides as text, never color alone.",
      code: `<TabsNav
  aria-label="Library view"
  value="components"
  options={[
    { value: "components", label: "Components", href: "…", count: 37 },
    { value: "blocks", label: "Blocks", href: "…", count: 7 },
  ]}
/>`,
      preview: live(
        <TabsNav
          aria-label="Library view"
          value="components"
          options={[
            { value: "components", label: "Components", href: "#components", count: 37 },
            { value: "blocks", label: "Blocks", href: "#blocks", count: 7 },
          ]}
        />
      ),
    },
  ],
  props: [
    {
      name: "options",
      type: "TabsNavOption[]",
      description: "`{ value, label, href, count? }` per tab — every option is a link.",
    },
    { name: "value", type: "string", description: "The currently-active option value." },
    {
      name: "aria-label",
      type: "string",
      description: 'Accessible nav label (e.g. "Environment view").',
    },
    { name: "className", type: "string", description: "Layout overrides on the nav rail." },
  ],
  notes:
    "The URL-mode sibling of the shadcn `Tabs` — same muted rail and raised active chip, but server-safe links instead of client state. The hub's tab rule: content switching gets tab chrome (`Tabs` for client state, `TabsNav` for URL params); filtering gets `PillToggle`.",
}

export default doc
