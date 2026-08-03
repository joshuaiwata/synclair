#!/usr/bin/env node
/**
 * PUSH, at the moment the agent touches a file.
 *
 * The session brief tells an agent the repo's state when a session opens. That
 * is the cheap half. The expensive half — and the one that actually changes what
 * gets written — is firing at the moment of an EDIT, because a ruling recalled
 * during review is an explanation, while the same ruling surfaced before the
 * code is written is a different outcome.
 *
 * This is the piece the audit identified and we shipped without: repowise's
 * whole model is that context arrives whether or not the agent thinks to ask for
 * it. Our MCP tools are PULL — an agent that never calls one gets nothing, and
 * nothing tells it to. A `PostToolUse` hook is push, and it costs the agent no
 * tokens it didn't already spend.
 *
 * Reads the hook payload on stdin (`{tool_name, tool_input}`), writes at most a
 * couple of lines, and gets out of the way.
 *
 * The same four rules the brief lives by, and for the same reasons — except
 * every one matters MORE here, because this fires on every single edit rather
 * than once a session:
 *
 *   SILENT unless the file is actually governed or actually reaches something.
 *   FAST — a hard budget, and no work at all for files the hub doesn't track.
 *   NO NETWORK, NO MODEL.
 *   NEVER FAILS — every path exits 0. A broken hook must not break an edit.
 *
 * Deliberately NOT doing repowise's Grep/Read enrichment yet: appending context
 * to every search is where their design earns its "noise" risk, and one signal
 * that fires at the right moment beats four that fire constantly.
 *
 *   echo '{"tool_name":"Edit","tool_input":{"file_path":"..."}}' | node scripts/agent-augment.mjs
 */

import { existsSync, readFileSync, realpathSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HUB_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

/** Read stdin fully, but never hang if nothing is piped. */
function readStdin() {
  try {
    return readFileSync(0, "utf8")
  } catch {
    return ""
  }
}

const raw = readStdin()
let payload = {}
try {
  payload = JSON.parse(raw)
} catch {
  // A hook that can't parse its input says nothing rather than guessing.
  process.exit(0)
}

const tool = payload.tool_name ?? payload.toolName ?? ""
/** Only the write-shaped tools. A Read is not a decision point. */
if (!/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(tool)) process.exit(0)

const filePath =
  payload.tool_input?.file_path ?? payload.tool_input?.path ?? payload.toolInput?.file_path ?? ""
if (!filePath) process.exit(0)

const readJson = (rel) => {
  const p = path.join(HUB_ROOT, rel)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

/**
 * The edited file, expressed the way the hub's data is keyed (product-repo
 * relative, POSIX). Everything downstream is a plain lookup, so a wrong base
 * here yields silence rather than a wrong answer — the safe direction for a hook
 * that fires constantly.
 */
function productRelative(abs) {
  const setup = readJson("data/setup.json") ?? {}
  const hostRoot = setup.mode === "embedded" ? path.dirname(HUB_ROOT) : HUB_ROOT
  /**
   * Realpath BOTH sides. On macOS the OS tempdir (and plenty of real checkouts)
   * live behind a symlink — /var is /private/var — so the harness hands us a
   * symlinked path while our own location is already resolved. `path.relative`
   * between the two produces "../.."-garbage, the file reads as outside the
   * repo, and the hook goes silent on exactly the files it should fire for.
   * Silence was the designed failure direction, which is what made this bug
   * invisible: it looked like restraint.
   */
  const real = (p) => {
    try {
      return realpathSync(p)
    } catch {
      return p
    }
  }
  const rel = path.relative(real(hostRoot), real(path.resolve(abs)))
  return rel.startsWith("..") ? null : rel.split(path.sep).join("/")
}

const rel = productRelative(filePath)
if (!rel) process.exit(0)

const lines = []

/**
 * 1. A ruling that governs this exact file.
 *
 * This is the whole reason the hook exists. A standing decision — "this surface
 * stays isolated", "every mutation goes through the audit log" — is worth
 * nothing in a memory file and everything in the second before someone breaks
 * it. Persisted register only; scanning the repo on every edit would be absurd.
 */
try {
  const register = readJson("data/rulings.json")
  for (const r of register?.rulings ?? []) {
    if (r?.state === "gone") continue
    if ((r.governs ?? []).includes(rel)) {
      lines.push(`[synclair] A ruling governs this file: “${r.statement}”`)
      break // one is a reminder; several is a lecture
    }
  }
} catch {
  /* a broken register costs the other signals nothing */
}

/**
 * 2. What this file reaches.
 *
 * Only when the reach is big enough to be news. A component rendered on two
 * screens is unremarkable; one rendered on forty is a different conversation
 * about the change being made, and the agent should say so before it finishes.
 */
try {
  const pages = readJson("data/pages-map.json")
  const repoRoot = typeof pages?.repo?.root === "string" ? pages.repo.root : "."
  // Same realpath discipline as productRelative — a symlinked checkout must not
  // silently zero the reach signal.
  let hostRoot = path.dirname(HUB_ROOT)
  try {
    hostRoot = realpathSync(hostRoot)
  } catch {
    /* keep as-is */
  }
  let screens = 0
  for (const page of pages?.pages ?? []) {
    const files = (page.sourceFiles ?? []).map((f) =>
      path.relative(hostRoot, path.resolve(HUB_ROOT, repoRoot, f)).split(path.sep).join("/")
    )
    if (files.includes(rel)) screens++
  }

  /**
   * Path matching alone is dead in any repo that imports through a BARREL.
   *
   * `sourceFiles` records what the closure walker reached, and the walker stops
   * at a re-export — so a page that renders `Table` records
   * `src/components/toolbelt-ui/index.ts`, never `toolbelt-ui/table.tsx`.
   * Editing the component thirteen screens depend on matched zero of them:
   * exactly the case this signal exists for, silent in the repo that needs it.
   *
   * The catalog already knows this file IS `Table`, and the pages map already
   * records which pages compose `Table` — the same join `get_component` makes.
   * Names survive re-exports; paths don't. So fall back to the name join, and
   * take whichever count is higher.
   *
   * Two things a naive name join gets wrong, both present in a real clone:
   *
   *   ONE FILE, SEVERAL ITEMS — a primitives file can export seven catalogued
   *   components. Matching only the first under-counts the file's real reach, so
   *   take every catalogued item the file exports and count DISTINCT pages.
   *
   *   THE SAME NAME IN TWO SURFACES — `Button` can exist in both a shared
   *   package and an app. Counting one surface's pages while editing the other's
   *   file is a fabricated number, which is worse than silence. Both sides
   *   record the item's origin surface, so require they agree — but only when
   *   both declare one, since a single-surface clone may leave it unset.
   */
  if (screens < 5) {
    const catalog = readJson("data/external-catalog.json")
    const exported = (catalog?.items ?? []).filter((i) => {
      if (typeof i?.hostPath !== "string") return false
      const host = (catalog.hosts ?? []).find((h) => h.surface === i.surface) ?? (catalog.hosts ?? [])[0]
      if (!host?.root) return false
      const abs = path.resolve(HUB_ROOT, host.root, i.hostPath)
      return path.relative(hostRoot, abs).split(path.sep).join("/") === rel
    })
    if (exported.length) {
      const same = (used, item) =>
        String(used?.name).toLowerCase() === String(item.name).toLowerCase()
        && (!used?.surface || !item.surface || used.surface === item.surface)
      const reached = new Set()
      for (const p of pages?.pages ?? []) {
        if ((p.items ?? []).some((u) => exported.some((i) => same(u, i)))) {
          reached.add(p.id ?? p.route ?? p.file)
        }
      }
      if (reached.size > screens) screens = reached.size
    }
  }
  if (screens >= 5) {
    lines.push(
      `[synclair] This file is in the source closure of ${screens} screens — `
      + `\`npm run impact\` lists them.`
    )
  }
} catch {
  /* no pages map, no reach signal */
}

/**
 * 3. A spec that covers this file's area, and has moved since its digest.
 *
 * Narrow on purpose: only when the edited file IS the registered source. Fuzzy
 * area-matching would fire on half the repo and teach everyone to ignore it.
 */
try {
  const fresh = readJson("data/knowledge/freshness.json")
  for (const s of fresh?.sources ?? []) {
    if (s?.localPath === rel && s.state === "stale") {
      const moved = s.sections?.changed?.length
      lines.push(
        `[synclair] You are editing a registered spec${moved ? ` (${moved} section(s) already drifted from its digest)` : ""}`
        + ` — re-distil with the \`product-spec\` skill when done.`
      )
      break
    }
  }
} catch {
  /* no cache, no signal */
}

if (lines.length === 0) process.exit(0)

// Two lines maximum. This fires on every edit; a paragraph would be noise, and
// noise is what gets the whole mechanism switched off.
process.stdout.write(lines.slice(0, 2).join("\n") + "\n")
process.exit(0)
