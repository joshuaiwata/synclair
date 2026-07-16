import type { KnowledgeSource } from "./types"

/**
 * SEED (project-specific): this project's sources of truth — specs, PRDs, Figma,
 * decks. LINK them, never copy raw docs in. Add one entry per area as you locate
 * it, and set `distilledInto` once a digest exists. See docs/foundation-model.md §9.
 */
export const KNOWLEDGE_SOURCES: KnowledgeSource[] = []

export function getKnowledgeSources(): KnowledgeSource[] {
  return KNOWLEDGE_SOURCES
}
