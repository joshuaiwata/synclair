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
    "The System Map's orientation view of a digested data model: what references what, and which entities are load-bearing. A graph reads far better as an ER diagram than a table — crow's-foot at the many side, arrowhead at the one side, parents layered above the children that point to them.",
  examples: [
    {
      title: "Five-entity model",
      description: "Relationships parsed from field notes (\"FK -> Team\"); deterministic token-themed SVG.",
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
        "The digested data model (lib/system/system-map.ts). FK edges are parsed from field notes; entities without parsed relationships are left to the table below the diagram.",
    },
  ],
  notes:
    "Pure server-rendered SVG — no client JS, themed by tokens. It caps itself at the ~10 most-connected entities (orientation, not completeness) and returns null when no relationships parse, so the fields table stands alone rather than under an empty graph.",
}

export default doc
