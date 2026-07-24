import { TokenSystemView } from "@/components/library/token-systems"
import { SkeletonRow, WireframeBlock, WireframeFrame } from "@/components/wireframe-kit"
import type { TokenSystem } from "@/lib/system/token-systems"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const SYSTEM: TokenSystem = {
  id: "demo-ui",
  label: "@demo/ui (production)",
  role: "production",
  source: "packages/ui/tokens.css",
  hint: "The shipped design system — fixture data for this doc.",
  ramps: [
    {
      id: "demo-gray",
      label: "Gray",
      tokens: [
        { name: "gray-100", bg: "bg-stone-100", value: "#f5f5f4", usage: "Surfaces" },
        { name: "gray-300", bg: "bg-stone-300", value: "#d6d3d1", usage: "Borders" },
        { name: "gray-500", bg: "bg-stone-500", value: "#78716c", usage: "Muted text" },
        { name: "gray-900", bg: "bg-stone-900", value: "#1c1917", usage: "Text" },
      ],
    },
  ],
  type: [
    { name: "body", size: "14px", line: "20px" },
    { name: "heading", size: "24px", line: "32px" },
  ],
}

const doc: ComponentDoc = {
  intent:
    "One complete style sheet per PARALLEL token system — for hosts that run several design vocabularies at once (a production package, a prototype, a design reference). Each system renders as its own tab on Foundations, and DriftView leads with where they disagree, so converging on one vocabulary is a decision aid, not archaeology. Companion/multi-system mode only.",
  examples: [
    {
      title: "One system, rendered as a style sheet",
      description: "TokenSystemView over a small fixture system — ramps and type scale from data.",
      code: `<TokenSystemView system={system} />`,
      preview: live(
        <div className="w-full">
          <TokenSystemView system={SYSTEM} />
        </div>
      ),
    },
  ],
  anatomy: {
    description: "Identity header, then per-category sections rendered only when the dig captured data for them.",
    preview: live(
      <WireframeFrame label="Token system tab">
        <WireframeBlock label="Identity — label · role · source" />
        <WireframeFrame label="Color ramps" focal>
          <SkeletonRow />
        </WireframeFrame>
        <WireframeBlock label="Type / spacing / radii / elevation (as captured)" />
      </WireframeFrame>
    ),
    regions: [
      { name: "Identity", purpose: "Which system this is, its role, and where it's defined." },
      { name: "Categories", purpose: "Ramps, type, spacing, radii, elevation, motion — only what the token dig captured." },
    ],
  },
  interactions: [
    {
      trigger: "Switch system tabs (Foundations)",
      behavior: "Each parallel system renders its own complete sheet.",
      result: "Compare leads with the drift between them (DriftView).",
    },
  ],
  responsive: [
    { viewport: "mobile", behavior: "Ramps wrap; tables scroll in place." },
    { viewport: "tablet", behavior: "Two-column category layouts where they fit." },
    { viewport: "desktop", behavior: "Full sheet in reading order." },
  ],
  states: [
    {
      name: "Sparse capture",
      description: "Categories the token dig didn't capture simply don't render — no empty shells.",
      preview: live(
        <div className="w-full">
          <TokenSystemView
            system={{ id: "sparse", label: "@demo/proto", source: "prototype/tokens.ts", ramps: [] }}
          />
        </div>
      ),
    },
  ],
  props: [
    { name: "system", type: "TokenSystem", description: "One parallel token system (lib/system/token-systems.ts), from the seed." },
  ],
  notes:
    "Exports TokenSystemView (one system's sheet) and DriftView (the Compare tab — same design slots side by side across systems). Data is seed (lib/system/seed/token-systems.ts), captured by the token dig during intake; single-vocabulary projects never see these views.",
}

export default doc
