import { Markdown } from "@/components/markdown"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const SAMPLE = `### Distilled digest

The **one prose renderer** — every summary, doc note, and digest goes through it.

- GFM lists, tables, and \`inline code\`
- Dense, neutral voice — no typography plugin

| Tier | Count |
| --- | --- |
| Components | 33 |
| Blocks | 3 |
`

const doc: ComponentDoc = {
  intent:
    "One renderer for every piece of prose the hub shows — knowledge summaries, doc notes, digests, references. It exists so markdown authored anywhere (agents, humans, generators) lands in the same dense, token-themed voice, and so prose styling is fixed in exactly one file.",
  examples: [
    {
      title: "Default",
      description: "GFM markdown in the hub's neutral, dense voice.",
      code: `<Markdown>{digest}</Markdown>`,
      preview: live(
        <div className="w-full max-w-sm text-sm">
          <Markdown>{SAMPLE}</Markdown>
        </div>
      ),
    },
  ],
  props: [
    { name: "children", type: "string", description: "The markdown source." },
    {
      name: "html",
      type: "boolean",
      default: "false",
      description:
        "Renders repo-committed inline HTML/SVG that inherits theme tokens. Never enable for external or user-supplied input.",
    },
    { name: "className", type: "string", description: "Overrides on the wrapper." },
  ],
  notes:
    "Named in the component-library skill's shared-UI canon: prose → `Markdown`. Headings, lists, tables, code, links, and blockquotes are all styled here — if a summary looks wrong, fix it in this one file, not per page.",
}

export default doc
