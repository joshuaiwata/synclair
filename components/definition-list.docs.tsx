import { DefinitionList } from "@/components/definition-list"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const doc: ComponentDoc = {
  examples: [
    {
      title: "Key/value facts",
      description: "Term → value rows as a real `<dl>` — the standard way to render settings.",
      code: `<DefinitionList
  items={[
    { term: "Dev server", description: <code className="font-mono text-xs">npm run dev</code> },
    { term: "Port", description: "4100 — dedicated to Synclair" },
    { term: "Verify", description: <code className="font-mono text-xs">npm run verify-ui</code> },
  ]}
/>`,
      preview: live(
        <DefinitionList
          className="w-full max-w-lg"
          items={[
            {
              term: "Dev server",
              description: <code className="font-mono text-xs">npm run dev</code>,
            },
            { term: "Port", description: "4100 — dedicated to Synclair" },
            {
              term: "Verify",
              description: <code className="font-mono text-xs">npm run verify-ui</code>,
            },
          ]}
        />
      ),
    },
    {
      title: "Narrower term column",
      description: "Tune `termWidth` when the labels are short.",
      code: `<DefinitionList termWidth="6rem" items={[{ term: "Owner", description: "Platform team" }]} />`,
      preview: live(
        <DefinitionList
          className="w-full max-w-lg"
          termWidth="6rem"
          items={[
            { term: "Owner", description: "Platform team" },
            { term: "Status", description: "Active" },
          ]}
        />
      ),
    },
  ],
  props: [
    {
      name: "items",
      type: "{ term: ReactNode; description: ReactNode }[]",
      description: "The term → value pairs.",
    },
    { name: "termWidth", type: "string", default: "11rem", description: "Width of the term column." },
    { name: "className", type: "string", description: "Layout overrides on the `<dl>`." },
  ],
  notes:
    "Use for label-to-value data (settings, run commands, \"about\" facts) instead of forcing it into a headerless two-column table. Reach for a real Table only when the data is genuinely tabular. Pairs with `StatGrid` for at-a-glance overview facts.",
}

export default doc
