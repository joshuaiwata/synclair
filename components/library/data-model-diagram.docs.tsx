import { DataModelDiagram } from "@/components/library/data-model-diagram"
import { live, type ComponentDoc } from "@/lib/system/doc-types"
import type { DataEntity } from "@/lib/system/system-map"

const SAMPLE: DataEntity[] = [
  {
    name: "Team",
    summary: "Tenant root",
    fields: [{ name: "id", type: "uuid", note: "PK" }],
  },
  {
    name: "User",
    summary: "Member of a team",
    fields: [{ name: "teamId", type: "uuid", note: "FK -> Team" }],
  },
  {
    name: "Document",
    summary: "Uploaded file",
    fields: [
      { name: "teamId", type: "uuid", note: "FK -> Team" },
      { name: "ownerId", type: "uuid", note: "FK -> User" },
    ],
  },
  {
    name: "Link",
    summary: "Share link for a document",
    fields: [{ name: "documentId", type: "uuid", note: "FK -> Document" }],
  },
  {
    name: "View",
    summary: "A visit through a link",
    fields: [
      { name: "linkId", type: "uuid", note: "FK -> Link" },
      { name: "documentId", type: "uuid", note: "FK -> Document" },
    ],
  },
]

const doc: ComponentDoc = {
  intent:
    "The System Map's view of a digested data model: what references what, which columns carry the references, and which entities are load-bearing. A graph reads far better as an ER diagram than a table — crow's-foot at the many side, arrowhead at the one side, parents layered above the children that point to them. Entities are split into ONE DIAGRAM PER SOURCE, because a service-per-database system has no foreign keys between its databases: drawn on one canvas they are not a graph but N disconnected islands, and the largest schema silently wins every slot.",
  examples: [
    {
      title: "Five-entity model",
      description:
        "Edges come from a field NOTE (\"FK -> Team\") or from a field TYPE that names another entity — the shape an ORM relation field takes. Reading only notes drops every entity documented without them, which is most of a scanned map.",
      code: `<DataModelDiagram entities={systemMap.dataModel} />`,
      preview: live(
        <div className="w-full max-w-lg">
          <DataModelDiagram entities={SAMPLE} />
        </div>
      ),
    },
  ],
  props: [
    {
      name: "entities",
      type: "DataEntity[]",
      description:
        "The digested data model (lib/system/system-map.ts). Grouped by `source` into one diagram each. FK edges come from field notes AND from relation-typed fields; entities with no parsed relationship are left to the table below.",
    },
  ],
  notes:
    "Pure server-rendered SVG — no client JS, themed by tokens; the per-source disclosure is a native <details>, not a picker. Drawn at NATURAL size inside a horizontal scroller rather than scaled to fit: a wide schema shrunk into the column takes its labels below legibility, which costs the whole figure to save a gesture. Nodes carry their primary key and the columns that carry each edge, so a reader can see WHICH field points where; long names truncate with the full value in a <title>, since SVG text neither wraps nor clips. Each diagram caps at 48 entities as a safety valve, and a group with no parsed relationships is omitted rather than drawn empty.",
}

export default doc
