import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import type { z } from "zod"

/**
 * ONE OWNER PER ARTIFACT (north-star Phase 2 / battery B3).
 *
 * Every derived artifact gets a module in lib/artifacts/: its zod `schema`,
 * a `scan()` that VALIDATES ON WRITE, and a `read()` that validates on read.
 * A scanner writing a shape the page can't read then fails in the scanner's
 * own run — not days later in a render. The CLI becomes a thin tsx wrapper;
 * pages and the MCP import `read()`; nothing else touches the file.
 *
 * Contracts:
 *   read  → absent file = null (the fresh-clone contract: readers degrade);
 *           unparsable or invalid = null + one warn (a page must render even
 *           when a hand-edited cache file is garbage).
 *   write → schema.parse BEFORE the write; an invalid shape throws with zod's
 *           own path-level detail and nothing lands on disk.
 */

// Resolved at CALL time, not import time — the hub root is the caller's cwd
// (the one rule PR #74 exists to enforce), and binding it on import breaks any
// caller that changes directory after loading the module (the selftest does).
export function cacheDir(): string {
  return path.join(process.cwd(), ".synclair", "cache")
}

export function cachePath(rel: string): string {
  return path.join(cacheDir(), rel)
}

export function readArtifact<S extends z.ZodType>(abs: string, schema: S): z.infer<S> | null {
  let raw: string
  try {
    raw = readFileSync(abs, "utf8")
  } catch {
    return null // absent — a fresh clone, or a cache not yet built
  }
  try {
    return schema.parse(JSON.parse(raw))
  } catch (err) {
    console.warn(
      `[artifacts] ${path.relative(process.cwd(), abs)} is unreadable or off-schema — treating as absent. ` +
        `Rebuild it (npm run index). ${err instanceof Error ? err.message.split("\n")[0] : ""}`
    )
    return null
  }
}

export function writeArtifact<S extends z.ZodType>(abs: string, schema: S, value: unknown): z.infer<S> {
  const parsed = schema.parse(value) // throws in the WRITER's run — the whole point
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, `${JSON.stringify(parsed, null, 2)}\n`)
  return parsed
}
