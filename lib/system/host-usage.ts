import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { cache } from "react"

import { getExternalCatalog } from "./external"

/**
 * LIVE usage counts over the HOST's web source (companion mode) — the numbers
 * behind "in host · ~n files" badges on Library items (and token-usage badges,
 * where a project wires them). Part of the derive-don't-transcribe contract
 * (docs/rendering-parity.md): the cataloger's intake-time `usage.fileCount`
 * snapshot is replaced by a count computed at request time against the working
 * tree (same precedent as `git-log.ts`), so it can never go stale — edit the
 * host, refresh the hub, the number moves.
 *
 * They are a PULSE, not an audit (regexes count text occurrences, so a
 * commented-out use still counts) — render them with a "~".
 *
 * Scope: WEB surfaces only. RN surfaces hand-mirror tokens/components into
 * different vocabularies, so their counts need a per-surface pattern map —
 * deliberately out of scope; they keep the cataloged snapshot.
 *
 * Pattern DSL (one string per pattern, combined per item):
 *   "var(--acme-gold)"  literal substring — CSS custom-property reads
 *   "<PageHeader"       JSX tag — `<PageHeader` followed by whitespace / `/` / `>`
 *   "color:gold"        any Tailwind color utility on that key (bg-gold,
 *                       text-gold/60, hover:border-gold, …)
 *   anything else       exact utility-class token, `-`/word-bounded
 *
 * Upstreamed from a companion clone and generalized:
 * no project token namespace is assumed here.
 */

export interface HostUsage {
  /** Total occurrences across the scanned web sources. */
  count: number
  /** Distinct files containing at least one occurrence. */
  fileCount: number
  /** Host-prefixed relative paths (e.g. "acme-app/src/shell/PageHeader.tsx"). */
  files: string[]
}

interface CorpusFile {
  file: string
  text: string
}

const SCAN_EXT = /\.(tsx?|css|html)$/
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out", ".next", ".expo", "synclair"])

async function collect(root: string, dir: string, out: string[]): Promise<void> {
  let entries
  try {
    entries = await readdir(path.join(root, dir), { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const rel = dir ? path.join(dir, e.name) : e.name
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue
      await collect(root, rel, out)
    } else if (SCAN_EXT.test(e.name) && !e.name.endsWith(".d.ts")) {
      out.push(rel)
    }
  }
}

/**
 * The web-host corpus, loaded once per request. Hosts come from the external
 * catalog; non-web surfaces are excluded (see module note). Empty when the
 * host repos aren't checked out (CI) — every count then returns null.
 */
const getWebCorpus = cache(async (): Promise<CorpusFile[]> => {
  const catalog = await getExternalCatalog()
  const hosts = (catalog.hosts ?? []).filter((h) => h.surface !== "mobile")
  const corpus: CorpusFile[] = []
  for (const host of hosts) {
    if (!host.root) continue
    const root = path.resolve(process.cwd(), host.root)
    const files: string[] = []
    await collect(root, "", files)
    const label = host.name ?? host.surface ?? path.basename(root)
    await Promise.all(
      files.map(async (f) => {
        try {
          corpus.push({
            file: `${label}/${f.split(path.sep).join("/")}`,
            text: await readFile(path.join(root, f), "utf8"),
          })
        } catch {
          /* unreadable file — skip */
        }
      })
    )
  }
  return corpus
})

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Tailwind utility prefixes that take a color key. */
const COLOR_UTIL =
  "(?:bg|text|border|ring|ring-offset|outline|fill|stroke|from|via|to|divide|placeholder|caret|accent|decoration|shadow)"

function toRegex(pattern: string): RegExp {
  if (pattern.startsWith("var(")) return new RegExp(escapeRe(pattern), "g")
  if (pattern.startsWith("<"))
    return new RegExp(`${escapeRe(pattern)}(?=[\\s/>])`, "g")
  if (pattern.startsWith("color:")) {
    const key = escapeRe(pattern.slice("color:".length))
    return new RegExp(`(?<![\\w-])${COLOR_UTIL}-${key}(?![\\w-])`, "g")
  }
  return new RegExp(`(?<![\\w-])${escapeRe(pattern)}(?![\\w-])`, "g")
}

/**
 * Count the given patterns across the web-host corpus. Returns null when the
 * corpus is empty (host not present), so callers can render the cataloged
 * snapshot (or nothing) instead of a misleading zero.
 */
export async function countHostUsage(patterns: string[]): Promise<HostUsage | null> {
  const corpus = await getWebCorpus()
  if (corpus.length === 0) return null
  const regexes = patterns.map(toRegex)
  let count = 0
  const files: string[] = []
  for (const { file, text } of corpus) {
    let inFile = 0
    for (const re of regexes) {
      re.lastIndex = 0
      for (; re.exec(text); ) inFile++
    }
    if (inFile > 0) {
      count += inFile
      files.push(file)
    }
  }
  return { count, fileCount: files.length, files: files.sort() }
}

/** PascalCase JSX tag for a kebab-case catalog item name ("page-header" → "<PageHeader"). */
export function jsxTagPattern(itemName: string): string {
  return (
    "<" +
    itemName
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("")
  )
}
