/**
 * Summary types + constants, importable from client components — no node
 * imports here. The fs read/write side lives in `summary.ts` (server-only).
 */

export type SummaryKind = "brief" | "diagram" | "custom"

export const KIND_LABEL: Record<SummaryKind, string> = {
  brief: "Brief",
  diagram: "Diagram",
  custom: "Custom",
}

export const SUMMARY_KINDS: SummaryKind[] = ["brief", "diagram", "custom"]

/** Summary ids and version ids: kebab slugs (version ids are also filenames). */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

export interface SummaryVersion {
  id: string
  /** ISO — when this version was generated. */
  createdAt: string
  /** One-line provenance, e.g. "Regenerated after Roster PRD landed". */
  note: string
}

export interface SummaryDef {
  id: string
  /** Display name, e.g. "Executive brief", "Platform map". */
  title: string
  kind: SummaryKind
  /** The generation spec an agent follows: audience, angle, what to cover. */
  instructions: string
  archived: boolean
  /** Current version id; null = defined but never generated. */
  current: string | null
  versions: SummaryVersion[]
}

export interface SummaryIndex {
  summaries: SummaryDef[]
}
