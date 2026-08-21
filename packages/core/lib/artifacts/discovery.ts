import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

import { z } from "zod"

import { cachePath, readArtifact, writeArtifact } from "./shared"

/**
 * DISCOVERY — what exists that nothing covers?
 *
 * The knowledge-manifest coverage loop: walk the directories behind every
 * path-bearing source, list the document-shaped files no entry covers. It
 * never registers anything itself — a discovery is answered by a human or
 * agent RECORDING the file deliberately (or ignoring it with a reason).
 *
 * One owner (battery B3): this module holds the schema, the scan, and the
 * read. The CLI (scripts/check-discovery.ts) and the knowledge page both
 * import from here; nothing else touches the file.
 */

export const uncoveredFileSchema = z.object({
  path: z.string(),
  dir: z.string(),
  mtime: z.string().nullable(),
})

export const discoverySchema = z.object({
  checkedAt: z.string(),
  treesWalked: z.number().int().nonnegative(),
  covered: z.number().int().nonnegative(),
  uncovered: z.array(uncoveredFileSchema),
})

export type DiscoveryReport = z.infer<typeof discoverySchema>

const ARTIFACT = () => cachePath(path.join("knowledge", "discovery.json"))

export function readDiscovery(): DiscoveryReport | null {
  return readArtifact(ARTIFACT(), discoverySchema)
}

/** Files that read as documents — deliberately includes generated artifacts
 *  (.puml/.mmd diagrams, schema exports), the exact class intake used to skip. */
const DOC_EXT = new Set([".md", ".mdx", ".puml", ".mmd", ".adoc", ".rst", ".txt"])
const IGNORE_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "out"])
const IGNORE_FILES = /^(license|notice|changelog|code_of_conduct)/i

// The manifest is TS; its paths are plain string literals. Parsing the
// literals is enough — this is a coverage count, not a compiler.
function manifestPaths(root: string): string[] {
  const src = readFileSync(path.join(root, "lib/system/knowledge/sources.ts"), "utf8")
  const fromSeed = [...src.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1])
  let added: string[] = []
  try {
    const sidecar = JSON.parse(
      readFileSync(path.join(root, "data/knowledge/added-sources.json"), "utf8")
    ) as { sources?: { path?: string }[] }
    added = (sidecar.sources ?? []).map((s) => s.path).filter((p): p is string => Boolean(p))
  } catch {
    /* no sidecar yet */
  }
  return [...new Set([...fromSeed, ...added])]
}

/** Deliberate exclusions — data/knowledge/discovery-ignore.json. Minimal glob
 *  support (*, matched per segment) — patterns are paths, not regexes. */
function ignoreMatchers(root: string): RegExp[] {
  try {
    const raw = JSON.parse(
      readFileSync(path.join(root, "data/knowledge/discovery-ignore.json"), "utf8")
    ) as { patterns?: { glob?: string }[] }
    return (raw.patterns ?? [])
      .map((p) => p.glob)
      .filter((g): g is string => Boolean(g))
      .map(
        (g) =>
          new RegExp(
            "^" + g.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$"
          )
      )
  } catch {
    return []
  }
}

/** Walk sibling files of every covered path; validate; optionally write. */
export function scanDiscovery(opts: { write?: boolean } = {}): DiscoveryReport {
  const root = process.cwd()
  const covered = manifestPaths(root)
  const ignored = ignoreMatchers(root)
  // Paths are host-repo-relative; the hub sits one level inside the host.
  const host = path.resolve(root, "..")
  const coveredAbs = new Set(covered.map((p) => path.resolve(host, p)))

  // One level of SIBLINGS only — a registered file vouches for its own
  // directory being a docs location, not for the whole repo.
  const dirs = [...new Set(covered.map((p) => path.dirname(path.resolve(host, p))))]

  const uncovered: z.infer<typeof uncoveredFileSchema>[] = []
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (!e.isFile() || IGNORE_DIRS.has(e.name) || IGNORE_FILES.test(e.name)) continue
      if (!DOC_EXT.has(path.extname(e.name).toLowerCase())) continue
      const abs = path.join(dir, e.name)
      if (coveredAbs.has(abs)) continue
      const rel = path.relative(host, abs)
      if (ignored.some((re) => re.test(rel))) continue
      let mtime: string | null = null
      try {
        mtime = statSync(abs).mtime.toISOString().slice(0, 10)
      } catch {
        /* keep null */
      }
      uncovered.push({ path: rel, dir: path.relative(host, dir), mtime })
    }
  }

  uncovered.sort((a, b) => (b.mtime ?? "").localeCompare(a.mtime ?? ""))

  const report: DiscoveryReport = {
    checkedAt: new Date().toISOString(),
    treesWalked: dirs.length,
    covered: covered.length,
    uncovered,
  }

  if (opts.write) return writeArtifact(ARTIFACT(), discoverySchema, report)
  return discoverySchema.parse(report)
}
