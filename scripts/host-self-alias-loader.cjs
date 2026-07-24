/**
 * Turbopack/webpack loader — the Path A "host self-alias" bridge.
 *
 * A companion-mode host that follows the shadcn convention imports its OWN
 * modules through the `@/` path alias (`@/lib/utils`, `@/components/ui`,
 * `@/screens/*`, `@/shell/*`). When those host files are pulled into the hub's
 * module graph (Path A live previews), Turbopack resolves their specifiers
 * against SYNCLAIR's tsconfig — where `@/*` → `./*` means the HUB root, which
 * owns different `lib/` and `components/` trees. So the host's `@/…` imports
 * collide head-on with the hub's own and hard-fail.
 *
 * This loader rewrites a HOST file's own `@/x` specifiers to `@host/src/x`.
 * The hub's tsconfig maps `@host/*` → `../*` (the host repo root), so
 * `@host/src/components/ui` resolves to the real host module — while the hub's
 * own `@/` (its files never pass through this rewrite) is left untouched.
 *
 * Scope: keyed on `*.ts`/`*.tsx` by basename (Turbopack rules keys are
 * basename globs), but the resourcePath guard makes it a strict no-op for
 * everything that isn't host source — the hub's own files, node_modules, etc.
 * — so it only ever transforms the host modules a preview reaches.
 */
const path = require("node:path")

// Only rewrite files that physically live under the host repo's `src/` tree,
// i.e. NOT inside the co-located `synclair/` hub and NOT in any node_modules.
function isHostSource(resourcePath) {
  if (!resourcePath) return false
  const p = resourcePath.split(path.sep).join("/")
  if (p.includes("/node_modules/")) return false
  if (p.includes("/synclair/")) return false
  // Host source is <repo>/src/**. Match a `/src/` segment; the two guards above
  // already exclude the hub and deps, so this is host-only.
  return /\/src\//.test(p)
}

module.exports = function hostSelfAliasLoader(source) {
  if (!isHostSource(this.resourcePath)) return source
  if (source.indexOf("@/") === -1) return source
  // Rewrite `@/` only in module-specifier position (import/export-from and
  // dynamic import), never inside arbitrary string literals.
  return source.replace(/(from\s*["']|import\s*\(\s*["'])@\//g, "$1@host/src/")
}
