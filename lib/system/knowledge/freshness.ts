import { readFile } from "node:fs/promises"
import path from "node:path"

/**
 * KNOWLEDGE FRESHNESS — the read side of `check:knowledge` (scripts/check-knowledge.mjs).
 *
 * The manifest (./sources.ts) links OUT to PRDs/specs/decks that live in GitHub,
 * Drive, Notion, Figma. Each carries a `distilledAt` — when its in-repo digest was
 * written — but the SOURCE keeps moving. `check:knowledge` probes each linked
 * source's real last-modified, compares it to `distilledAt`, and writes the result
 * to `data/knowledge/freshness.json`; this module reads that cache for the hub
 * (/synclair/knowledge) and the knowledge report.
 *
 * This is the source-side generalization of the Figma-only staleness in
 * ./distill-status.ts, and the knowledge-layer twin of ../mother.ts (call-home).
 * The probe RUNS in the CLI (it needs network + the manifest); the hub only ever
 * reads the cache — it never probes on a page load.
 *
 * `classifyFreshness()` here MUST stay in lockstep with `classify()` in the script.
 */

const FRESHNESS_PATH = path.join(process.cwd(), "data", "knowledge", "freshness.json")
const REDISTILL_QUEUE_PATH = path.join(process.cwd(), "data", "knowledge", "redistill-queue.json")

/** Which host the source's last-modified was (or would be) probed from. */
export type FreshnessHost = "github" | "figma" | "drive" | "notion" | "unknown"

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
  probe: { verifiable: boolean; unreachable?: boolean } = { verifiable: true }
): FreshnessState {
  if (!distilledAt) return "never"
  if (probe.unreachable) return "unreachable"
  if (!probe.verifiable || !sourceModifiedAt) return "unverifiable"
  return new Date(sourceModifiedAt).getTime() > new Date(distilledAt).getTime()
    ? "stale"
    : "fresh"
}

/** Read the freshness cache. `null` (not a throw) when the check has never run. */
export async function readFreshnessReport(): Promise<FreshnessReport | null> {
  try {
    const raw = JSON.parse(await readFile(FRESHNESS_PATH, "utf8"))
    return {
      checkedAt: typeof raw.checkedAt === "string" ? raw.checkedAt : null,
      sources: Array.isArray(raw.sources) ? (raw.sources as SourceFreshness[]) : [],
    }
  } catch {
    return null
  }
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
  for (const s of report?.sources ?? []) zero[s.state] += 1
  return zero
}

/** The pending re-distill requests `check:knowledge --queue` writes; an agent drains them. */
export async function readRedistillQueue(): Promise<RedistillRequest[]> {
  try {
    const parsed = JSON.parse(await readFile(REDISTILL_QUEUE_PATH, "utf8"))
    return Array.isArray(parsed?.requests) ? (parsed.requests as RedistillRequest[]) : []
  } catch {
    return []
  }
}
