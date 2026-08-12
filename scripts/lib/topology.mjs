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

  /**
   * No mode recorded. "Standalone" is the right answer only when this clone IS
   * the repo. A fresh embedded cut ships `{ mode: null }` and records its
   * topology later, so anything run in between would conclude standalone and
   * write the registration INSIDE the hub — the one directory nobody ever
   * starts a session from. It resolves, it points at the right server, and it
   * is never read.
   *
   * The two cases are cleanly separable: standalone means the hub is itself the
   * git repo root; embedded means the hub sits inside a repo whose root is an
   * ancestor. Infer it rather than defaulting to the answer that fails quietly.
   *
   * Only the UNRECORDED case is inferred — an explicit `mode: "embedded"` keeps
   * its existing meaning above, so this cannot change where any clone that has
   * already recorded its topology installs to.
   */
  const enclosing = enclosingRepoRoot(hubRoot)
  if (enclosing && enclosing !== hubRoot) {
    // `mode` stays exactly "embedded" so every downstream comparison keeps
    // working; `inferred` is what callers surface to the human, since a guess
    // this consequential should be visible rather than silent.
    return { hostRoot: enclosing, mode: "embedded", inferred: true }
  }

  return { hostRoot: hubRoot, mode: setup.mode ?? "standalone" }
}

/**
 * The root of the git repo CONTAINING this directory, if it is not itself one.
 * Walks up looking for `.git` — a directory in a normal clone, a file in a
 * worktree or submodule. No git process, so it works the same everywhere.
 */
function enclosingRepoRoot(from) {
  if (existsSync(path.join(from, ".git"))) return from
  let dir = path.dirname(from)
  while (true) {
    if (existsSync(path.join(dir, ".git"))) return dir
    const up = path.dirname(dir)
    if (up === dir) return null
    dir = up
  }
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

/**
 * WHERE people actually launch their agent.
 *
 * A project-scoped MCP config is read from the session's LAUNCH directory — it
 * is not searched for up the tree. In a monorepo that means a single file at the
 * repo root serves only the people who start at the repo root; anyone working in
 * `apps/<app>` gets no tools at all, silently.
 *
 * So the registration belongs at the repo root AND at every host root the
 * catalog declares — precisely the set of app directories the team works in,
 * already maintained by intake.
 *
 * Shared by `mcp-install.mjs`, which writes these, and
 * `check-mcp-registration.mjs`, which verifies them. Two scripts disagreeing
 * about where a registration belongs is how "installed" and "actually working"
 * drift apart.
 */
export function launchDirs(hubRoot, hostRoot) {
  const dirs = new Set([hostRoot])
  const cat = readJson(path.join(hubRoot, "data", "external-catalog.json"))
  for (const h of Array.isArray(cat?.hosts) ? cat.hosts : []) {
    if (typeof h?.root !== "string") continue
    const abs = path.resolve(hubRoot, h.root)
    if (existsSync(abs)) dirs.add(abs)
  }
  return [...dirs]
}

/** The per-client registration files that belong in each launch directory. */
export function clientsFor(dirs) {
  return dirs.flatMap((dir) => [
    { id: "claude", label: "Claude Code", dir, file: path.join(dir, ".mcp.json") },
    { id: "cursor", label: "Cursor", dir, file: path.join(dir, ".cursor", "mcp.json") },
  ])
}

/**
 * Claude Code's user-scope config. Launch-directory independent, which is the
 * only thing that helps when a session starts somewhere the repo-scoped files
 * are never read — above the repo, or in a folder holding several repos.
 */
export function userScopeFile() {
  return path.join(process.env.HOME ?? "", ".claude.json")
}
