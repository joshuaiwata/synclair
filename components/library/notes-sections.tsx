/** Registry-exempt (infra): the shared Notes renderer for hub surfaces — plumbing for the style-guide/explorer pages, never product UI. */
import { SummaryShell } from "@/components/summary-shell"
import type { FoundationSection } from "@/lib/system/seed/foundation"

/**
 * Seed prose sections rendered as ONE document through `SummaryShell` — the
 * same shell the System Map overview and the Knowledge briefs use.
 *
 * These notes carry the densest findings a surface has (which of three token
 * systems should win, why a host's fonts are declared but never loaded), and
 * they used to render as a small `text-xs` label above a muted line inside one
 * flat card — visually the least important thing on the page rather than the
 * most.
 *
 * They read as one doc rather than a card per note: these are sections of a
 * single commentary on the surface, not independent artifacts, and a stack of
 * separately-titled panels made each note look like its own document while
 * burying the fact that "Notes" is what you're reading. So the card is titled
 * "Notes" once and each section becomes an `##` sub-header inside it, which is
 * exactly how the System Map overview is shaped.
 */
export function NotesSections({
  sections,
  title = "Notes",
  meta,
}: {
  sections: FoundationSection[]
  title?: string
  /** Mono standfirst under the title — e.g. what these notes cover. */
  meta?: string
}) {
  if (sections.length === 0) return null

  // One markdown document: the shell splits the leading `#` off as the title,
  // and each section lands as an `##` with its summary as a standfirst line.
  const doc = [
    `# ${title}`,
    ...sections.map((s) =>
      [`## ${s.label}`, s.summary, s.body].filter(Boolean).join("\n\n")
    ),
  ].join("\n\n")

  return <SummaryShell content={doc} meta={meta} />
}
