import { StatCard } from "@/components/stat-card"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const doc: ComponentDoc = {
  examples: [
    {
      title: "Summary strip",
      description: "Sits in a row as a page's numeric census.",
      code: `<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
  <StatCard value="52" label="Pages" />
  <StatCard value="405" label="Component uses" />
  …
</div>`,
      preview: live(
        <div className="flex flex-wrap gap-3">
          <StatCard className="w-48" value="8" label="Components" />
          <StatCard className="w-48" value="3" label="Blocks" />
          <StatCard className="w-48" value="0" label="Templates" />
        </div>
      ),
    },
    {
      title: "With a note",
      description: "A small qualifier under the label — a file count, a caveat.",
      code: `<StatCard value="227" label="Arbitrary Tailwind values" note="67 files" />`,
      preview: live(
        <StatCard className="w-56" value="227" label="Arbitrary Tailwind values" note="67 files" />
      ),
    },
  ],
  props: [
    { name: "value", type: "string", description: "The big metric value." },
    { name: "label", type: "string", description: "Caption under the value (truncates)." },
    { name: "note", type: "string", description: "Optional qualifier line under the label." },
    { name: "className", type: "string", description: "Width/spacing overrides." },
  ],
  notes:
    "THE numeric-census unit hub-wide (Pages, Figma Manifest, Hygiene summaries) — deliberately plain (figure + label + note, no icon chip) and non-interactive, unlike the library's clickable cards. Keep `value` short — the label truncates but the value does not. For labeled TEXT facts (stack sheets, environment info) use StatGrid instead.",
}

export default doc
