import { PillToggle } from "@/components/pill-toggle"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const doc: ComponentDoc = {
  examples: [
    {
      title: "State mode",
      description: "Omit `href` and pass `onValueChange` — renders `<button>`s for client selection.",
      code: `<PillToggle
  aria-label="Origin"
  value="project"
  onValueChange={setOrigin}
  options={[
    { value: "project", label: "Acme" },
    { value: "foundation", label: "Synclair" },
  ]}
/>`,
      preview: live(
        <PillToggle
          aria-label="Origin"
          value="project"
          options={[
            { value: "project", label: "Acme" },
            { value: "foundation", label: "Synclair" },
          ]}
        />
      ),
    },
    {
      title: "With counts",
      description: "A trailing tabular count per option — number rides as text, never color alone.",
      code: `<PillToggle
  aria-label="Surface"
  value="all"
  onValueChange={setSurface}
  options={[
    { value: "all", label: "All", count: 21 },
    { value: "portal", label: "Portal", count: 13 },
    { value: "admin", label: "Admin", count: 8 },
  ]}
/>`,
      preview: live(
        <PillToggle
          aria-label="Surface"
          value="all"
          options={[
            { value: "all", label: "All", count: 21 },
            { value: "portal", label: "Portal", count: 13 },
            { value: "admin", label: "Admin", count: 8 },
          ]}
        />
      ),
    },
    {
      title: "URL mode",
      description:
        "Give each option an `href` and it renders `<Link>`s, so a server component can drive a FILTER facet through the URL.",
      code: `<PillToggle
  aria-label="Origin"
  value={origin}
  options={[
    { value: "all", label: "All", count: 37, href: basePath },
    { value: "custom", label: "Custom", count: 15, href: \`\${basePath}?origin=custom\` },
    { value: "native", label: "shadcn", count: 22, href: \`\${basePath}?origin=native\` },
  ]}
/>`,
      preview: live(
        <PillToggle
          aria-label="Origin"
          value="custom"
          options={[
            { value: "all", label: "All", count: 37, href: "#all" },
            { value: "custom", label: "Custom", count: 15, href: "#custom" },
            { value: "native", label: "shadcn", count: 22, href: "#native" },
          ]}
        />
      ),
    },
  ],
  props: [
    { name: "options", type: "PillOption[]", description: "`{ value, label, count?, href? }` per pill." },
    { name: "value", type: "string", description: "The currently-active option value." },
    {
      name: "onValueChange",
      type: "(value: string) => void",
      description: "State-mode only: called with the option value on click.",
    },
    {
      name: "aria-label",
      type: "string",
      description: "Accessible group label (e.g. \"Surface\", \"Origin\").",
    },
    { name: "className", type: "string", description: "Layout overrides on the pill row." },
  ],
  notes:
    "The one rounded-pill toggle for a single FILTER facet — the hub's tab rule: filtering gets pills, content/view switching gets tab chrome (`Tabs` for client state, `TabsNav` for URL params). Replaced three byte-identical hand-rolled copies. URL mode (with `href`) for server components; state mode (with `onValueChange`) for client ones — same options either way.",
}

export default doc
