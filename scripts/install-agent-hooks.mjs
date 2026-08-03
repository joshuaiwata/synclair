#!/usr/bin/env node
/**
 * INSTALL the session-start brief into a HOST repo's agent config.
 *
 * `agent-brief.mjs` computes what an agent should know about this hub's state.
 * This registers it so the agent receives it without anyone remembering to ask —
 * the delivery half of the same idea `install-hooks.mjs` applies to commits.
 *
 * WHERE it writes, and why only there:
 *
 *   <host>/.claude/settings.json   PROJECT scope. Visible in git, reviewable in
 *                                  a diff, and committable in embedded topology
 *                                  so a teammate gets it on clone.
 *
 * It never writes `~/.claude/settings.json`. Repowise installs its agent hooks
 * user-globally, which is how it reaches every repo at once — but a machine-wide
 * change made by a project script is invisible and hard to undo, and the same
 * reasoning already keeps `mcp-install` out of the user's global config. A
 * developer who wants the brief everywhere can lift one line into their own
 * settings; we will not do it behind their back.
 *
 * Properties, each of which is a hard rule:
 *
 *   MERGE, NEVER CLOBBER — other tools' hooks, and other Claude Code settings,
 *   survive install and removal untouched.
 *   IDEMPOTENT — re-running replaces our entry in place rather than appending a
 *   second copy.
 *   PRESENCE-GUARDED — the command checks the script exists before running it.
 *   In watcher topology the hub can be absent from a given machine, and an
 *   unguarded hook would print "command not found" on every session start:
 *   non-blocking, unactionable, and endless.
 *   REVERSIBLE — `--remove` restores the file, and deletes it entirely if we
 *   were the only reason it existed.
 *   NEVER FROM postinstall — only when a human runs it.
 *
 *   node scripts/install-agent-hooks.mjs --print    show what would be written
 *   node scripts/install-agent-hooks.mjs            write it
 *   node scripts/install-agent-hooks.mjs --remove   take it back out
 *   node scripts/install-agent-hooks.mjs --host ../app
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { isEmbeddedish, resolveTarget, scriptPathFor } from "./lib/topology.mjs"

const HUB_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const BRIEF_REL = path.join("scripts", "agent-brief.mjs")
const AUGMENT_REL = path.join("scripts", "agent-augment.mjs")

/** Identifies OUR hook so removal is exact. A shell comment: inert when run. */
const SENTINEL = "# synclair:agent-brief"

/**
 * `compact` is deliberately excluded from the matcher. The brief usually
 * survives compaction inside the summary, so re-emitting it there would double
 * it up — the one place an injected block is most likely to already be present.
 */
const MATCHER = "startup|resume|clear"

const args = process.argv.slice(2)
const has = (n) => args.includes(n)
const flag = (n) => {
  const i = args.indexOf(n)
  return i === -1 ? null : (args[i + 1] ?? "")
}

const { hostRoot, mode } = resolveTarget(HUB_ROOT, flag("--host"))

if (!hostRoot) {
  console.error(
    `Topology is "watcher" but data/setup.json records no host path.\n`
    + `Re-run with an explicit target:  node scripts/install-agent-hooks.mjs --host ../your-app`
  )
  process.exit(1)
}

const settingsPath = path.join(hostRoot, ".claude", "settings.json")
const briefPath = scriptPathFor(HUB_ROOT, hostRoot, mode, BRIEF_REL)

/**
 * POSIX, and quoted so a path containing spaces survives. Exits 0 whatever
 * happens: the brief is advisory, and a session must never fail to start
 * because a reporting hook had a bad day.
 */
const command = `if [ -f "${briefPath}" ]; then node "${briefPath}" || true; fi ${SENTINEL}`

const entry = { matcher: MATCHER, hooks: [{ type: "command", command }] }

/**
 * The edit-time hook — the PUSH half, and the piece the whole audit was about.
 * repowise's model is that context arrives whether or not the agent thinks to
 * ask; our MCP tools are pull, so an agent that never calls one gets nothing.
 * This fires on write-shaped tools only and is silent unless the file is
 * actually governed, actually wide-reaching, or actually a registered spec.
 */
const augmentPath = scriptPathFor(HUB_ROOT, hostRoot, mode, AUGMENT_REL)
const augmentCommand = `if [ -f "${augmentPath}" ]; then node "${augmentPath}" || true; fi ${SENTINEL}`
const augmentEntry = {
  matcher: "Edit|MultiEdit|Write|NotebookEdit",
  hooks: [{ type: "command", command: augmentCommand }],
}

// ── read ──────────────────────────────────────────────────────────────────────

const existedBefore = existsSync(settingsPath)
let raw = null
let settings = {}

if (existedBefore) {
  raw = readFileSync(settingsPath, "utf8")
  try {
    settings = JSON.parse(raw)
  } catch (e) {
    // Refuse rather than guess. Overwriting a file we cannot parse would
    // destroy settings we never saw.
    console.error(
      `Refusing to edit unparseable JSON: ${settingsPath}\n  ${e instanceof Error ? e.message : e}`
    )
    process.exit(1)
  }
  if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
    console.error(`Refusing to edit ${settingsPath}: expected a JSON object at the top level.`)
    process.exit(1)
  }
}

/** Match the file's own formatting so an unrelated diff never appears. */
function detectIndent(text) {
  if (!text) return 2
  const m = /\n([ \t]+)"/.exec(text)
  if (!m) return 2
  return m[1].startsWith("\t") ? "\t" : m[1].length
}
const indent = detectIndent(raw)
const trailingNewline = raw == null ? true : raw.endsWith("\n")

const isOurs = (group) =>
  Array.isArray(group?.hooks)
  && group.hooks.some((h) => typeof h?.command === "string" && h.command.includes(SENTINEL))

/** Strip our entries wherever they appear, and tidy containers we emptied. */
function stripOurs(obj) {
  const hooks = obj.hooks
  if (!hooks || typeof hooks !== "object") return { changed: false }
  let changed = false
  for (const key of ["SessionStart", "PostToolUse"]) {
    const groups = Array.isArray(hooks[key]) ? hooks[key] : null
    if (!groups) continue
    const kept = groups.filter((g) => !isOurs(g))
    if (kept.length === groups.length) continue
    changed = true
    if (kept.length > 0) hooks[key] = kept
    else delete hooks[key]
  }
  if (Object.keys(hooks).length === 0) delete obj.hooks
  return { changed }
}

const serialise = (obj) => JSON.stringify(obj, null, indent) + (trailingNewline ? "\n" : "")

// ── remove ────────────────────────────────────────────────────────────────────

if (has("--remove")) {
  if (!existedBefore) {
    console.log(`Nothing to remove — ${settingsPath} does not exist.`)
    process.exit(0)
  }
  const { changed } = stripOurs(settings)
  if (!changed) {
    console.log(`No synclair brief hook in ${settingsPath} — nothing to remove.`)
    process.exit(0)
  }
  // If we were the only reason the file existed, take it with us: that restores
  // a clone to its true original state rather than leaving an empty husk.
  if (Object.keys(settings).length === 0) {
    rmSync(settingsPath)
    console.log(`Removed the brief hook and the now-empty ${settingsPath}.`)
    process.exit(0)
  }
  writeFileSync(settingsPath, serialise(settings))
  console.log(`Removed the brief hook from ${settingsPath} (other settings kept).`)
  process.exit(0)
}

// ── install ───────────────────────────────────────────────────────────────────

stripOurs(settings) // idempotent: replace in place rather than append a duplicate
settings.hooks ??= {}
if (!Array.isArray(settings.hooks.SessionStart)) settings.hooks.SessionStart = []
settings.hooks.SessionStart.push(entry)
if (!Array.isArray(settings.hooks.PostToolUse)) settings.hooks.PostToolUse = []
settings.hooks.PostToolUse.push(augmentEntry)

const output = serialise(settings)

if (has("--print")) {
  console.log(`target: ${settingsPath}`)
  console.log(`mode:   ${mode}${isEmbeddedish(HUB_ROOT, hostRoot, mode) ? " (committable)" : " (machine-specific — gitignore it)"}\n`)
  console.log(output)
  process.exit(0)
}

mkdirSync(path.dirname(settingsPath), { recursive: true })
writeFileSync(settingsPath, output)

console.log(`Session-start brief installed → ${settingsPath}`)
console.log(
  isEmbeddedish(HUB_ROOT, hostRoot, mode)
    ? `  Path is repo-relative — safe to commit.`
    : `  Path is absolute (watcher topology) — gitignore this file.`
)
console.log(`  Silent when clean. Preview it now:  node ${BRIEF_REL} --force`)
console.log(`  Remove with:  node scripts/install-agent-hooks.mjs --remove`)
