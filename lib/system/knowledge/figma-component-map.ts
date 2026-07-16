/**
 * Figma → code component map — the repo-side stand-in for Figma Code Connect.
 *
 * Code Connect is plan-gated (Organization/Enterprise), so on lower plans the
 * mapping lives here instead. When an agent reads a mock via the Figma MCP,
 * component instances arrive as *names* ("Badge", "Button/Primary"); this
 * table resolves those names to what already exists in code, so a mock never
 * causes reinvention — the front door of the invention gate.
 *
 * Flywheel: `build-view` and `figma-distiller` append entries as pages are
 * distilled and instances are confirmed against real mocks. If the team ever
 * upgrades to a plan with Code Connect, this table is the source material for
 * the real mappings.
 *
 * BOUNDARIES — this map must never grow into a fidelity contract with Figma
 * (Figma is the lowest-priority guide in this setup; see `build-view`):
 * - One-way, read-time only. Code never references Figma; deleting this file
 *   changes no product code. It translates OUT of Figma's vocabulary into
 *   ours — it never obliges code to track Figma.
 * - Name → "already exists in code", nothing richer. Do NOT add variant/prop
 *   mappings ("Button/Primary/Small" = size:"sm") — that's fidelity coupling.
 * - Unmapped means fall back to the build-view ladder (primitive → registry →
 *   composition → invent). It is NEVER a reason to build what the mock shows.
 * - An entry may only REMOVE work ("don't rebuild this"), never add it.
 * - Unconfirmed seeds are guesses: if a real mock contradicts one (designer's
 *   "Card" is actually a listing pattern), correct or delete it — a wrong
 *   mapping is worse than none.
 */

export interface FigmaComponentMapping {
  /** Component/instance name as it appears in Figma (matched case-insensitively; prefix match covers variant suffixes like "Button/Primary"). */
  figma: string
  /** Where it lives in code: an upstream shadcn primitive or one of our registry items. */
  kind: "ui" | "registry"
  /** kind "ui" → module name in components/ui/<code>.tsx; kind "registry" → item name in registry.json. */
  code: string
  notes?: string
}

/**
 * SEED (project-specific): starts empty. If the project's design library tracks
 * shadcn's component names, seed the tier-0 primitives first (e.g.
 * `{ figma: "Button", kind: "ui", code: "button" }`); registry-item entries
 * accrue via the flywheel as mocks are read:
 * e.g. `{ figma: "Status Badge", kind: "registry", code: "status-badge" }`.
 */
export const FIGMA_COMPONENT_MAP: FigmaComponentMapping[] = []

/** Resolve a Figma instance name to its code mapping (exact first, then prefix for variant paths like "Button/Primary/Small"). */
export function resolveFigmaComponent(
  figmaName: string
): FigmaComponentMapping | undefined {
  const n = figmaName.trim().toLowerCase()
  return (
    FIGMA_COMPONENT_MAP.find((m) => n === m.figma.toLowerCase()) ??
    FIGMA_COMPONENT_MAP.find((m) => n.startsWith(m.figma.toLowerCase()))
  )
}
