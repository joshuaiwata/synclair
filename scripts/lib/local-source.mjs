/**
 * LOCAL KNOWLEDGE SOURCES — a spec that lives in the product repo.
 *
 * `check-knowledge.mjs` probes sources that link OUT (GitHub, Figma, Drive,
 * Notion) and skips anything `access: "repo"`, on the reasoning that an in-repo
 * entry has no upstream to fall behind. That is right for a DIGEST and wrong for
 * a raw spec committed in the product repo, whose upstream is the file itself.
 *
 * It is also the only source we can verify perfectly: no token, no network, no
 * rate limit, correct offline. On a real clone most sources are Figma or another
 * repo, which need auth we may not have; a local file always answers.
 *
 * Two things this module provides:
 *
 *   PROBE — last-commit date + content hash for a tracked file. The HASH decides
 *   staleness so that reformatting a document doesn't raise a false alarm; the
 *   date is what a human reads.
 *
 *   SECTION DIFF — which HEADINGS moved since the digest was written. This is the
 *   difference between "the 40-page spec moved" (a re-read) and "§4 Permissions
 *   and §7 Notifications moved" (an addendum). It needs no new bookkeeping and
 *   no agent cooperation: `distilledAt` plus git history already says what the
 *   file looked like when the digest was written. Git is the shared DB (spec §11).
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16)

function git(repoRoot, args) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
      maxBuffer: 16 * 1024 * 1024,
    })
  } catch {
    return null
  }
}

/**
 * Every `owner/repo` this working tree points at. Used to recognise a GitHub URL
 * that names THIS repo — so an existing entry linking to its own file becomes
 * locally verifiable with no edit to the manifest.
 *
 * Reads EVERY remote, not just `origin`, and does not require the host to be
 * literally `github.com`. A multi-account machine routes through SSH host
 * aliases (`git@github-work:owner/repo.git`), and `url.<base>.insteadOf` rewrites
 * do the same thing invisibly — this repo's own remote is `github-work`. Matching
 * on `github.com` alone silently disabled local detection on exactly the setups
 * most likely to have several repos in play.
 *
 * The host must still LOOK like GitHub (contain "github"), so a GitLab remote
 * that happens to share an owner/repo pair can't be mistaken for one.
 */
export function originSlugs(repoRoot) {
  const cfg = git(repoRoot, ["config", "--get-regexp", "^remote\\..*\\.url"])
  if (!cfg) return []
  const slugs = new Set()
  for (const line of cfg.split("\n")) {
    const url = line.slice(line.indexOf(" ") + 1).trim()
    if (!url) continue
    // scp-style (git@host:owner/repo) and URL-style (proto://host/owner/repo).
    const m = /^(?:[^@]+@)?([^:/]+)[:/](?:.*?\/)??([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url)
    if (!m) continue
    const [, host, owner, repo] = m
    if (!host.toLowerCase().includes("github")) continue
    slugs.add(`${owner}/${repo}`.toLowerCase())
  }
  return [...slugs]
}

/**
 * Resolve a source to a repo-relative file path, or null if it isn't local.
 *
 * Two ways a source can be local:
 *   1. It declares `path` — explicit, and always wins.
 *   2. Its `url` is a GitHub blob URL for THIS repo — inferred, so the 14 GitHub
 *      entries a real clone already has don't need rewriting to gain local
 *      verification. A `tree` URL is a directory, not a document, and is skipped.
 */
export function localPathFor(source, repoRoot, slugs = []) {
  if (typeof source?.path === "string" && source.path.trim()) return source.path.trim()
  const url = typeof source?.url === "string" ? source.url : ""
  const m = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/[^/]+\/(.+?)\/?$/.exec(url)
  if (!m) return null
  const list = Array.isArray(slugs) ? slugs : [slugs].filter(Boolean)
  if (!list.some((s) => String(s).toLowerCase() === `${m[1]}/${m[2]}`.toLowerCase())) return null
  return decodeURIComponent(m[3])
}

/**
 * Split leading YAML frontmatter from the body.
 *
 * This matters more than it looks. Real PRDs open with a `---` block that uses
 * `#` lines as group labels (`# Document Identity`, `# Ownership`). Treated as
 * markdown, every one of those becomes a "section": the count is inflated, and
 * a version bump reads as a content change to a heading nobody wrote. Keeping
 * frontmatter as ONE clearly-labelled pseudo-section reports a metadata edit
 * honestly, as metadata, instead of disguising it as prose drift.
 */
export function splitFrontmatter(text) {
  // Delimiters tolerate trailing whitespace: a formatter that pads line ends
  // must not make a document's frontmatter vanish, which would promote every
  // `#` label inside it to a heading and report the whole file as rewritten.
  const open = /^---[ \t]*\r?\n/.exec(text)
  if (!open) return { frontmatter: null, body: text }
  const rest = text.slice(open[0].length)
  const end = /(^|\r?\n)---[ \t]*(\r?\n|$)/.exec(rest)
  if (!end) return { frontmatter: null, body: text }
  const cut = open[0].length + end.index + end[0].length
  return { frontmatter: text.slice(0, cut), body: text.slice(cut) }
}

/** `title:` from YAML frontmatter, unquoted. Null when there isn't one. */
export function frontmatterTitle(text) {
  const { frontmatter } = splitFrontmatter(text)
  if (!frontmatter) return null
  const m = /^\s*title:\s*(.+?)\s*$/m.exec(frontmatter)
  if (!m) return null
  return m[1].replace(/^['"]|['"]$/g, "").trim() || null
}

/**
 * Split markdown into sections at heading lines. Fenced code blocks are skipped
 * so a `# comment` inside an example never invents a section — the same trap the
 * audited inline-marker extractor calls out.
 */
export function sections(text) {
  const { frontmatter, body: markdown } = splitFrontmatter(text)
  const out = []
  if (frontmatter) out.push({ heading: "(frontmatter)", body: frontmatter })
  let heading = "(preamble)"
  let buf = []
  let fence = null
  for (const line of markdown.split("\n")) {
    const f = /^\s*(```+|~~~+)/.exec(line)
    if (f) {
      if (!fence) fence = f[1][0]
      else if (line.trimStart().startsWith(fence)) fence = null
      buf.push(line)
      continue
    }
    if (!fence && /^#{1,6}\s+\S/.test(line)) {
      out.push({ heading, body: buf.join("\n") })
      heading = line.replace(/^#+\s+/, "").trim()
      buf = []
      continue
    }
    buf.push(line)
  }
  out.push({ heading, body: buf.join("\n") })
  // A document with no headings is one section; drop an EMPTY preamble so a
  // normal doc doesn't report a phantom section. Position-independent: with
  // frontmatter present the preamble is no longer index 0.
  return out.filter((s) => !(s.heading === "(preamble)" && s.body.trim() === ""))
}

/**
 * Normalise before hashing so a formatting pass is not mistaken for an edit.
 * Trailing spaces and runs of blank lines carry no meaning in markdown, and a
 * prettier run across the repo would otherwise flag every section of every spec
 * — which is how a freshness check teaches people to ignore it.
 *
 * Deliberately conservative: it cannot hide a wording change, only whitespace.
 */
const normalise = (body) =>
  body
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

const hashSections = (text) =>
  new Map(sections(text).map((s) => [s.heading, sha(normalise(s.body))]))

/**
 * Directories a team actually keeps specs in. Convention, not configuration:
 * the point is to find documents nobody registered, and a list you have to
 * maintain would go stale exactly like the manifest it is checking.
 */
const DOC_DIRS = [
  ".prds", "prds", "docs/prd", "docs/prds", "docs/specs", "docs/product",
  "specs", "_docs/product", "_docs/specs", "product",
]

/** Files that are project furniture, not specifications. */
const IGNORE = /^(readme|changelog|contributing|license|code_of_conduct|security)\b/i

/**
 * Documents in the product repo that no manifest entry accounts for.
 *
 * Freshness answers "did a REGISTERED source move". Nothing answers "did
 * somebody add a spec and never register it" — so a repo can accumulate real
 * requirements the hub has never heard of. On a real clone this found seven
 * PRDs sitting in `.prds/`, none of them in the manifest.
 *
 * REPORTS ONLY. The drafted fields are the mechanical ones (title from the
 * first heading, kind from the directory); `area` is left null because that is
 * judgment, and a guessed area renders on the Knowledge page as fact.
 */
export function discoverDocs(repoRoot, sourcesInManifest = []) {
  const claimed = new Set(
    sourcesInManifest
      .map((s) => (typeof s === "string" ? s : s?.localPath ?? s?.path))
      .filter(Boolean)
      .map((p) => p.replace(/^\.\//, ""))
  )

  const tracked = git(repoRoot, ["ls-files", "--", ...DOC_DIRS.map((d) => `${d}/*.md`)])
  if (tracked == null) return []

  const out = []
  for (const rel of tracked.split("\n").map((s) => s.trim()).filter(Boolean)) {
    if (claimed.has(rel)) continue
    const base = path.basename(rel)
    if (IGNORE.test(base)) continue
    const abs = path.join(repoRoot, rel)
    if (!existsSync(abs)) continue
    const text = readFileSync(abs, "utf8")
    /**
     * Title, best source first: YAML frontmatter, then the body's first H1,
     * then the filename. Reading the first `#` in the raw file would pick a
     * frontmatter group label — on a real PRD set that titled all seven
     * documents "Document Identity".
     */
    const { body } = splitFrontmatter(text)
    const title =
      frontmatterTitle(text)
      || /^#\s+(.+)$/m.exec(body)?.[1]?.trim()
      || base.replace(/\.md$/, "").replace(/[_-]+/g, " ")
    const lower = rel.toLowerCase()
    const kind = /prd/.test(lower) ? "prd" : /spec/.test(lower) ? "spec" : "doc"
    out.push({
      path: rel,
      title,
      kind,
      sections: sections(text).length,
      modifiedAt: git(repoRoot, ["log", "-1", "--format=%cI", "--", rel])?.trim() || null,
    })
  }
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * Probe a local source.
 *
 * @returns {{verifiable: boolean, unreachable?: boolean, modifiedAt: string|null,
 *            detail: string|null, contentHash: string|null}}
 */
export function probeLocal(repoRoot, rel) {
  const abs = path.join(repoRoot, rel)
  if (!existsSync(abs)) {
    return {
      verifiable: true,
      unreachable: true,
      modifiedAt: null,
      contentHash: null,
      detail: `${rel} is not on disk — moved, renamed, or never committed`,
    }
  }
  // A DIRECTORY is a legitimate thing to point at — "the SQL lives in etl/sql/",
  // "the comps are in planning/" — and a manifest that does so should get an
  // honest "can't verify this" rather than an EISDIR crash that takes the whole
  // check down. Freshness needs one file's mtime and content hash, so a
  // directory is unverifiable by construction, not broken.
  if (statSync(abs).isDirectory()) {
    return {
      verifiable: false,
      modifiedAt: null,
      contentHash: null,
      detail: `${rel} is a directory — point \`path\` at the one file that carries the content to track it`,
    }
  }

  const text = readFileSync(abs, "utf8")
  const iso = git(repoRoot, ["log", "-1", "--format=%cI", "--", rel])?.trim() || null
  return {
    verifiable: true,
    modifiedAt: iso,
    contentHash: sha(normalise(text)),
    // An untracked file has no commit date. That is not a failure — it is a
    // file someone has not committed yet, and saying so beats reporting `fresh`.
    detail: iso ? null : `${rel} is not tracked by git — no commit date to compare`,
  }
}

/**
 * Which sections changed since `distilledAt`.
 *
 * Compares the file at the last commit AT OR BEFORE the digest's timestamp
 * against the working tree. Returns null when the comparison can't be made
 * honestly — no git, no such commit, or the file did not exist then — because a
 * fabricated section list is worse than none.
 */
export function changedSections(repoRoot, rel, distilledAt) {
  if (!distilledAt) return null
  const abs = path.join(repoRoot, rel)
  if (!existsSync(abs)) return null

  /**
   * Resolve the file's state when the digest was written, with a STRICT bound:
   * one second before `distilledAt`.
   *
   * Git timestamps have second granularity, so a commit landing in the same
   * second as the digest is genuinely ambiguous — we cannot know whether the
   * digest saw it. `--before` is inclusive, so the naive bound picks that commit
   * and concludes nothing changed. That fails in the one direction this check
   * must never fail in: reporting `fresh` for a digest that is already lying.
   * A false `stale` costs someone a glance; a false `fresh` costs them the
   * belief that the hub is worth reading. So ambiguity resolves to stale.
   */
  const bound = Date.parse(distilledAt)
  if (!Number.isFinite(bound)) return null
  const strict = new Date(bound - 1000).toISOString()

  const commit = git(repoRoot, [
    "rev-list", "-1", `--before=${strict}`, "HEAD", "--", rel,
  ])?.trim()
  if (!commit) return null

  const before = git(repoRoot, ["show", `${commit}:${rel}`])
  if (before == null) return null

  const now = readFileSync(abs, "utf8")
  if (before === now) return { changed: [], added: [], removed: [], unchanged: hashSections(now).size }

  const a = hashSections(before)
  const b = hashSections(now)
  const changed = []
  const added = []
  const removed = []
  for (const [h, hash] of b) {
    if (!a.has(h)) added.push(h)
    else if (a.get(h) !== hash) changed.push(h)
  }
  for (const h of a.keys()) if (!b.has(h)) removed.push(h)
  const unchanged = [...b].filter(([h, hash]) => a.get(h) === hash).length
  return { changed, added, removed, unchanged, since: commit.slice(0, 8) }
}
