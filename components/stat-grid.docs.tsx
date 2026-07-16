import { StatGrid } from "@/components/stat-grid"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const doc: ComponentDoc = {
  examples: [
    {
      title: "At-a-glance facts",
      description:
        "A calm bordered panel of labeled facts — one uppercase label, a value, and an optional note per item.",
      code: `<StatGrid
  items={[
    { label: "Monorepo", value: "npm workspaces", note: "apps/* + packages/*" },
    { label: "Web framework", value: "Vite + React 18" },
    { label: "Routing", value: "React Router v7" },
    { label: "Backend", value: "None — mock API", note: "auth/billing simulated" },
  ]}
/>`,
      preview: live(
        <StatGrid
          className="w-full max-w-2xl"
          items={[
            { label: "Monorepo", value: "npm workspaces", note: "apps/* + packages/*" },
            { label: "Web framework", value: "Vite + React 18" },
            { label: "Routing", value: "React Router v7" },
            { label: "Backend", value: "None — mock API", note: "auth/billing simulated" },
          ]}
        />
      ),
    },
  ],
  props: [
    {
      name: "items",
      type: "{ label: string; value: ReactNode; note?: ReactNode }[]",
      description: "The facts to display.",
    },
    { name: "className", type: "string", description: "Layout overrides on the grid." },
  ],
  notes:
    "Supersedes the bordered `gap-px` cell grid that read as a \"block table\" of boxed cells — same facts, one calm panel separated by whitespace. Use for scannable overview facts (stack, environment, a system-map summary); use `DefinitionList` when the data reads better as sequential rows.",
}

export default doc
