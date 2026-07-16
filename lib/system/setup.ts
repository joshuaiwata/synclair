import { access, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

/**
 * The SETUP MODE marker — Synclair's one durable, agent-readable record of *how
 * this clone is wired to the product it serves*. There are exactly two operating
 * modes, defined by repo TOPOLOGY (not by which way sync flows):
 *
 * - `embedded` — Synclair lives INSIDE the product repo (one repo). Either the
 *   clone IS the product (a "new project" built in the clone) or Synclair was
 *   dropped into an existing repo (`co-locate-synclair`). Same end state:
 *   skills/knowledge travel with the code, so agents building in the repo get
 *   them ambiently. Two-way.
 * - `watcher` — Synclair is a SEPARATE paired repo BESIDE the product (two
 *   repos, the default `docs/existing-project.md` sibling clone). It observes and
 *   documents the host; nothing lands in the host repo. One-way.
 *
 * A third value is the *absence* of a resolved mode: **blank / unresolved** — the
 * transient state of a fresh clone before setup records anything. "Standalone /
 * new-project" is NOT a third mode; it is `embedded` before the product files
 * have been added.
 *
 * The full model, the two opposite syncs, and boot-time resolution are specced in
 * `docs/setup-modes.md`. Source of truth is `data/setup.json` (SEED — blanked on
 * reseed by `scripts/synclair-reset.sh`, written authoritatively by the install
 * paths). Absent/blank in the mother repo, which is the upstream foundation and
 * is never itself "set up" as embedded or watcher.
 */

const SETUP_PATH = path.join(process.cwd(), "data", "setup.json")
const CATALOG_PATH = path.join(process.cwd(), "data", "external-catalog.json")

export type SetupMode = "embedded" | "watcher"

/**
 * How the marker got its value:
 * - `install` — written authoritatively by an install/setup path (bootstrap,
 *   existing-project intake, co-locate). The trusted source.
 * - `detected` — inferred from topology by `detectSetupMode()` and confirmed.
 * - `user` — set explicitly by a human overriding detection.
 */
export type SetupResolvedBy = "install" | "detected" | "user"

export interface SetupRecord {
  mode: SetupMode
  /** ISO date the mode was resolved. */
  resolvedAt?: string
  resolvedBy?: SetupResolvedBy
}

/**
 * UI metadata per mode — the badge label and the one-line explanation. Keyed so
 * the hub chrome (and any future foundation/system surface) render modes
 * identically wherever they appear.
 */
export const SETUP_MODE_META: Record<SetupMode, { label: string; blurb: string }> = {
  embedded: {
    label: "Embedded",
    blurb: "Synclair lives inside the product repo — one repo, skills & knowledge travel with the code (two-way).",
  },
  watcher: {
    label: "Watcher",
    blurb: "Synclair is a separate repo paired beside the product — it observes and documents the host (one-way).",
  },
}

/**
 * Read the raw marker. Returns `null` when the file is absent, unreadable, or
 * records no resolved mode — every one of those is treated as **blank /
 * unresolved**, the safe fallback. A corrupt (non-ENOENT) file is logged, not
 * thrown, so a bad byte degrades to "unresolved" rather than crashing a page.
 */
export async function getSetupRecord(): Promise<SetupRecord | null> {
  try {
    const raw = await readFile(SETUP_PATH, "utf8")
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const mode = parsed.mode
    // Anything that isn't a known mode (including `null`, the committed blank in
    // the mother repo) reads as unresolved.
    if (mode !== "embedded" && mode !== "watcher") return null
    const resolvedBy = parsed.resolvedBy
    return {
      mode,
      resolvedAt: typeof parsed.resolvedAt === "string" ? parsed.resolvedAt : undefined,
      resolvedBy:
        resolvedBy === "install" || resolvedBy === "detected" || resolvedBy === "user"
          ? resolvedBy
          : undefined,
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(
        "[setup] data/setup.json unreadable — treating as unresolved:",
        e instanceof Error ? e.message : e
      )
    }
    return null
  }
}

/**
 * The resolved setup mode, or `null` when blank/unresolved. This is the primary
 * reader every consumer should reach for (chrome badge, `isExistingProjectMode`,
 * agents deciding embedded-vs-watcher behavior).
 */
export async function getSetupMode(): Promise<SetupMode | null> {
  return (await getSetupRecord())?.mode ?? null
}

/**
 * Persist the mode authoritatively. Install/setup paths call this with
 * `resolvedBy: "install"`; a confirmed detection uses `"detected"`; an explicit
 * human override uses `"user"`. This is the "record" step of
 * determine → confirm → record (docs/setup-modes.md). It is invoked by
 * scripts/skills, never during page rendering.
 */
export async function recordSetupMode(
  mode: SetupMode,
  resolvedBy: SetupResolvedBy
): Promise<SetupRecord> {
  const record: SetupRecord = { mode, resolvedAt: new Date().toISOString(), resolvedBy }
  await writeFile(SETUP_PATH, `${JSON.stringify(record, null, 2)}\n`, "utf8")
  return record
}

// ---------------------------------------------------------------------------
// Boot-time resolution: determine → confirm → record
//
// Detection is the FALLBACK for clones that reach the hub without a marker
// (install paths should write it authoritatively first). It reads repo topology
// and proposes a mode; it must never be silently trusted — the setup skill
// confirms with the user, then calls `recordSetupMode(mode, "detected")`.
// ---------------------------------------------------------------------------

export interface SetupDetection {
  /** Best-guess mode, or `null` when topology is ambiguous (→ leave blank). */
  mode: SetupMode | null
  /** Human-readable reason, shown at the confirm step. */
  signal: string
  /** Heuristic strength. The confirm step is REQUIRED regardless of this. */
  confidence: "high" | "medium" | "low"
}

/** Minimal, dependency-free read of the external catalog's host roots. */
async function readHostRoots(): Promise<string[]> {
  try {
    const raw = await readFile(CATALOG_PATH, "utf8")
    const parsed = JSON.parse(raw) as {
      hosts?: { root?: string }[]
      host?: { root?: string } | null
    }
    const hosts = Array.isArray(parsed.hosts) ? parsed.hosts : parsed.host ? [parsed.host] : []
    return hosts
      .map((h) => h?.root)
      .filter((r): r is string => typeof r === "string" && r.length > 0)
  } catch {
    return []
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

/**
 * Nearest ANCESTOR directory (above `cwd`) that looks like a wrapping project
 * repo — holds both a `.git` and a `package.json`. That signature means Synclair
 * is a subdirectory of a larger repo (co-located → embedded topology), because a
 * standalone clone owns its `.git` at its own root, not above it. Capped at a few
 * levels so it never walks the whole filesystem.
 */
async function nearestEnclosingRepo(cwd: string): Promise<string | null> {
  let dir = path.dirname(cwd)
  for (let i = 0; i < 6; i++) {
    const parent = path.dirname(dir)
    if (parent === dir) break // filesystem root
    if ((await exists(path.join(dir, ".git"))) && (await exists(path.join(dir, "package.json")))) {
      return dir
    }
    dir = parent
  }
  return null
}

/**
 * Determine the setup mode from repo topology. Pure inference — the caller must
 * confirm before recording. Signals, strongest first:
 *
 * 1. A declared host whose root is an ANCESTOR of this repo → Synclair is nested
 *    inside the host (co-located) → `embedded`.
 * 2. A declared host that is a sibling/separate path → a paired repo → `watcher`.
 * 3. No declared host, but this repo sits inside a wrapping repo → `embedded`.
 * 4. Neither → `null` (blank): the clone IS the product once code lands
 *    (embedded, new-project) or becomes a watcher once a host is paired.
 */
export async function detectSetupMode(): Promise<SetupDetection> {
  const cwd = process.cwd()
  const roots = await readHostRoots()

  const ancestorHost = roots.find((r) => {
    const abs = path.resolve(cwd, r)
    return cwd === abs || cwd.startsWith(abs + path.sep)
  })
  if (ancestorHost) {
    return {
      mode: "embedded",
      signal: `Synclair is nested inside the host repo (\`${ancestorHost}\`) — one repo.`,
      confidence: "high",
    }
  }

  if (roots.length > 0) {
    return {
      mode: "watcher",
      signal: `A separate host repo is declared beside this one (${roots
        .map((r) => `\`${r}\``)
        .join(", ")}).`,
      confidence: "high",
    }
  }

  const enclosing = await nearestEnclosingRepo(cwd)
  if (enclosing) {
    return {
      mode: "embedded",
      signal: `This repo sits inside a wrapping project at \`${enclosing}\` (one repo).`,
      confidence: "medium",
    }
  }

  return {
    mode: null,
    signal:
      "No host declared and no wrapping repo — topology unresolved. The clone IS the product (embedded, new-project) once product code lands, or a watcher once a host is paired.",
    confidence: "low",
  }
}
