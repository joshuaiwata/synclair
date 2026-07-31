import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { cache } from "react"

const exec = promisify(execFile)

/** Field separator for git --format output; never appears in commit text. */
const SEP = "\x1f"

export interface CommitSummary {
  hash: string
  shortHash: string
  subject: string
  author: string
  /** ISO author date. */
  date: string
  /** git's human phrasing, e.g. "2 hours ago". */
  relativeDate: string
  /** Exists locally but not on the upstream branch yet — teammates can't see it. */
  unpushed: boolean
}

export interface RepoStatus {
  branch: string
  /** `https://github.com/<owner>/<repo>` derived from origin; null if unrecognizable. */
  webUrl: string | null
  /** Local commits the upstream doesn't have; 0 when in sync or no upstream. */
  aheadCount: number
}

async function git(args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, {
    cwd: process.cwd(),
    maxBuffer: 32 * 1024 * 1024,
  })
  return stdout
}

/** Hashes on the current branch that the upstream doesn't have (empty set if no upstream). */
async function unpushedHashes(): Promise<Set<string>> {
  try {
    const out = await git(["rev-list", "@{upstream}..HEAD"])
    return new Set(out.split("\n").filter(Boolean))
  } catch {
    return new Set()
  }
}

/**
 * Recent commits, read straight from the local repository — the same history
 * GitHub mirrors, minus nothing: unpushed work shows up too (flagged). Memoised
 * per request; empty when git is unavailable.
 */
export const getRecentCommits = cache(async (limit = 50): Promise<CommitSummary[]> => {
  try {
    const [out, unpushed] = await Promise.all([
      git([
        "log",
        `-n${limit}`,
        `--format=%H${SEP}%h${SEP}%an${SEP}%aI${SEP}%ar${SEP}%s`,
      ]),
      unpushedHashes(),
    ])
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, shortHash, author, date, relativeDate, subject] = line.split(SEP)
        return { hash, shortHash, author, date, relativeDate, subject, unpushed: unpushed.has(hash) }
      })
  } catch {
    return []
  }
})

export interface CommitStat extends CommitSummary {
  filesChanged: number
  insertions: number
  deletions: number
}

/** Record separator opening each commit in --shortstat output; never in commit text. */
const RS = "\x1e"

/**
 * Recent commits WITH churn (files / insertions / deletions) — one
 * `git log --shortstat` pass, so a day-grouped ledger costs a single git call
 * instead of a `git show` per commit. Memoised per request; empty when git is
 * unavailable.
 */
export const getCommitStats = cache(async (limit = 60): Promise<CommitStat[]> => {
  try {
    const [out, unpushed] = await Promise.all([
      git([
        "log",
        `-n${limit}`,
        "--shortstat",
        `--format=${RS}%H${SEP}%h${SEP}%an${SEP}%aI${SEP}%ar${SEP}%s`,
      ]),
      unpushedHashes(),
    ])
    return out
      .split(RS)
      .filter((block) => block.trim())
      .map((block) => {
        const [head, ...rest] = block.split("\n")
        const [hash, shortHash, author, date, relativeDate, subject] = head.split(SEP)
        const stat = rest.join(" ")
        const num = (re: RegExp) => Number(stat.match(re)?.[1] ?? 0)
        return {
          hash,
          shortHash,
          author,
          date,
          relativeDate,
          subject,
          unpushed: unpushed.has(hash),
          filesChanged: num(/(\d+) files? changed/),
          insertions: num(/(\d+) insertions?\(\+\)/),
          deletions: num(/(\d+) deletions?\(-\)/),
        }
      })
  } catch {
    return []
  }
})

/** Turn an origin URL (ssh or https) into a browseable https URL, or null. */
function toWebUrl(remote: string): string | null {
  const cleaned = remote.trim().replace(/\.git$/, "")
  const ssh = cleaned.match(/^git@([^:]+):(.+)$/)
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`
  if (/^https?:\/\//.test(cleaned)) return cleaned
  return null
}

export const getRepoStatus = cache(async (): Promise<RepoStatus> => {
  const [branch, remote, unpushed] = await Promise.all([
    git(["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => ""),
    git(["remote", "get-url", "origin"]).catch(() => ""),
    unpushedHashes(),
  ])
  return {
    branch: branch.trim(),
    webUrl: remote ? toWebUrl(remote) : null,
    aheadCount: unpushed.size,
  }
})

/**
 * Tilde-abbreviated label for where this clone lives on disk, derived live from
 * git — the "where Synclair lives" hint in the hub header. Never hardcoded, so it
 * is correct in the mother repo AND in every clone (a hardcoded path leaked the
 * mother's `~/GitHub/synclair` into fresh installs). Falls back to `cwd`.
 */
export const getRepoRootLabel = cache(async (): Promise<string> => {
  const root = (await git(["rev-parse", "--show-toplevel"]).catch(() => "")).trim()
  const path = root || process.cwd()
  const home = process.env.HOME
  return home && path.startsWith(home) ? path.replace(home, "~") : path
})
