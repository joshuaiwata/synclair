/**
 * SEED — the project's example tiles for the Foundations "Examples" showcase.
 *
 * This is the ONE home for project-specific foundation JSX. The Brain
 * (`ExamplesShowcase` in `components/library/foundations.tsx`) renders this
 * inside a grid whose parent sets the scoped brand CSS variables, so every
 * value reads a scoped var and needs no token import. Keeping the tiles HERE —
 * not in the Brain file — is what lets `foundations.tsx` stay generic and
 * converge with upstream on every sync; `check:foundation-purity` seals the
 * Brain against re-introducing project content.
 *
 * A fresh clone ships this returning `null`. Intake composes the project's
 * example tiles here — a small grid of the product's real UI patterns
 * (headers, buttons, status pills, cards) built with inline styles that read
 * the scoped brand vars set by the parent frame. See `existing-project-intake`.
 */
export function FoundationExampleTiles() {
  return null
}
