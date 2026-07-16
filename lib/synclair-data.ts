import { synclair } from "@/lib/system/routes"

export type Status = "success" | "info" | "warning" | "neutral"

// NOTE: "where Synclair lives" and its "last updated" label are both derived live
// (git root + git history) in the consumers — never hardcoded here, so a fresh
// clone never shows the mother repo's path.

export const stack: {
  layer: string
  status: Status
  statusLabel: string
  notes: string
  href?: string
}[] = [
  { layer: "Next.js", status: "success", statusLabel: "Scaffolded", notes: "App Router + TypeScript — Synclair's own runtime, separate from whatever the product ships on.", href: "https://nextjs.org/docs" },
  { layer: "Tailwind CSS", status: "success", statusLabel: "Scaffolded", notes: "v4 with theme tokens as CSS custom properties in globals.css — the styling source of truth (not Figma).", href: "https://tailwindcss.com/docs" },
  { layer: "shadcn/ui", status: "success", statusLabel: "Initialized", notes: "Nova preset. Primitives used even when mocks invent their own versions.", href: "https://ui.shadcn.com/docs" },
  { layer: "Component registry", status: "success", statusLabel: "Live", notes: "registry.json at the repo root — every reusable component is logged at creation so other views (and the AI) can find it.", href: synclair("/components") },
  { layer: "/library route", status: "success", statusLabel: "Live", notes: "In-app visual library — the designer/engineer sync point. Renders every registered component with notes.", href: synclair("/foundations") },
]

export const priorityLadder = [
  { title: "Requirements", detail: "PRD / stated need. Source location TBD." },
  { title: "Foundations", detail: "shadcn/ui + Tailwind primitives and our theme." },
  { title: "Our library", detail: "Registered components & blocks — reuse first." },
  { title: "Figma", detail: "Guide for intent and layout. Never a spec." },
]

export const compositionLadder = [
  { title: "Primitive", detail: "shadcn/ui component (Button, Table, Dialog…) — even when the mock invented its own." },
  { title: "Registry item", detail: "Existing custom component or block — reuse whole." },
  { title: "Composition", detail: "Arrange primitives + registry items in the page file. Most “new” things are just composition." },
  { title: "Invent", detail: "Only when nothing fits. Reusable TSX → registered at creation → documented in /library." },
]

export const viewLoop = [
  { step: "Understand", detail: "Get the requirement. Domain workflow? Consult the project's domain skill + advisor agent (if one exists) for prior art." },
  { step: "Read Figma as guide", detail: "Pull design context for intent: information, actions, hierarchy. Evaluate the layout, don't pixel-match it." },
  { step: "Compose", detail: "Walk the composition ladder for every piece." },
  { step: "Wire & populate", detail: "Thin views; realistic fixture data from lib/fixtures/; all interactive states." },
  { step: "Close the loop", detail: "Run + screenshot; evaluate against the requirement first, Figma second. Register inventions, update /library, note deviations." },
]

export const mcpServers: { name: string; status: Status; statusLabel: string; role: string }[] = [
  { name: "Figma", status: "success", statusLabel: "Connected", role: "Design context, screenshots, variables, Code Connect, write-back to Figma. Primary design bridge." },
  { name: "Notion", status: "success", statusLabel: "Connected", role: "Standing by for PRDs once their home is confirmed." },
  { name: "Supabase", status: "success", statusLabel: "Connected", role: "Available if the prototype ever needs real data. Not in the flow today." },
  { name: "Chrome / Preview", status: "success", statusLabel: "Connected", role: "Browser control + in-editor preview for visual verification of views." },
  { name: "Hatchable", status: "neutral", statusLabel: "Idle", role: "Full-stack app platform. Not currently used." },
  { name: "Computer use", status: "neutral", statusLabel: "Idle", role: "Desktop control for anything outside the browser." },
]

// The queue — curated per project (edit here, or let intake seed it).
// Kept mode-neutral so it's true whether this is a new project or Synclair
// running beside an existing app: no assumptions about Figma, Notion, or a
// specific framework. Reseed with the project's actual next steps.
export const openItems: { status: Status; statusLabel: string; item: string; detail: string }[] = [
  { status: "warning", statusLabel: "Open", item: "Sources of truth", detail: "Locate the project's specs/PRDs/designs and add them to Knowledge so agents don't start blank." },
  { status: "warning", statusLabel: "Open", item: "Brand & theme", detail: "Seed the theme tokens from the project's brand on the Foundations page." },
  { status: "info", statusLabel: "Next", item: "Library pass", detail: "Register (or, beside a host app, catalog) the components the project actually ships." },
  { status: "info", statusLabel: "Next", item: "First view", detail: "Run the build-view loop end to end on one real screen." },
  { status: "neutral", statusLabel: "Deferred", item: "Onboarding brief", detail: "Generate a project summary once Knowledge is populated." },
]
