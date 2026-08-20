import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

/**
 * PROVENANCE — the one shared answer to "where did this artifact come from and
 * is it still true?"
 *
 * Synclair generates several digests (the System Map, the Pages Map, the host
 * catalog, hygiene, knowledge summaries, UX docs). Each was born with its own
 * freshness convention: pages-map anchors per node with a sha256 of the route's
 * source files, system-map stores only a commit, others store nothing. That
 * means the hub can't answer one simple question uniformly — *how stale is what
 * I'm looking at* — and every new artifact reinvents the wiring.
 *
 * This module is the shared contract. It is deliberately:
 *
 *   OPTIONAL — every field is optional and every artifact may omit the block
 *   entirely. Data written before this existed stays valid; the resolver reports
 *   `unanchored`, never an error and never a false `stale`. That is what lets
 *   this land in existing clones as a no-op.
 *
 *   DERIVED, NOT DECLARED — freshness is recomputed from the files on disk, not
 *   trusted from a flag someone forgot to update.
 *
 * The hashing here is lifted from `pages-map.ts`'s `hashPageSource`, which
 * remains the canonical implementation for pages (and stays in lockstep with
 * `scripts/check-pages.mjs`). New artifacts should use THIS module.
 */

/** How much to trust a generated artifact's *judgment* (its prose, not its facts). */
export type Confidence = "high" | "medium" | "low"

/**
 * How current an artifact is relative to the source it describes.
 *
 * `unanchored` is not a failure — it means we cannot honestly say. A host repo
 * that isn't checked out on this machine, or a digest written before provenance
 * existed, is unanchored. The UI shows nothing rather than crying wolf.
 */
export type SyncState = "fresh" | "stale" | "unanchored"

export interface Provenance {
  /** ISO timestamp the artifact was generated. */
  generatedAt?: string
  /** Commit hash of the described repo at generation time — the coarse anchor. */
  commit?: string
  /** sha256 over `sourceFiles` at generation time — the precise anchor. */
  sourceHash?: string
  /** Files the hash covers, relative to the described repo's root. */
  sourceFiles?: string[]
  /**
   * What produced this — a script name (`scan:hygiene`) or an agent name
   * (`system-mapper`). Once generators split into a deterministic scanner plus
   * an optional prose pass, this is how the hub tells "derived facts" from
   * "written judgment".
   */
  generator?: string
  /** Trust in the judgment layer. Absent = unstated, not "high". */
  confidence?: Confidence
  /**
   * COVERAGE, from the generator that produced this digest.
   *
   * A digest is a sample of a larger surface, and a reader cannot tell a sample
   * from a census by looking at it. The System Map page was stating coverage
   * with a denominator borrowed from a DIFFERENT scanner — one blind to RPC —
   * which flattered the ratio by leaving 39 endpoints out of the count. A
   * generator that knows both numbers should record both.
   *
   * Counts, not judgments: `derived` is what the scan saw, `undescribed` is how
   * many written rows still have no prose. Absent on maps written before this
   * existed, which reads as "unstated" and shows nothing.
   */
  derivedEndpoints?: number
  undescribedEndpoints?: number
}

/** Narrow unknown JSON into a Provenance block. Unknown/awkward values drop. */
export function toProvenance(raw: unknown): Provenance | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const r = raw as Record<string, unknown>
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined)
  const conf = str(r.confidence)
  // A count is only usable if it is a non-negative whole number; anything else
  // is dropped rather than coerced, so a malformed value shows nothing instead
  // of rendering "NaN of 90".
  const count = (v: unknown) =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined
  const files = Array.isArray(r.sourceFiles)
    ? r.sourceFiles.filter((f): f is string => typeof f === "string")
    : undefined

  const out: Provenance = {
    generatedAt: str(r.generatedAt),
    commit: str(r.commit),
    sourceHash: str(r.sourceHash),
    sourceFiles: files?.length ? files : undefined,
    generator: str(r.generator),
    confidence:
      conf === "high" || conf === "medium" || conf === "low" ? (conf as Confidence) : undefined,
    derivedEndpoints: count(r.derivedEndpoints),
    undescribedEndpoints: count(r.undescribedEndpoints),
  }
  return Object.values(out).some((v) => v !== undefined) ? out : undefined
}

/**
 * Hash a set of source files. MUST stay byte-identical in framing to
 * `pages-map.ts`'s `hashPageSource` and `scripts/check-pages.mjs` — the same
 * inputs must produce the same digest across all three, or drift checks
 * disagree with the UI.
 *
 * `baseDir` is the described repo's root on disk; `files` are relative to it.
 * Returns null when none of the files are readable — the caller reports
 * `unanchored` rather than inventing a hash over nothing.
 */
export function hashSources(files: string[], baseDir: string): string | null {
  const hash = createHash("sha256")
  let any = false
  for (const rel of files) {
    const abs = path.join(baseDir, rel)
    if (!existsSync(abs)) continue
    hash.update(rel)
    hash.update("\n")
    hash.update(readFileSync(abs))
    hash.update("\0")
    any = true
  }
  return any ? hash.digest("hex") : null
}

/**
 * Resolve the described repo's root on disk. `repoRoot` follows the convention
 * shared by every Synclair map: `null`/absent = THIS repo; a path = the HOST
 * repo, relative to this one (existing-project mode).
 */
export function resolveBaseDir(repoRoot: string | null | undefined): string {
  return repoRoot ? path.join(process.cwd(), repoRoot) : process.cwd()
}

/**
 * Freshness for one artifact: re-hash its sources live and compare to the
 * anchor stored at generation time.
 *
 * Returns `unanchored` when there is nothing to compare — no stored hash, no
 * file list, or the files aren't on this machine. Only a genuine mismatch
 * between a real stored hash and a real current hash is `stale`.
 */
export function getSyncState(
  prov: Provenance | undefined,
  repoRoot: string | null | undefined
): SyncState {
  if (!prov?.sourceHash || !prov.sourceFiles?.length) return "unanchored"
  const current = hashSources(prov.sourceFiles, resolveBaseDir(repoRoot))
  if (current === null) return "unanchored"
  return current === prov.sourceHash ? "fresh" : "stale"
}

/**
 * Roll many per-node states into one headline for a whole artifact. Any `stale`
 * node makes the artifact stale — a map that is 95% current is still a map you
 * cannot trust without looking. All-unanchored stays unanchored; a mix of fresh
 * and unanchored reads `fresh`, since the unanchored parts make no claim.
 */
export function rollUpSyncState(states: SyncState[]): SyncState {
  if (states.some((s) => s === "stale")) return "stale"
  if (states.some((s) => s === "fresh")) return "fresh"
  return "unanchored"
}

/** Human label for a state — one vocabulary across every surface that shows it. */
export function syncStateLabel(state: SyncState): string {
  if (state === "fresh") return "Current"
  if (state === "stale") return "Source changed since generated"
  return "Not anchored"
}
