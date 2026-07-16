/**
 * The knowledge-source manifest schema — Synclair's index of "where the truth
 * lives" for this project (see `docs/foundation-model.md` §9).
 *
 * This is BRAIN (portable): the shape is source-AGNOSTIC on purpose, because a
 * project's knowledge is a *combo* — written specs, Figma, decks, wikis. The
 * entries themselves (`./sources.ts`) are SEED, reseeded per project.
 *
 * Rule: a source is LINKED, never copied in. What lives in the repo is the
 * distilled digest (`distilledInto`), not the raw 40-page doc.
 */
export type KnowledgeSourceKind =
  | "prd" // product requirements doc
  | "spec" // written spec / requirements
  | "figma" // design file
  | "deck" // slide deck
  | "doc" // misc doc / wiki page
  | "repo" // distilled digest that lives in-repo

/** How the raw source is reachable RIGHT NOW (drives the retrieval mechanism). */
export type KnowledgeAccess =
  | "connector" // fetchable via an authorized MCP connector (Drive/Notion/Figma)
  | "linked" // a URL a human/agent can open, no connector wired yet
  | "repo" // already distilled and committed in this repo

export interface KnowledgeSource {
  id: string
  title: string
  kind: KnowledgeSourceKind
  /** Product area / feature this covers, e.g. "change-orders" or "all". */
  area: string
  /**
   * App surfaces this source is scoped to (`lib/system/surfaces.ts` ids), for
   * multi-surface projects — e.g. `["mobile"]` for a mobile-only PRD.
   * ABSENT = applies to every surface (most PRDs cover all frontends without
   * saying so; tag only when the source is explicitly platform-specific).
   */
  surfaces?: string[]
  /** Canonical link (Drive/Figma/deck URL). Omit for repo-local digests. */
  url?: string
  /** Stable key for connector fetches — Figma file key, Drive doc id, etc. */
  ref?: string
  /** The distilled skill / digest that compresses this source, if one exists. */
  distilledInto?: string
  /** ISO date the digest was last written — drives "stale, changed since distill". */
  distilledAt?: string
  access: KnowledgeAccess
  notes?: string
}
