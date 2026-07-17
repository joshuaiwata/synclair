/**
 * Per-project identity — the ONE place a clone names the product it catalogs.
 *
 * Seed (§8): reseeded by `project-bootstrap` (or by hand) when this foundation is
 * cloned. Synclair's hub header reads this, so renaming here re-labels the hub.
 * The product itself lives elsewhere (its own repo/app on its own server) — this
 * is just the name Synclair shows for it.
 */
export const project = {
  /** The product this Synclair catalogs. Shown in the hub header. */
  name: "Your Product",
  /** One-line description of the product, shown in the hub. */
  tagline: "The product this Synclair foundation catalogs.",
}
