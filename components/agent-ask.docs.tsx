import { Plus, RefreshCw } from "lucide-react"

import { AgentAsk } from "@/components/agent-ask"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const doc: ComponentDoc = {
  examples: [
    {
      title: "Create something",
      description:
        "Where a create form used to sit. One plain sentence, ending in a bracketed slot the user fills in before sending.",
      code: `<AgentAsk
  label="New"
  icon={<Plus />}
  title="New summary"
  prompt={\`Add a new project summary to Synclair and write it from the project knowledge: [what it should cover, and who for]\`}
  note="product-summary skill"
/>`,
      preview: live(
        <AgentAsk
          label="New"
          icon={<Plus />}
          title="New summary"
          prompt={`Add a new project summary to Synclair and write it from the project knowledge: [what it should cover, and who for]`}
          note="product-summary skill"
        />
      ),
    },
    {
      title: "Refresh something",
      description:
        "Same shape for a re-run. The outline default is the page-level treatment: present in the title row without competing with the page content.",
      code: `<AgentAsk
  label="Refresh"
  icon={<RefreshCw />}
  title="Re-sync the Figma manifest"
  prompt="Re-sync the Figma manifest from the live file and update the stored snapshot."
  note="figma-distiller skill"
/>`,
      preview: live(
        <AgentAsk
          label="Refresh"
          icon={<RefreshCw />}
          title="Re-sync the Figma manifest"
          prompt="Re-sync the Figma manifest from the live file and update the stored snapshot."
          note="figma-distiller skill"
        />
      ),
    },
  ],
  props: [
    { name: "label", type: "string", description: "Trigger label — the action in the user's words." },
    { name: "icon", type: "ReactNode", description: "Optional leading icon for the trigger." },
    { name: "title", type: "string", description: "Popover heading — what the agent will produce." },
    {
      name: "prompt",
      type: "string",
      description: "The prompt handed to the agent. Rendered verbatim and copied verbatim.",
    },
    {
      name: "note",
      type: "string",
      description: "One line of context — the skill that runs it, or where the output lands.",
    },
    {
      name: "variant",
      type: "ButtonVariant",
      default: '"outline"',
      description:
        "Trigger variant. The outline default is the page-level treatment; pass \"ghost\" for a trigger that sits inside a row of chips.",
    },
    { name: "size", type: "ButtonSize", default: '"sm"', description: "Trigger button size." },
    { name: "align", type: '"start" | "center" | "end"', default: '"start"', description: "Popover alignment." },
  ],
  notes:
    "The hand-off affordance for work only an agent can do. Synclair's content is written by agents running skills — a control that mimics doing the work itself (an inline create form, a Refresh that syncs) teaches the wrong model and leaves the user waiting on something this UI never performs. Reach for AgentAsk wherever the honest answer is \"tell your agent\": generate, refresh, re-run, distill, catalog. Write the prompt as one plain sentence a person would actually say — no jargon, no template syntax. When it needs something from the user, end with a bracketed slot (\"…and distill it: [paste the link]\") so they fill it in before sending instead of the agent stopping to ask.",
}

export default doc
