import {
  readFreshnessArtifact,
  readRedistillQueueArtifact,
} from "@/lib/artifacts/knowledge-freshness"

/**
 * KNOWLEDGE FRESHNESS — the read side of `check:knowledge` (scripts/check-knowledge.mjs).
 *
 * The manifest (./sources.ts) links OUT to PRDs/specs/decks that live in GitHub,
 * Drive, Notion, Figma. Each carries a `distilledAt` — when its in-repo digest was
 * written — but the SOURCE keeps moving. `check:knowledge` probes each linked
 * source's real last-modified, compares it to `distilledAt`, and writes the result
 * to `.synclair/cache/knowledge/freshness.json`; this module reads that cache for the hub
 * (/synclair/knowledge) and the knowledge report.
 *
 * This is the source-side generalization of the Figma-only staleness in
 * ./distill-status.ts, and the knowledge-layer twin of ../mother.ts (call-home).
 * The probe RUNS in the CLI (it needs network + the manifest); the hub only ever
 * reads the cache — it never probes on a page load.
 *
 * `classifyFreshness()` here MUST stay in lockstep with `classify()` in the script.
 */

/** Which host the source's last-modified was (or would be) probed from. */
export type FreshnessHost = "local" | "github" | "figma" | "drive" | "notion" | "unknown"

export type FreshnessState =
  /** Linked but never distilled — there's a digest to write, not one to refresh. */
  | "never"
  /** Can't be probed from the CLI (connector-gated host, or delegated to the Manifest). */
  | "unverifiable"
  /** A probe was attempted but the host couldn't be reached (offline, rate-limited, 404). */
  | "unreachable"
  /** The upstream source moved after its digest was written — the digest may be lying. */
  | "stale"
  /** The digest is at or ahead of the upstream. */
  | "fresh"

export interface SourceFreshness {
  id: string
  title: string
  kind: string
  area: string
  host: FreshnessHost
  state: FreshnessState
  url: string | null
  distilledInto: string | null
  distilledAt: string | null
  /** The upstream's real last-modified, when it could be read. */
  sourceModifiedAt: string | null
  /** Human note — why unverifiable/unreachable, or which signal was used. */
  detail: string | null
  /**
   * Repo-relative path, for a source that is a FILE in the product repo
   * (declared via `path`, or inferred from a blob URL naming this repo).
   * Absent on every source written before local probing existed.
   */
  localPath?: string | null
  /**
   * WHICH headings moved since the digest was written — the difference between
   * "re-read the spec" and "apply this addendum". Only local sources can answer
   * this. Null whenever the comparison couldn't be made honestly.
   */
  sections?: SectionDrift | null
}

/** Section-level drift for a local source, from git history. */
export interface SectionDrift {
  /** Headings whose body changed. */
  changed: string[]
  /** Headings that did not exist at distill time. */
  added: string[]
  /** Headings present at distill time and now gone. */
  removed: string[]
  /** How many headings are byte-identical (after whitespace normalisation). */
  unchanged: number
  /** Short sha of the commit the comparison ran against. */
  since?: string
}

export interface FreshnessReport {
  /** ISO of the last `check:knowledge` run, or null if it's never run. */
  checkedAt: string | null
  sources: SourceFreshness[]
}

export interface RedistillRequest {
  sourceId: string
  title: string
  reason: string
  requestedAt: string
}

/**
 * The pure staleness rule, shared in shape with the CLI's `classify()`. Exposed so
 * a caller with a freshly-probed modified date (not just the cache) can classify
 * consistently — same inputs, same verdict.
 */
export function classifyFreshness(
  distilledAt: string | null | undefined,
  sourceModifiedAt: string | null | undefined,
  probe: {
    verifiable: boolean
    unreachable?: boolean
    /** Section drift, when the source is a local file we could compare. */
    sections?: SectionDrift | null
  } = { verifiable: true }
): FreshnessState {
  if (!distilledAt) return "never"
  if (probe.unreachable) return "unreachable"
  /**
   * A local source is judged on CONTENT, not the clock: a document touched by an
   * unrelated commit, or reformatted, has moved its timestamp without moving
   * anything a digest could describe. Only when no comparison was possible do we
   * fall back to the date rule. Lockstep with `classify()` in
   * scripts/check-knowledge.mjs.
   */
  if (probe.sections) {
    const moved =
      probe.sections.changed.length + probe.sections.added.length + probe.sections.removed.length
    return moved > 0 ? "stale" : "fresh"
  }
  if (!probe.verifiable || !sourceModifiedAt) return "unverifiable"
  return new Date(sourceModifiedAt).getTime() > new Date(distilledAt).getTime()
    ? "stale"
    : "fresh"
}

/** Read the freshness cache. `null` (not a throw) when the check has never run.
 *  Validation lives in the artifact module (one owner — B3); this keeps the
 *  hub-facing async API and domain types. */
export async function readFreshnessReport(): Promise<FreshnessReport | null> {
  const raw = readFreshnessArtifact()
  if (!raw) return null
  return { checkedAt: raw.checkedAt, sources: raw.sources as SourceFreshness[] }
}

/** Count of sources in each state — the at-a-glance summary for a badge/report header. */
export function summarizeFreshness(report: FreshnessReport | null): Record<FreshnessState, number> {
  const zero: Record<FreshnessState, number> = {
    stale: 0,
    fresh: 0,
    never: 0,
    unverifiable: 0,
    unreachable: 0,
  }
  for (const s of report?.sources ?? []) if (s.state in zero) zero[s.state] += 1
  return zero
}

/** The pending re-distill requests `check:knowledge --queue` writes; an agent drains them. */
export async function readRedistillQueue(): Promise<RedistillRequest[]> {
  return (readRedistillQueueArtifact()?.requests ?? []) as RedistillRequest[]
}
