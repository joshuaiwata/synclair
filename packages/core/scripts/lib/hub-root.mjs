/**
 * WHERE IS THE HUB, for code that cannot trust its cwd.
 *
 * The rule for everything the `synclair` CLI runs is `process.cwd()` — the CLI
 * guarantees it, and deriving a root from `import.meta.url` resolves inside the
 * package (PR #74). But two callers are NOT started by the CLI:
 *
 *   • the MCP server, launched by an agent client from ITS OWN directory —
 *     for a project-scoped `.mcp.json` that is the repo root, not the hub;
 *   • the agent hooks (brief, augment), invoked from the HOST repo root.
 *
 * For those, cwd is someone else's, and the honest anchor is where this
 * package is INSTALLED: `<hub>/node_modules/@synclair/core` from the registry,
 * or `<hub>/packages/core` as a vendored workspace. Either way the hub is the
 * repo that installed us. Anything else — a bare copy in a test fixture — has
 * no package layout to read, so cwd remains the fallback.
 *
 * Third copy of this logic is the one that gets extracted (the doctrine that
 * produced `lib/topology.mjs` and `lib/host-walk.mjs`).
 */
import path from "node:path"
import { fileURLToPath } from "node:url"

/** This file lives at <package>/scripts/lib/hub-root.mjs — three up is the package. */
const PACKAGE_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))

export function hubRoot() {
  const parts = PACKAGE_ROOT.split(path.sep)
  const nm = parts.lastIndexOf("node_modules")
  if (nm > 0) return parts.slice(0, nm).join(path.sep)
  if (parts[parts.length - 2] === "packages") return parts.slice(0, -2).join(path.sep)
  return process.cwd()
}
