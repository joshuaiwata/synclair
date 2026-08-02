/**
 * RULINGS — the decisions that govern code, attached to the code they govern.
 *
 * The rulings that most need to survive are the ones nobody writes down twice:
 * *this surface stays isolated pending design review*, *work off staging*,
 * *controls never share the container background*. They get made in
 * conversation, land in a memory file or a chat log, and are then rediscovered
 * or broken by whoever comes next — including agents, who have no way to know.
 *
 * CAPTURE IS DELIBERATELY NARROW. The audited implementation mines eight
 * sources: ADR files, commit messages, PR bodies, changelogs, README prose,
 * comment archaeology, LLM inference during doc generation, and local agent
 * transcripts. That is inference at scale, and most of it produces candidates
 * someone then has to adjudicate. We take two:
 *
 *   marker   an explicit `RULING:` / `DECISION:` / `WHY:` comment in the source
 *   file     an ADR-style document under a conventional directory
 *
 * Both are things a human deliberately wrote down as a decision. No git
 * archaeology, no PR mining, and explicitly no transcript mining — reading a
 * developer's local agent logs is a privacy surface far larger than anything
 * else in this plan, and it belongs behind an explicit opt-in if it ever lands.
 *
 * What we DO take from the audit is everything after capture, which is the
 * valuable half: governance links so a ruling reaches the file it governs,
 * staleness so guidance that stopped being true stops being pushed, and typed
 * relations so a superseded ruling reads as history rather than as current law.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"

const sha8 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 8)

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "coverage", "out",
  ".turbo", ".cache", "vendor",
])

/** Comment syntaxes worth reading, across the languages a product repo mixes. */
const MARKER = /(?:^|\s)(?:\/\/|#|--|\/\*+|\*)\s*(RULING|DECISION|WHY|TRADEOFF|ADR)\s*:\s*(.+)$/

/** Conventional homes for decision documents. */
const DOC_DIRS = ["adr", "adrs", "docs/adr", "docs/adrs", "docs/decisions", "decisions"]

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|cs|rs|php|sql|sh|css|scss)$/

function walk(dir, out = [], depth = 0) {
  if (depth > 10 || !existsSync(dir)) return out
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && !DOC_DIRS.some((d) => d.startsWith(e.name))) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      walk(p, out, depth + 1)
    } else if (SOURCE_EXT.test(e.name)) {
      try {
        if (statSync(p).size < 512_000) out.push(p)
      } catch {
        /* unreadable */
      }
    }
  }
  return out
}

/**
 * Scan source for inline ruling markers.
 *
 * Each marker governs the FILE it is written in — that is the whole point of
 * putting it there, and it is what lets a ruling reach an agent at the moment it
 * edits that file rather than in a review three days later.
 *
 * Fenced code inside markdown is skipped so an EXAMPLE of a marker in
 * documentation never becomes a ruling; that trap is why the audited extractor
 * bounds its own comment archaeology.
 */
export function scanMarkers(repoRoot, roots = ["."]) {
  const found = []
  for (const r of roots) {
    for (const file of walk(path.join(repoRoot, r))) {
      const rel = path.relative(repoRoot, file).split(path.sep).join("/")
      let src
      try {
        src = readFileSync(file, "utf8")
      } catch {
        continue
      }
      if (!/RULING|DECISION|TRADEOFF|WHY:|ADR:/.test(src)) continue // cheap pre-filter

      const lines = src.split("\n")
      let fence = null
      lines.forEach((line, i) => {
        const f = /^\s*(```+|~~~+)/.exec(line)
        if (f) {
          fence = fence ? null : f[1][0]
          return
        }
        if (fence) return
        const m = MARKER.exec(line)
        if (!m) return
        const statement = m[2].trim()
        // A bare marker with no statement is a TODO, not a decision.
        if (statement.length < 12) return
        found.push({
          id: sha8(`${rel}:${statement}`),
          kind: m[1].toLowerCase(),
          statement,
          governs: [rel],
          line: i + 1,
          source: "marker",
        })
      })
    }
  }
  return dedupe(found)
}

/** Decision documents under conventional directories. */
export function scanDocs(repoRoot) {
  const found = []
  for (const d of DOC_DIRS) {
    const abs = path.join(repoRoot, d)
    if (!existsSync(abs)) continue
    let entries
    try {
      entries = readdirSync(abs, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".md")) continue
      const rel = `${d}/${e.name}`
      let text
      try {
        text = readFileSync(path.join(repoRoot, rel), "utf8")
      } catch {
        continue
      }
      const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? e.name.replace(/\.md$/, "")
      /**
       * Nygard/MADR status maps onto our lifecycle. Anything we don't recognise
       * stays `proposed` — a document whose status we can't read is not thereby
       * an active rule.
       */
      const raw = /^\s*(?:##\s*)?status\s*:?\s*(\w+)/im.exec(text)?.[1]?.toLowerCase()
      const status =
        raw === "accepted" || raw === "approved" ? "active"
        : raw === "superseded" ? "superseded"
        : raw === "rejected" || raw === "deprecated" ? "deprecated"
        : "proposed"
      found.push({
        id: sha8(rel),
        kind: "adr",
        statement: title,
        governs: [],
        source: "doc",
        doc: rel,
        status,
      })
    }
  }
  return found
}

/** Same statement in several files → one ruling governing all of them. */
function dedupe(list) {
  const by = new Map()
  for (const r of list) {
    const key = r.statement.toLowerCase().replace(/\s+/g, " ").trim()
    const prev = by.get(key)
    if (prev) {
      for (const g of r.governs) if (!prev.governs.includes(g)) prev.governs.push(g)
      continue
    }
    by.set(key, { ...r })
  }
  return [...by.values()]
}

/**
 * Which rulings govern a set of changed files. This is the delivery path — the
 * moment right before code is written is the only one where a ruling changes an
 * outcome instead of explaining a mistake.
 */
export function rulingsFor(rulings, changedFiles) {
  const set = new Set(changedFiles)
  return rulings.filter((r) => (r.governs ?? []).some((g) => set.has(g)))
}

/**
 * Is a ruling still describing the code?
 *
 * `gone` — every file it governs has been deleted; the rule has no subject left.
 * `unanchored` — a document-sourced ruling naming no files; nothing to check.
 * `current` — otherwise.
 *
 * Deliberately NOT the audited staleness score, which grows with commit counts
 * and file age. That answers "has this area been busy", which is a proxy for
 * "is this rule wrong" — and a proxy that decays a rule nobody has broken is
 * how correct guidance stops being shown. A rule stays current until its subject
 * disappears or a human retires it.
 */
export function rulingState(repoRoot, ruling) {
  const governs = ruling.governs ?? []
  if (governs.length === 0) return "unanchored"
  const alive = governs.filter((g) => existsSync(path.join(repoRoot, g)))
  if (alive.length === 0) return "gone"
  return "current"
}
