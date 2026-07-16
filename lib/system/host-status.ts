import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { promisify } from "node:util"
import { cache } from "react"

import { getExternalCatalog } from "./external"
import { getHostCoverage } from "./host-scan"

const exec = promisify(execFile)

/**
 * Host freshness for the hub chrome — "is the catalog current with the app?"
 * answered on every render, not on demand. Companion mode's version of
 * Storybook rebuilding its index at startup: detection is ambient and free
 * (local git + the live host scan); the REFRESH stays deliberate (re-run the
 * intake diggers on what drifted). See docs/rendering-parity.md.
 */
export interface HostStatus {
  /** First host's display name (multi-surface projects aggregate coverage, count commits on the first host). */
  hostName: string
  /** Host commits since the newest catalog entry; null when git/host unavailable. */
  commitsSinceIntake: number | null
  /** ISO date of the newest cataloged entry (or the survey), if any. */
  lastIntakeAt: string | null
  /** Candidate component files in the host that the catalog doesn't document. */
  uncatalogedCandidates: number
  catalogedCount: number
}

/** Newest ISO date across catalog entries + the host survey — "when intake last looked". */
function newestIntakeDate(dates: (string | undefined)[]): string | null {
  const valid = dates.filter((d): d is string => !!d && !Number.isNaN(Date.parse(d)))
  if (valid.length === 0) return null
  return valid.sort()[valid.length - 1]
}

export const getHostStatus = cache(async (): Promise<HostStatus | null> => {
  const { hosts, items } = await getExternalCatalog()
  if (hosts.length === 0) return null

  const primary = hosts[0]
  const lastIntakeAt = newestIntakeDate([
    ...items.map((it) => it.catalogedAt),
    ...hosts.map((h) => h.surveyedAt),
  ])

  let commitsSinceIntake: number | null = null
  const rootAbs = path.resolve(process.cwd(), primary.root)
  if (lastIntakeAt && existsSync(rootAbs)) {
    try {
      const { stdout } = await exec(
        "git",
        ["rev-list", "--count", `--since=${lastIntakeAt}`, "HEAD"],
        { cwd: rootAbs }
      )
      const n = Number.parseInt(stdout.trim(), 10)
      commitsSinceIntake = Number.isNaN(n) ? null : n
    } catch {
      // Host isn't a git repo (or git unavailable) — freshness by commits unknowable.
    }
  }

  const coverage = await getHostCoverage()
  const uncatalogedCandidates = coverage.reduce((n, c) => n + c.uncataloged.length, 0)

  return {
    hostName: primary.name ?? primary.root,
    commitsSinceIntake,
    lastIntakeAt,
    uncatalogedCandidates,
    catalogedCount: items.length,
  }
})
