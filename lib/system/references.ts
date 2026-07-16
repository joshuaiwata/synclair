/**
 * References — a LIVING, project-specific library, built over time.
 *
 * Unlike the knowledge manifest (`./knowledge/sources.ts`, which indexes this
 * product's own sources of truth) and the Environment stack (framework/tool docs,
 * surfaced at `/synclair/environment`), this is the growing library of prior art,
 * findings, and recommendations the project accumulates as it goes: domain
 * references pulled while researching, comparable products worth studying,
 * patterns/solutions the team adopted, and useful articles. It is surfaced
 * read-only at `/synclair/references`.
 *
 * It starts EMPTY on purpose. It fills as project files are added, knowledge grows,
 * and agents do their own research.
 *
 * ── APPEND CONVENTION (for agents) ───────────────────────────────────────────
 * When you (an agent) research the domain, evaluate an approach, or land on a
 * solution/recommendation worth remembering — or a source document mentions one —
 * ADD an entry here. Don't ask permission for obviously-relevant additions; append.
 *   • Dedupe: skip if the same `url` (or clearly the same thing) is already present.
 *   • `note`: one line on WHY it's here / what it's good for or what you concluded.
 *   • `url` is optional — a recommendation or finding may stand on its own note.
 *   • `addedBy`: provenance — "human", "agent:<name>", or "doc:<source>".
 *   • `addedOn`: the date you added it (YYYY-MM-DD).
 *   • `category`: closest fit; extend the union if genuinely none fits.
 * This is SEED content: a new project starts empty and grows its own library.
 */

export type ReferenceCategory =
  | "domain" // domain / industry prior art gathered while researching
  | "product" // comparable or competitor products worth studying
  | "pattern" // a UX or technical pattern / solution the project adopted
  | "research" // a finding, recommendation, or conclusion from research
  | "article" // articles, posts, talks, external write-ups

export interface Reference {
  id: string
  title: string
  /** Optional — a finding/recommendation may have no single link. */
  url?: string
  category: ReferenceCategory
  /** One line: why it's here / what it's good for / what was concluded. */
  note?: string
  /** Provenance: "human" | "agent:<name>" | "doc:<source>". */
  addedBy?: string
  /** ISO date (YYYY-MM-DD) the entry was added. */
  addedOn?: string
}

/** Starts empty — grows over the life of the project (see the convention above). */
export const REFERENCES: Reference[] = []

export function getReferences(): Reference[] {
  return REFERENCES
}
