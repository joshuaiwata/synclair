import path from "node:path"

/**
 * Normalise a path recorded against an artifact's own base into one keyed on the
 * PRODUCT repo.
 *
 * Artifacts store paths against three different bases — the pages map against
 * `repo.root`, the catalog against each host's root, the seam against the
 * product repo. Getting one wrong does not produce a wrong join; it produces an
 * EMPTY one, which reads exactly like "this screen calls nothing". That failure
 * has already been paid for once in `scripts/lib/edges.mjs`; this is the same
 * rule for the app side.
 *
 * `repoRoot` is relative to the hub (e.g. `../apps/prototype`). In embedded
 * topology the product repo is the hub's parent, which is what the seam is keyed
 * on; when no repoRoot is recorded the hub IS the product and the path is
 * already correct.
 */
export function toProductRelative(rel: string, repoRoot?: string | null): string {
  if (!repoRoot) return rel
  const hub = process.cwd()
  const product = path.dirname(hub)
  return path.relative(product, path.resolve(hub, repoRoot, rel)).split(path.sep).join("/")
}
