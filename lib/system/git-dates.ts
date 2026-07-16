import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { cache } from "react"

const exec = promisify(execFile)

export interface FileDates {
  /** ISO date the file first appeared in git history. */
  addedAt: string
  /** ISO date of the file's most recent commit. */
  updatedAt: string
}

/**
 * Build a `file -> { addedAt, updatedAt }` map from a single git-log pass.
 * Dates are author dates (%aI). Memoised per request via React `cache`.
 * Returns an empty map when git is unavailable (e.g. not a repo) — callers
 * fall back to empty strings.
 */
export const getGitDates = cache(async (): Promise<Map<string, FileDates>> => {
  const map = new Map<string, FileDates>()
  try {
    // Oldest → newest so the first line we see for a file is its "added" date
    // and the last is its "updated" date. `--relative` + the "." pathspec keep
    // the output cwd-relative and scoped: in EMBEDDED mode this app is a
    // subtree of the product repo (cwd = <repo>/synclair), and without them
    // git emits repo-root paths ("synclair/components/…") that never match the
    // hub-relative lookups — every date read as unknown. Standalone (cwd =
    // repo root) they're a no-op.
    const { stdout } = await exec(
      "git",
      ["log", "--reverse", "--date=short", "--format=commit:%aI", "--name-only", "--relative", "--", "."],
      { cwd: process.cwd(), maxBuffer: 32 * 1024 * 1024 }
    )
    let commitDate = ""
    for (const line of stdout.split("\n")) {
      if (line.startsWith("commit:")) {
        commitDate = line.slice("commit:".length).trim()
      } else if (line.trim()) {
        const file = line.trim()
        const existing = map.get(file)
        if (existing) {
          existing.updatedAt = commitDate
        } else {
          map.set(file, { addedAt: commitDate, updatedAt: commitDate })
        }
      }
    }
  } catch {
    // not a git repo / git missing — leave the map empty
  }
  return map
})

/** Look up dates for one repo-relative path; empty strings if unknown. */
export async function fileDates(file: string): Promise<FileDates> {
  const map = await getGitDates()
  return map.get(file) ?? { addedAt: "", updatedAt: "" }
}

/**
 * ISO date of the repo's most recent commit (max `updatedAt` across all files),
 * or "" when git is unavailable. Drives the hub's live "last updated" label so
 * it never shows a hardcoded, stale snapshot date.
 */
export async function getLatestCommitDate(): Promise<string> {
  let latest = ""
  for (const { updatedAt } of (await getGitDates()).values()) {
    if (updatedAt > latest) latest = updatedAt // ISO dates sort lexicographically
  }
  return latest
}
