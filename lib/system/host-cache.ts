import { readFile, stat } from "node:fs/promises"
import path from "node:path"

/**
 * CROSS-REQUEST cache for the expensive companion-mode host reads (the corpus
 * load in host-usage.ts, the component walk in host-scan.ts). Those are wrapped
 * in react `cache()`, which only dedupes WITHIN a request — so every navigation
 * re-walked the whole host repo. This layer sits beneath: a module-level store
 * that survives across requests, anchored on HOST STATE rather than just time,
 * so the derive-don't-transcribe contract (docs/rendering-parity.md) holds —
 * data re-derives when the host actually changes, not on a wall-clock schedule.
 *
 * The anchor is each host's git HEAD sha (read straight from `.git/` — no
 * subprocess, a couple of tiny file reads per request). A commit in the host
 * invalidates immediately. The sha can't see UNCOMMITTED edits, so a short TTL
 * bounds staleness for dirty working trees: while hacking on the host without
 * committing, the hub is at most TTL_MS behind. Hosts that aren't git repos
 * (or unreadable `.git` layouts) get no sha and degrade to TTL-only.
 *
 * Deliberately dependency-free and generic: callers pass a key, the absolute
 * host roots to anchor on, and the producer. Blank-seed clones never reach
 * here — callers early-return before caching when there are no hosts.
 */

/** How long a cached derive may serve while the anchor is unchanged. */
const TTL_MS = 45_000

interface Entry {
  anchor: string
  expiresAt: number
  value: Promise<unknown>
}

const store = new Map<string, Entry>()

/**
 * Resolve a repo root's actual git directory. `.git` is a directory in a
 * normal checkout, but a `gitdir: <path>` pointer file in linked worktrees
 * and submodules — both layouts are common for companion hosts.
 */
async function resolveGitDir(rootAbs: string): Promise<string | null> {
  const dotGit = path.join(rootAbs, ".git")
  try {
    if ((await stat(dotGit)).isDirectory()) return dotGit
    const m = (await readFile(dotGit, "utf8")).trim().match(/^gitdir:\s*(.+)$/)
    return m ? path.resolve(rootAbs, m[1]) : null
  } catch {
    return null
  }
}

/**
 * The host's HEAD commit sha, read directly from the git plumbing files:
 * HEAD → loose ref → packed-refs (refs live in the COMMON dir for linked
 * worktrees). Null when the host isn't a git repo or the layout is exotic —
 * the caller then falls back to TTL-only caching.
 */
async function readHeadSha(rootAbs: string): Promise<string | null> {
  const gitDir = await resolveGitDir(rootAbs)
  if (!gitDir) return null
  try {
    const head = (await readFile(path.join(gitDir, "HEAD"), "utf8")).trim()
    if (!head.startsWith("ref:")) return head || null // detached HEAD is the sha itself
    const ref = head.slice("ref:".length).trim()
    let commonDir = gitDir
    try {
      const c = (await readFile(path.join(gitDir, "commondir"), "utf8")).trim()
      commonDir = path.resolve(gitDir, c)
    } catch {
      /* main working tree — no commondir file */
    }
    try {
      const loose = (await readFile(path.join(commonDir, ref), "utf8")).trim()
      if (loose) return loose
    } catch {
      /* not a loose ref — fall through to packed-refs */
    }
    const packed = await readFile(path.join(commonDir, "packed-refs"), "utf8")
    for (const line of packed.split("\n")) {
      if (line.startsWith("#") || line.startsWith("^")) continue
      const sp = line.indexOf(" ")
      if (sp > 0 && line.slice(sp + 1).trim() === ref) return line.slice(0, sp)
    }
    return null
  } catch {
    return null
  }
}

/**
 * Cheap change-stamp for a single file (mtime + size), for anchoring on inputs
 * that live in THIS repo (e.g. the external catalog JSON) where a git sha is
 * the wrong signal. "absent" is itself a valid, distinct state.
 */
export async function fileAnchor(absPath: string): Promise<string> {
  try {
    const s = await stat(absPath)
    return `${s.mtimeMs}:${s.size}`
  } catch {
    return "absent"
  }
}

/**
 * Serve `produce()`'s result from the cross-request cache while the anchor
 * (host HEAD shas + any extra parts) is unchanged and the TTL hasn't lapsed.
 * The promise itself is stored, so concurrent requests share one in-flight
 * derive; a rejected derive is evicted immediately rather than pinning a
 * transient error for the whole TTL.
 */
export async function hostAnchoredCache<T>(
  key: string,
  rootsAbs: string[],
  produce: () => Promise<T>,
  extraAnchor?: string
): Promise<T> {
  const shas = await Promise.all(rootsAbs.map(readHeadSha))
  const anchor =
    rootsAbs.map((root, i) => `${root}@${shas[i] ?? "no-sha"}`).join("|") +
    (extraAnchor ? `|${extraAnchor}` : "")
  const now = Date.now()
  const hit = store.get(key)
  if (hit && hit.anchor === anchor && hit.expiresAt > now) {
    return hit.value as Promise<T>
  }
  const value = produce()
  store.set(key, { anchor, expiresAt: now + TTL_MS, value })
  value.catch(() => {
    if (store.get(key)?.value === value) store.delete(key)
  })
  return value
}
