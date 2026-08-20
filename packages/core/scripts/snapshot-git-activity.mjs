#!/usr/bin/env node
/**
 * Capture the git history the hosted hub needs, as data — run by the deploy
 * workflow between checkout (fetch-depth: 0) and the docker build, writing
 * `data/git-snapshot.json` for lib/system/git-snapshot.ts to replay when the
 * image's runtime has no `.git`.
 *
 * The five invocations below are the SAME ones lib/system/git-activity.ts
 * makes — same flags, same --format strings — over a wide fixed window.
 * If a query changes there, change it here; the replay layer only filters,
 * it never reshapes. (Shared-module extraction was considered and declined:
 * git-activity is a server module wrapped in react `cache`, and five arg
 * arrays are cheaper to keep in step than a refactor of a fresh module.)
 *
 * Env: TRUNK — the branch whose landed history the dashboard narrates
 * (defaults to HEAD, which in CI is the deployed branch).
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

const SEP = "\x1f"
const RS = "\x1e"
const WINDOW_DAYS = 400
const BRANCH_CANDIDATES = 30

const trunk = process.env.TRUNK || "HEAD"
const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
  .toISOString()
  .slice(0, 10)

const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })

// Commit hash -> COMMITTER date. git's own --since/--until filter by committer
// date, but every captured format above carries the AUTHOR date (%aI/%ad) —
// the two differ after a rebase, a cherry-pick, or a delayed merge, so
// filtering the capture by author date puts those commits in the wrong week.
// Captured as a side table so the display formats stay byte-identical to what
// git-activity.ts parses; the replay looks each block up by its short hash.
const committerDates = git([
  "log",
  "--all",
  `--since=${since}T00:00:00`,
  `--format=%h${SEP}%cI`,
])

// people — mirrors getPeopleActivity
const people = git([
  "log",
  "--all",
  "--no-merges",
  `--since=${since}T00:00:00`,
  "--numstat",
  `--format=${RS}%h${SEP}%an${SEP}%aI${SEP}%ad${SEP}%s`,
  "--date=short",
])

// branches — mirrors getActiveBranches (refs list + per-branch trunk..ref)
const forEachRef = git([
  "for-each-ref",
  "--sort=-committerdate",
  `--format=%(refname:short)${SEP}%(authorname)${SEP}%(committerdate:iso-strict)${SEP}%(subject)`,
  "refs/heads",
  "refs/remotes",
])

const seen = new Set()
const refs = []
for (const line of forEachRef.split("\n").filter(Boolean)) {
  const shortRef = line.split(SEP)[0]
  if (!shortRef || shortRef.endsWith("/HEAD")) continue
  const name = shortRef.replace(/^[^/]+\//, "")
  if (name === trunk.replace(/^[^/]+\//, "") || seen.has(name)) continue
  seen.add(name)
  refs.push(shortRef)
  if (refs.length >= BRANCH_CANDIDATES) break
}
const branchLogs = {}
for (const ref of refs) {
  try {
    branchLogs[ref] = git([
      "log",
      `${trunk}..${ref}`,
      "--no-merges",
      "--name-only",
      `--format=${RS}%h`,
    ])
  } catch {
    /* a ref that vanished mid-run is not worth failing the deploy over */
  }
}

// landed — mirrors getLandedChanges (and, filtered, getLandedCount)
const landed = git([
  "log",
  trunk,
  "--first-parent",
  `--since=${since}T00:00:00`,
  "--diff-merges=first-parent",
  "--name-only",
  `--format=${RS}%h${SEP}%an${SEP}%aI${SEP}%s${SEP}%b${SEP}`,
])

// daily — mirrors getDailyVolume
const daily = git([
  "log",
  "--all",
  "--no-merges",
  `--since=${since}T00:00:00`,
  "--format=%h%x1f%ad",
  "--date=short",
])

// github tab — mirrors lib/system/git-log.ts (list + shortstat ledger).
// %ar freezes at capture time; staleness = deploy cadence, same as the rest.
const logRecent = git([
  "log",
  "-n200",
  `--format=%H${SEP}%h${SEP}%an${SEP}%aI${SEP}%ar${SEP}%s`,
])
const logStats = git([
  "log",
  "-n200",
  "--shortstat",
  `--format=${RS}%H${SEP}%h${SEP}%an${SEP}%aI${SEP}%ar${SEP}%s`,
])
const branch =
  process.env.TRUNK?.replace(/^[^/]+\//, "") ||
  git(["rev-parse", "--abbrev-ref", "HEAD"]).trim()
// Every remote's URL, not just origin's: the dashboard asks for the TRUNK's
// remote (which is not origin in every clone), and answering with origin's URL
// named the wrong repo in the one place the page says where its numbers come from.
const remotes = {}
try {
  for (const name of git(["remote"])
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean)) {
    try {
      remotes[name] = git(["remote", "get-url", name]).trim()
    } catch {
      /* skip */
    }
  }
} catch {
  /* detached CI is fine */
}
const remoteUrl = remotes.origin ?? ""

const out = path.join(process.cwd(), "data", "git-snapshot.json")
mkdirSync(path.dirname(out), { recursive: true })
writeFileSync(
  out,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    committerDates,
    remotes,
    people,
    forEachRef,
    branchLogs,
    landed,
    daily,
    logRecent,
    logStats,
    branch,
    remoteUrl,
  })
)
console.log(
  `git snapshot: ${people.split(RS).length - 1} commits (people), ` +
    `${Object.keys(branchLogs).length} branches, ` +
    `${landed.split(RS).length - 1} landed → ${path.relative(process.cwd(), out)}`
)
