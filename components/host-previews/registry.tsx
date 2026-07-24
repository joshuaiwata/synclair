
/** Registry-exempt (infra): the Path A live-import registry — per-clone wiring for ported host components (port-host-component skill), never product UI. */
import type { ComponentType } from "react"

/**
 * LIVE previews for host (external) catalog items — the import seam that gives
 * companion mode Storybook semantics (docs/rendering-parity.md): a catalog
 * entry with a registered preview renders the host's ACTUAL component in the
 * gallery and on its doc page, inside the product's scoped theme; entries
 * without one keep the documented screenshot + an honest "documented" framing.
 *
 * Empty in the mother repo (there is no host). In a clone, the
 * `port-host-component` skill (live-import path) populates it with modules like:
 *
 *   // components/host-previews/data-grid.preview.tsx
 *   "use client"
 *   import { DataGrid } from "@host/components/ui/data-grid"  // tsconfig path → the host repo
 *   export default function DataGridPreview() {
 *     return <DataGrid rows={SAMPLE_ROWS} />
 *   }
 *
 *   // …and registers it here:
 *   hostPreviews["data-grid"] = { component: DataGridPreview, theme: "theme-acme" }
 *
 * The `@host/*` path alias is added by the skill in the CLONE's tsconfig only —
 * the mother repo never declares it, so this file stays import-free upstream.
 * Whether an import can work at all (dependency compatibility, server-only
 * code) is the skill's compat gate; components that fail it stay documented.
 */
export interface HostPreviewEntry {
  /** A zero-prop wrapper that renders the imported host component with representative sample data. */
  component: ComponentType
  /** Scoped product-theme class from globals.css (see ProductThemeScope), e.g. "theme-acme". */
  theme?: string
}

/** Keys: `"<surface>:<name>"` for multi-surface projects, plain `"<name>"` otherwise. */
export const hostPreviews: Record<string, HostPreviewEntry> = {}

export function getHostPreview(name: string, surface?: string): HostPreviewEntry | undefined {
  return (surface && hostPreviews[`${surface}:${name}`]) || hostPreviews[name]
}
