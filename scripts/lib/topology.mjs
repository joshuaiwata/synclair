/**
 * TOPOLOGY — where this clone sits relative to the product repo, and what that
 * means for any path we write into the host's config.
 *
 * Extracted from `mcp-install.mjs` when `install-agent-hooks.mjs` needed the
 * same answer. Same reasoning as `scripts/lib/host-walk.mjs`: the second copy
 * is the moment to extract, because the third guarantees drift.
 *
 * The rule this encodes (docs/setup-modes.md):
 *
 *   embedded / standalone — the clone is inside (or is) the product repo, so a
 *   repo-relative path resolves for everyone. The config is COMMITTABLE and
 *   arrives on clone with no setup.
 *
 *   watcher — the clone sits beside the product, so the path crosses a repo
 *   boundary and differs per machine. It must be absolute, and the file must
 *   not be committed: a path that only resolves on one laptop is worse than no
 *   path at all.
 */

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

function readJson(p) {
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

/**
 * Resolve the target repo and the topology.
 *
 * @param hubRoot   absolute path to the Synclair clone
 * @param explicit  an explicit `--host` value, which always wins
 * @returns {{hostRoot: string|null, mode: string}} `hostRoot: null` means the
 *          topology is watcher but no host path is recorded — the caller must
 *          ask rather than guess.
 */
export function resolveTarget(hubRoot, explicit = null) {
  const setup = readJson(path.join(hubRoot, "data", "setup.json")) ?? {}

  if (explicit) {
    return { hostRoot: path.resolve(process.cwd(), explicit), mode: setup.mode ?? "explicit" }
  }

  // Embedded: the clone is a subdirectory of the product repo.
  if (setup.mode === "embedded") {
    return { hostRoot: path.dirname(hubRoot), mode: "embedded" }
  }

  // Watcher: the host path is recorded by intake; fall back to asking.
  if (setup.mode === "watcher") {
    const hostRel = setup.hostRoot ?? setup.host?.root
    if (!hostRel) return { hostRoot: null, mode: "watcher" }
    return { hostRoot: path.resolve(hubRoot, hostRel), mode: "watcher" }
  }

  // No mode recorded — this clone IS the project (standalone / new-project).
  return { hostRoot: hubRoot, mode: setup.mode ?? "standalone" }
}

/**
 * Can a path written into `hostRoot`'s config be repo-relative (and therefore
 * committed)? True for embedded and standalone; false when the path crosses a
 * repo boundary.
 */
export function isEmbeddedish(hubRoot, hostRoot, mode) {
  return mode === "embedded" || mode === "standalone" || hostRoot === hubRoot
}

/**
 * The path to write for a hub script, in the shape this topology requires.
 * Relative for committable topologies, absolute for watcher.
 */
export function scriptPathFor(hubRoot, hostRoot, mode, relScript) {
  return isEmbeddedish(hubRoot, hostRoot, mode)
    ? path.relative(hostRoot, path.join(hubRoot, relScript)) || relScript
    : path.join(hubRoot, relScript)
}
