/**
 * Where the Synclair hub is mounted.
 *
 * A Synclair project is two app UIs in one repo: the **product app** you're
 * building lives at the root (`/`), and the **Synclair hub** — which catalogs the
 * components and views that product produces — is mounted under this base. Keeping
 * the mount point in one constant means the hub can be relocated (or unmounted)
 * without hunting links.
 *
 * Brain/foundation: this is portable. A clone can change where its hub lives.
 */
export const SYNCLAIR_BASE = "/synclair"

/** Prefix a hub-relative path (e.g. `/components`) with the mount base. */
export function synclair(path = ""): string {
  if (!path || path === "/") return SYNCLAIR_BASE
  return `${SYNCLAIR_BASE}${path.startsWith("/") ? "" : "/"}${path}`
}
