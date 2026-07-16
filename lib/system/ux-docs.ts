import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

/**
 * UX-doc staleness — the commit-anchored sync between an item's documentation
 * and the source it documents (the design-sync counterpart of check-host-drift
 * for the project's own library).
 *
 * When docs are written or re-affirmed, the item is ANCHORED: a sha256 of its
 * registered source files is recorded in data/ux-docs/anchors.json (via
 * `npm run check:ux-docs -- --update`). When source later changes, the item
 * reads as STALE — surfaced as a badge on its doc page and reported by
 * `check:ux-docs` — until an agent (ux-doc skill) reviews the docs and
 * re-anchors. Deliberate and commit-based, never a build failure.
 */

export type UxDocSyncState = "fresh" | "stale" | "unanchored"

export interface UxDocSync {
  state: UxDocSyncState
  /** ISO date the docs were last anchored (fresh/stale only). */
  anchoredAt?: string
}

interface Anchor {
  name: string
  sourceHash: string
  anchoredAt?: string
}

const ANCHORS_PATH = path.join(process.cwd(), "data", "ux-docs", "anchors.json")

function readAnchors(): Map<string, Anchor> {
  const map = new Map<string, Anchor>()
  if (!existsSync(ANCHORS_PATH)) return map
  try {
    const parsed = JSON.parse(readFileSync(ANCHORS_PATH, "utf8"))
    for (const raw of Array.isArray(parsed?.anchors) ? parsed.anchors : []) {
      if (typeof raw?.name === "string" && typeof raw?.sourceHash === "string") {
        map.set(raw.name, {
          name: raw.name,
          sourceHash: raw.sourceHash,
          anchoredAt: typeof raw.anchoredAt === "string" ? raw.anchoredAt : undefined,
        })
      }
    }
  } catch {
    // Malformed anchors file reads as "nothing anchored" — check:ux-docs
    // reports the parse error with a fix; the hub must not crash on it.
  }
  return map
}

/**
 * Hash an item's registered source files. Must stay in lockstep with
 * scripts/check-ux-docs.mjs (same algorithm, same input framing).
 */
export function hashSourceFiles(files: string[]): string | null {
  const hash = createHash("sha256")
  let any = false
  for (const rel of files) {
    const abs = path.join(process.cwd(), rel)
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
 * Sync state for one registered item, given its registry `files` paths.
 * External (host) items have their own drift check (`check:host`) — don't
 * call this for them.
 *
 * `surface` is the item's RAW registry surface (not defaulted): when two
 * registered items share a name across surfaces, the surfaced one anchors as
 * "<surface>:<name>" (lockstep with scripts/check-ux-docs.mjs), so pass it to
 * hit the right slot. Falls back to the bare name for single-name items.
 */
export function getUxDocSync(name: string, files: string[], surface?: string): UxDocSync {
  const anchors = readAnchors()
  const anchor = (surface ? anchors.get(`${surface}:${name}`) : undefined) ?? anchors.get(name)
  if (!anchor) return { state: "unanchored" }
  const current = hashSourceFiles(files)
  if (current === null) return { state: "unanchored" }
  return {
    state: current === anchor.sourceHash ? "fresh" : "stale",
    anchoredAt: anchor.anchoredAt,
  }
}
