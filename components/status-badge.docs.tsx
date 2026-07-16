import { StatusBadge } from "@/components/status-badge"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const doc: ComponentDoc = {
  examples: [
    {
      title: "Statuses",
      description: "The four semantic dot colors.",
      code: `<StatusBadge status="success">Connected</StatusBadge>
<StatusBadge status="info">Planned</StatusBadge>
<StatusBadge status="warning">Open</StatusBadge>
<StatusBadge status="neutral">Idle</StatusBadge>`,
      preview: live(
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status="success">Connected</StatusBadge>
          <StatusBadge status="info">Planned</StatusBadge>
          <StatusBadge status="warning">Open</StatusBadge>
          <StatusBadge status="neutral">Idle</StatusBadge>
        </div>
      ),
    },
    {
      title: "Default (neutral)",
      description: "Omitting `status` falls back to neutral.",
      code: `<StatusBadge>Unknown</StatusBadge>`,
      preview: live(<StatusBadge>Unknown</StatusBadge>),
    },
  ],
  props: [
    {
      name: "status",
      type: `"success" | "info" | "warning" | "neutral"`,
      default: `"neutral"`,
      description: "Color of the leading status dot.",
    },
    {
      name: "children",
      type: "ReactNode",
      description: "Label text next to the dot.",
    },
    {
      name: "...props",
      type: "ComponentProps<typeof Badge>",
      description: "All Badge props pass through (className, etc.).",
    },
  ],
  notes:
    "Built on the shadcn `Badge` (outline variant). Dot colors come from the `--success` / `--info` / `--warning` semantic theme tokens — never hardcode a hex. Use it in tabular status columns and for connection/lifecycle states.",
}

export default doc
