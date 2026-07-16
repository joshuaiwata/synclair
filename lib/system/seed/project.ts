/**
 * Per-project identity — the ONE place a clone names the product it's building.
 *
 * Seed (§8): reseeded by `project-bootstrap` (or by hand) when this foundation is
 * cloned. The product app (`app/(product)`) and Synclair's sidebar header
 * both read this, so renaming here re-labels both UIs. Everything structural
 * around it (the two-app split, the empty Views index, the layouts) is Brain and
 * stays put.
 */
export const project = {
  /** The product being built on this foundation. Shown at the root and in the hub header. */
  name: "Your Product",
  /** One-line description of the product, shown on the product home. */
  tagline: "The app you're building on the Synclair foundation.",
}
