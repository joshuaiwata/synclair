import { StepLadder } from "@/components/step-ladder"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const items = [
  { title: "Requirements", detail: "What the view must do." },
  { title: "Foundations", detail: "Primitives and theme." },
  { title: "Compose", detail: "Assemble from the ladder." },
]

const doc: ComponentDoc = {
  examples: [
    {
      title: "Vertical (default)",
      code: `<StepLadder items={items} />`,
      preview: live(<StepLadder className="w-full max-w-md" items={items} />),
    },
    {
      title: "Horizontal",
      description: "Steps flow across on ≥sm screens.",
      code: `<StepLadder orientation="horizontal" items={items} />`,
      preview: live(<StepLadder orientation="horizontal" items={items} />),
    },
  ],
  props: [
    {
      name: "items",
      type: "{ title: string; detail: string }[]",
      description: "Ordered steps; numbered automatically.",
    },
    {
      name: "orientation",
      type: `"vertical" | "horizontal"`,
      default: `"vertical"`,
      description: "Stack down, or flow across into equal columns.",
    },
    { name: "className", type: "string", description: "Extra classes on the list element." },
  ],
  notes:
    "Renders a semantic `<ol>`. Use for workflows, priority orders, and any 'do these in order' explanation. Step numbers use the `--secondary` token in a mono chip.",
}

export default doc
