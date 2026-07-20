/**
 * Where the Synclair hub is mounted.
 *
 * Synclair is a hub-only app: it catalogs the components and views a product
 * produces, and runs on its own server. The product itself lives elsewhere (a
 * separate repo/app on its own server). The hub mounts under this base and the
 * root `/` redirects to it; keeping the mount point in one constant means the
 * hub can be relocated without hunting links.
 *
 * Brain/foundation: this is portable. A clone can change where its hub lives.
 */
export const SYNCLAIR_BASE = "/synclair"

/** Prefix a hub-relative path (e.g. `/components`) with the mount base. */
export function synclair(path = ""): string {
  if (!path || path === "/") return SYNCLAIR_BASE
  return `${SYNCLAIR_BASE}${path.startsWith("/") ? "" : "/"}${path}`
}

/**
 * The canonical Synclair handbook — the public docs that explain the foundation
 * itself (what it is, vs. Storybook, install, setup modes, skills/agents, FAQ).
 * Hosted at docs.synclair.dev (Mintlify, sourced from `handbook/` in the mother
 * repo). The hub links out to it instead of maintaining an in-repo explainer.
 *
 * Foundation-fixed, not portable: every clone points at the same canonical docs,
 * so this is a constant — unlike SYNCLAIR_BASE, which a clone may relocate.
 */
export const HANDBOOK_URL = "https://docs.synclair.dev"
