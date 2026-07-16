import { Boxes, GitCommitHorizontal } from "lucide-react"

import { StatCard } from "@/components/stat-card"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const doc: ComponentDoc = {
  examples: [
    {
      title: "With icon",
      code: `<StatCard value="8" label="Library components" icon={Boxes} />`,
      preview: live(<StatCard className="w-56" value="8" label="Library components" icon={Boxes} />),
    },
    {
      title: "Summary strip",
      description: "Sits in a row as a dashboard summary.",
      preview: live(
        <div className="flex flex-wrap gap-3">
          <StatCard className="w-48" value="8" label="Components" icon={Boxes} />
          <StatCard className="w-48" value="3" label="Blocks" icon={GitCommitHorizontal} />
          <StatCard className="w-48" value="0" label="Templates" />
        </div>
      ),
    },
    {
      title: "No icon",
      code: `<StatCard value="0" label="Templates" />`,
      preview: live(<StatCard className="w-56" value="0" label="Templates" />),
    },
  ],
  props: [
    { name: "value", type: "string", description: "The big metric value." },
    { name: "label", type: "string", description: "Caption under the value (truncates)." },
    { name: "icon", type: "LucideIcon", description: "Optional leading icon in a chip." },
    { name: "className", type: "string", description: "Width/spacing overrides." },
  ],
  notes:
    "Compact metric card for dashboard summary strips. Icon chip uses the `--secondary` token. Keep `value` short — the label truncates but the value does not.",
}

export default doc
