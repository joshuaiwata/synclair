import type { FoundationSection } from "./foundation"

/**
 * SEED (project-specific): prose notes for the MULTI-SURFACE hub views.
 *
 * When a project ships one frontend, Pages and Library are self-explanatory —
 * one route tree, one component set. With several surfaces the counts stop
 * speaking for themselves: a reader sees "52 pages" next to two surfaces
 * showing nothing, or a Library where one surface deliberately shares nothing
 * with the others, and can't tell intent from omission. These notes carry that
 * intent, rendered through the same `SummaryShell` doc treatment the System Map
 * overview and the Knowledge briefs use (`NotesSections`).
 *
 * Keyed by hub view. EMPTY BY DEFAULT — the views gate on `SURFACES.length > 1`
 * and render zero extra chrome, so a single-surface project never sees them.
 * Fill a key during intake once a project genuinely has several surfaces AND
 * something non-obvious to say about coverage or sharing between them; leave it
 * empty rather than restating what the cards already show.
 *
 * Author each entry as a section: `label` becomes an `##` sub-header, `summary`
 * a one-line standfirst, `body` markdown. They render as ONE "Notes" document
 * per view, not a card per note.
 */
export const SURFACE_NOTES: Record<"pages" | "library", FoundationSection[]> = {
  pages: [],
  library: [],
}
