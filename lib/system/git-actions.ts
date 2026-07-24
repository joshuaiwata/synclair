"use server"

import { execFile } from "node:child_process"
import { promisify } from "node:util"

const exec = promisify(execFile)

/** Field separator for git --format output; never appears in commit text. */
const SEP = "\x1f"

// Full or abbreviated hex hash only — the client value is never trusted as a
// git argument beyond this shape (mirrors doc-actions.ts's ref validation).
const HASH_RE = /^[0-9a-f]{7,40}$/

/** Cap the drawer payload; a lockfile churn commit can produce megabytes of diff. */
const MAX_PATCH_CHARS = 200_000

export interface CommitDetail {
  hash: string
  shortHash: string
  author: string
  /** ISO author date. */
  date: string
  /** git's human phrasing, e.g. "2 hours ago". */
  relativeDate: string
  subject: string
  /** Commit message body after the subject line ("" for one-line messages). */
  body: string
  /** `git show --stat` summary: files touched + insertion/deletion counts. */
  stat: string
  /** Unified diff (no color codes); truncated to MAX_PATCH_CHARS. */
  patch: string
  truncated: boolean
}

/**
 * Read one commit from the local repository for the drawer. Read-only: the
 * hash is validated against a strict pattern before it touches git, and the
 * commands only ever display history — they never modify the repo.
 */
export async function readCommit(hash: string): Promise<CommitDetail> {
  if (!HASH_RE.test(hash)) throw new Error("Invalid commit hash")

  const opts = { cwd: process.cwd(), maxBuffer: 32 * 1024 * 1024 }
  const [meta, stat, patch] = await Promise.all([
    exec(
      "git",
      ["show", "-s", `--format=%H${SEP}%h${SEP}%an${SEP}%aI${SEP}%ar${SEP}%s${SEP}%b`, hash],
      opts
    ),
    exec("git", ["show", "--stat", "--format=", "--no-color", hash], opts),
    exec("git", ["show", "--patch", "--format=", "--no-color", hash], opts),
  ]).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err)
    // A >maxBuffer patch is not a missing commit — say what actually happened.
    if (/maxBuffer|ENOBUFS/i.test(msg))
      throw new Error("Commit diff exceeds the read budget — inspect it locally with `git show`")
    throw new Error("Commit not found in the local repository")
  })

  const [full, shortHash, author, date, relativeDate, subject, body] =
    meta.stdout.split(SEP)
  const rawPatch = patch.stdout
  const truncated = rawPatch.length > MAX_PATCH_CHARS

  return {
    hash: full,
    shortHash,
    author,
    date,
    relativeDate,
    subject,
    body: (body ?? "").trim(),
    stat: stat.stdout.trimEnd(),
    patch: truncated ? rawPatch.slice(0, MAX_PATCH_CHARS) : rawPatch,
    truncated,
  }
}
