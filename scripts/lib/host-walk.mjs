/**
 * Shared HOST-repo walk — the one mechanical enumeration of a host codebase's
 * component files, used by every script that needs it.
 *
 * This logic existed twice before (in `check-host-coverage.mjs` and, in
 * TypeScript, in `lib/system/host-scan.ts`). A third copy would guarantee they
 * drift, and "the catalog covers the app" is only a checked claim if every check
 * agrees on what the app contains. The TS copy stays — the hub reads it at
 * request time and can't import `.mjs` — but the script side now shares one
 * implementation. Keep the two in step: the skip lists and export patterns here
 * are the same rules `host-scan.ts` applies.
 *
 * CANDIDATES, NOT COMPONENTS. A mechanical walk always surfaces files that export
 * PascalCase functions but aren't design-system pieces — providers, page
 * one-offs, icon wrappers. Deciding which are real is judgment and belongs to
 * the intake diggers and the humans triaging them. Nothing built on this module
 * may write straight into the catalog: that is precisely how a hub ends up
 * listing 40 components when the app renders 23.
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

/** Build output, deps, tests, and the embedded Synclair clone itself. */
export const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", "coverage",
  "public", "__tests__", "__mocks__", "e2e", ".storybook", ".turbo",
  ".vercel", "synclair",
])

/** Test/story/type files that sit beside components but aren't components. */
export const SKIP_FILE = /\.(test|spec|stories|docs|d)\.tsx?$|\.d\.ts$/

/** How a component announces itself. PascalCase export = candidate. */
export const EXPORT_PATTERNS = [
  /export\s+default\s+function\s+([A-Z][A-Za-z0-9]*)/g,
  /export\s+(?:async\s+)?function\s+([A-Z][A-Za-z0-9]*)/g,
  /export\s+const\s+([A-Z][A-Za-z0-9]*)\s*(?:=|:)/g,
]

/** Skip pathologically large files rather than stalling a scan on generated code. */
export const MAX_FILE_BYTES = 300 * 1024

/**
 * Where UI lives. Beyond the design-system convention (`components/`, `ui/`),
 * include feature-organised locations — coverage is advisory triage, so
 * over-surfacing a feature tree beats leaving it invisible.
 *
 * Keep in sync with lib/system/host-scan.ts and ci-pr-catalog-check.mjs.
 */
export const UI_DIR_SEGMENTS = new Set([
  "components", "ui", "shell", "screens", "views", "features", "blocks", "layouts",
])

export function isComponentDir(rel) {
  return rel.split(path.sep).some((seg) => UI_DIR_SEGMENTS.has(seg))
}

function walkDir(dir, rootAbs, files, accept) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    // An unreadable directory is skipped, never fatal — a host repo may contain
    // symlinks or permission-restricted paths we have no business failing on.
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walkDir(abs, rootAbs, files, accept)
    } else if (entry.isFile()) {
      const rel = path.relative(rootAbs, abs)
      if (accept(entry.name, rel)) files.push(rel)
    }
  }
}

/** Component-file candidates: .tsx/.jsx under a components/ or ui/ path. */
export function walkComponents(rootAbs) {
  const files = []
  walkDir(rootAbs, rootAbs, files, (name, rel) =>
    /\.(tsx|jsx)$/.test(name) && !SKIP_FILE.test(name) && isComponentDir(rel)
  )
  return files
}

/** Every source file — the corpus for counting where a component is actually used. */
export function walkAll(rootAbs) {
  const files = []
  walkDir(rootAbs, rootAbs, files, (name) =>
    /\.(tsx?|css|html)$/.test(name) && !name.endsWith(".d.ts")
  )
  return files
}

/** PascalCase exports declared in a file. */
export function exportsOf(abs) {
  try {
    if (statSync(abs).size > MAX_FILE_BYTES) return []
    const src = readFileSync(abs, "utf8")
    const names = new Set()
    for (const pattern of EXPORT_PATTERNS) {
      pattern.lastIndex = 0
      let m
      while ((m = pattern.exec(src)) !== null) names.add(m[1])
    }
    return [...names]
  } catch {
    return []
  }
}

/** Repo-relative path with forward slashes, however the platform spells them. */
export const norm = (p) => p.replace(/^\.\//, "").split(path.sep).join("/")
