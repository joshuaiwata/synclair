import { readdir, readFile, stat } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { cache } from "react"

import { getExternalCatalog, type ExternalHost } from "./external"
import { countHostUsage, jsxTagPattern } from "./host-usage"
import { getSurface } from "./surfaces"

/**
 * Live enumeration of the HOST repo's component files — the mechanical half of
 * Storybook-style coverage (docs/rendering-parity.md). Storybook regenerates its
 * stories index on every build; this is the companion-mode equivalent: walk the
 * host source ON EVERY READ and diff what exists against what the catalog
 * documents, so "the catalog covers the app" is a checked claim, not a hope.
 *
 * These are CANDIDATES, not components. An initial dig always surfaces files
 * that export PascalCase functions but aren't real design-system pieces
 * (one-off page sections, providers, icons). Enumeration is deliberately
 * mechanical — the judgment call (real component vs noise) belongs to the
 * intake diggers and humans triaging the coverage list, never to this scan.
 * That's why coverage is ADVISORY everywhere it surfaces (a count + a list),
 * never a hard failure.
 */

/** Directory names never worth walking — build output, deps, tests, the embedded clone. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "out",
  "coverage",
  "public",
  "__tests__",
  "__mocks__",
  "e2e",
  ".storybook",
  ".turbo",
  ".vercel",
  "synclair", // an embedded companion clone inside the host — never host product code
])

/** File suffixes that are never component sources. */
const SKIP_FILE = /\.(test|spec|stories|docs|d)\.tsx?$|\.d\.ts$/

/** Cheap export detection — PascalCase exported declarations. */
const EXPORT_PATTERNS = [
  /export\s+default\s+function\s+([A-Z][A-Za-z0-9]*)/g,
  /export\s+(?:async\s+)?function\s+([A-Z][A-Za-z0-9]*)/g,
  /export\s+const\s+([A-Z][A-Za-z0-9]*)\s*(?:=|:)/g,
]

const MAX_FILES = 5000
const MAX_FILE_BYTES = 300 * 1024

export interface HostComponentCandidate {
  /** Source path relative to the host root — same coordinate space as `ExternalItem.hostPath`. */
  hostPath: string
  /** PascalCase exports found in the file (first one is the primary). */
  exports: string[]
}

export interface HostCoverage {
  host: ExternalHost
  /** Host repo missing on this machine (e.g. CI) — coverage unknowable, not zero. */
  hostOnDisk: boolean
  /** Every candidate component file found in the host. */
  candidates: HostComponentCandidate[]
  /** Catalog entries pointing at this host. */
  catalogedCount: number
  /** Candidates whose file the catalog does not document yet. */
  uncataloged: HostComponentCandidate[]
  /**
   * FICTION RISK — cataloged entries whose host usage is zero. The classic
   * catalog failure ("40 components listed, 23 used") is documenting things the
   * app doesn't actually use; these entries are either dead host code worth
   * flagging to the team or catalog noise from the initial dig worth pruning.
   */
  unusedCataloged: { name: string; hostPath: string }[]
  /** True when the walk hit MAX_FILES and stopped early. */
  truncated: boolean
}

// UI-holding directory segments. Beyond the DS-convention `components/`/`ui/`,
// this includes the feature-organized locations where apps commonly keep
// reusable UI — `screens/`, `views/`, `features/`, plus the app `shell/` and
// explicit `blocks/`/`layouts/`. Coverage is ADVISORY TRIAGE (candidates → a
// human/digger sorts real blocks from page one-offs), so it is far better to
// over-surface a feature tree than to leave it invisible: an app that keeps its
// UI in `src/screens/` must not read as "fully covered" just because the scan
// only looked at `src/components/`. `lib/`, `hooks/`, and route files still
// export PascalCase things and are still excluded.
const UI_DIR_SEGMENTS = new Set([
  "components",
  "ui",
  "shell",
  "screens",
  "views",
  "features",
  "blocks",
  "layouts",
])

function isComponentDir(rel: string): boolean {
  return rel.split(path.sep).some((seg) => UI_DIR_SEGMENTS.has(seg))
}

async function walk(
  dir: string,
  rootAbs: string,
  outFiles: string[]
): Promise<void> {
  if (outFiles.length >= MAX_FILES) return
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (outFiles.length >= MAX_FILES) return
    if (entry.name.startsWith(".") && entry.name !== ".") continue
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      await walk(abs, rootAbs, outFiles)
    } else if (
      entry.isFile() &&
      /\.(tsx|jsx)$/.test(entry.name) &&
      !SKIP_FILE.test(entry.name)
    ) {
      const rel = path.relative(rootAbs, abs)
      if (isComponentDir(rel)) outFiles.push(rel)
    }
  }
}

async function readExports(abs: string): Promise<string[]> {
  try {
    const s = await stat(abs)
    if (s.size > MAX_FILE_BYTES) return []
    const src = await readFile(abs, "utf8")
    const names = new Set<string>()
    for (const pattern of EXPORT_PATTERNS) {
      pattern.lastIndex = 0
      let m
      while ((m = pattern.exec(src)) !== null) names.add(m[1])
    }
    // Re-exports of PascalCase names: `export { Button, buttonVariants }`.
    const re = /export\s*\{([^}]+)\}/g
    let m
    while ((m = re.exec(src)) !== null) {
      for (const part of m[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim()
        if (name && /^[A-Z][A-Za-z0-9]*$/.test(name)) names.add(name)
      }
    }
    return [...names]
  } catch {
    return []
  }
}

/** Enumerate one host's candidate component files (relative paths + exports). */
export async function enumerateHostComponents(
  host: ExternalHost
): Promise<{ candidates: HostComponentCandidate[]; truncated: boolean }> {
  const rootAbs = path.resolve(process.cwd(), host.root)
  const files: string[] = []
  await walk(rootAbs, rootAbs, files)
  const candidates: HostComponentCandidate[] = []
  for (const rel of files) {
    const exports = await readExports(path.join(rootAbs, rel))
    if (exports.length > 0) candidates.push({ hostPath: rel, exports })
  }
  candidates.sort((a, b) => a.hostPath.localeCompare(b.hostPath))
  return { candidates, truncated: files.length >= MAX_FILES }
}

/** Normalize a hostPath for set comparison ("./components/x.tsx" ≡ "components/x.tsx"). */
function normalizePath(p: string): string {
  return p.replace(/^\.\//, "").split(path.sep).join("/")
}

/**
 * Coverage per host: what the live scan found vs what the catalog documents.
 * Memoised per request. Empty array when there are no hosts (new-project mode).
 */
export const getHostCoverage = cache(async (): Promise<HostCoverage[]> => {
  const { hosts, items } = await getExternalCatalog()
  if (hosts.length === 0) return []
  const fallbackSurface = hosts[0].surface
  const results: HostCoverage[] = []
  for (const host of hosts) {
    const rootAbs = path.resolve(process.cwd(), host.root)
    const hostItems = items.filter(
      (it) => (it.surface ?? fallbackSurface) === (host.surface ?? fallbackSurface)
    )
    // The fiction signal: nothing in the host uses a cataloged entry. Counted
    // LIVE against the host source when possible (host-usage.ts — snapshot
    // counts go stale the moment the host moves); the cataloger's intake-time
    // `usage.fileCount` is the fallback for non-web surfaces (RN vocabularies
    // aren't pattern-matched) and absent hosts.
    const webSurface = (id?: string) => {
      const s = id ? getSurface(id) : undefined
      return s ? s.platform === "web" : true // no surfaces declared = single web frontend
    }
    const unusedCataloged = (
      await Promise.all(
        hostItems.map(async (it) => {
          const live = webSurface(it.surface ?? host.surface)
            ? await countHostUsage([jsxTagPattern(it.name)])
            : null
          const fileCount = live?.fileCount ?? it.usage?.fileCount ?? 0
          return fileCount === 0 ? { name: it.name, hostPath: it.hostPath } : null
        })
      )
    ).filter((x): x is { name: string; hostPath: string } => x !== null)
    if (!existsSync(rootAbs)) {
      results.push({
        host,
        hostOnDisk: false,
        candidates: [],
        catalogedCount: hostItems.length,
        uncataloged: [],
        unusedCataloged,
        truncated: false,
      })
      continue
    }
    const { candidates, truncated } = await enumerateHostComponents(host)
    const documented = new Set(hostItems.map((it) => normalizePath(it.hostPath)))
    results.push({
      host,
      hostOnDisk: true,
      candidates,
      catalogedCount: hostItems.length,
      uncataloged: candidates.filter((c) => !documented.has(normalizePath(c.hostPath))),
      unusedCataloged,
      truncated,
    })
  }
  return results
})
