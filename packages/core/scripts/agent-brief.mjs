#!/usr/bin/env node
/**
 * THE BRIEF — what an agent should know about this hub's state, right now.
 *
 * `refresh --check` already computes an accurate pending list. Nothing carries
 * it to anyone: a human has to remember to run it. This is the delivery half —
 * the same state, formatted for injection at session start (see
 * `scripts/install-agent-hooks.mjs`).
 *
 * Four properties make a hook nobody asked for survivable, and each one is a
 * hard rule here rather than a nice-to-have:
 *
 *   SILENT WHEN CLEAN — zero bytes when there is nothing to say. A hook that
 *   prints on every session gets uninstalled, and then the one session that
 *   needed it gets nothing either.
 *
 *   NO NETWORK, NO MODEL — reads local files and cached JSON only. In
 *   particular it NEVER calls `check:knowledge`, which probes GitHub/Figma over
 *   the network; it reads that check's CACHE and reports how old it is. A
 *   session start that waits on a rate-limited API is worse than no brief.
 *
 *   BOUNDED — every spawned step has a timeout, and the whole output has a hard
 *   character cap. An unbounded brief becomes ambient tax, which is the exact
 *   cost `measure:agent-cost` exists to police.
 *
 *   NEVER FAILS — every path exits 0, including corrupt JSON, a missing file,
 *   a hung child, or a clone where none of this has ever been generated. A
 *   broken environment must not break the agent's session.
 *
 * Location-anchored, not cwd-anchored (the Phase-2 lesson): the hub root comes
 * from this script's own path, and children are spawned with that cwd, because
 * in embedded topology the session's cwd is the PRODUCT repo, not the hub.
 *
 *   node scripts/agent-brief.mjs              the brief (empty when clean)
 *   node scripts/agent-brief.mjs --json       machine-readable, always non-empty
 *   node scripts/agent-brief.mjs --max-chars 800
 *   node scripts/agent-brief.mjs --force      print even when clean (for testing)
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { hubRoot } from "./lib/hub-root.mjs"
import { fileURLToPath } from "node:url"

import { advanceCursor, changesSince, fingerprint } from "./lib/brief-cursor.mjs"
import { emitJson } from "./lib/emit.mjs"
import { rulingsFor } from "./lib/rulings.mjs"

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const HUB_ROOT = hubRoot()

const args = process.argv.slice(2)
const has = (n) => args.includes(n)
const flag = (n, d) => {
  const i = args.indexOf(n)
  return i === -1 ? d : (args[i + 1] ?? d)
}

const asJson = has("--json")
const force = has("--force")
/** ~4 chars per token, matching `measure:agent-cost`'s estimator. 1200 ≈ 300 tokens. */
const MAX_CHARS = Math.max(200, Number(flag("--max-chars", "1200")) || 1200)
/** Per-step wall clock. A step that exceeds it is dropped, not waited on. */
const STEP_TIMEOUT_MS = 4000

/** Read JSON, or null. Corrupt input is indistinguishable from absent ON PURPOSE:
 *  a brief that reports a parse error is noise the agent cannot act on. */
function readJson(rel) {
  const p = path.join(HUB_ROOT, rel)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

/**
 * Spawn a hub script and parse its JSON. Bounded, cwd-anchored, and silent on
 * every failure mode — a non-zero exit is normal for these scripts (they use it
 * to signal findings), so stdout is parsed regardless of exit code.
 */
function runJson(script, extra = []) {
  const p = path.join(SCRIPTS_DIR, script)
  if (!existsSync(p)) return null
  try {
    const out = execFileSync(process.execPath, [p, "--json", ...extra], {
      cwd: HUB_ROOT,
      encoding: "utf8",
      timeout: STEP_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 8 * 1024 * 1024,
    })
    return JSON.parse(out)
  } catch (e) {
    // Findings exit non-zero but still print JSON — recover it when we can.
    const out = e && typeof e.stdout === "string" ? e.stdout : ""
    try {
      return JSON.parse(out)
    } catch {
      return null
    }
  }
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// ── signals ───────────────────────────────────────────────────────────────────
// Each returns a line, or null for "nothing to say". Nothing here may invent a
// finding from absent data: a blank clone has generated nothing, and reporting
// that as drift would fire in every fresh clone forever.

const signals = []

/**
 * `check:freshness` computes live and caches nothing, so run it ONCE and share
 * the result — the standing-condition signal and the change feed both need it,
 * and spawning it twice would double the brief's cold start for no gain.
 */
let freshnessReport
const artifactList = () => {
  if (freshnessReport === undefined) freshnessReport = runJson("check-freshness.mjs")
  return Array.isArray(freshnessReport?.artifacts) ? freshnessReport.artifacts : []
}

/** Generated artifacts whose recorded sources have moved on. */
function artifactStaleness() {
  const list = artifactList()
  // `unanchored` and `absent` are NOT findings — the rule that has held since
  // Phase 1. Only a real `stale` counts.
  const stale = list.filter((a) => a?.state === "stale")
  if (stale.length === 0) return null
  const names = stale.map((a) => a.artifact).filter(Boolean)
  return {
    key: "artifacts",
    line: `${plural(stale.length, "artifact")} stale (${names.join(", ")}) — \`npm run refresh\` fixes the derivable half.`,
    count: stale.length,
  }
}

/**
 * Knowledge freshness, from the CACHE. `check:knowledge` probes the network, so
 * it can never run here. An old cache is reported as old rather than as fresh —
 * "we last looked three weeks ago" is a different claim from "it is current".
 */
function knowledgeStaleness() {
  const report = readJson(".synclair/cache/knowledge/freshness.json")
  if (!report) return null
  const sources = Array.isArray(report.sources) ? report.sources : []
  if (sources.length === 0) return null
  const stale = sources.filter((s) => s?.state === "stale").length
  const never = sources.filter((s) => s?.state === "never").length
  /**
   * `unreachable` counts only for LOCAL sources. A local file that can't be read
   * is unambiguous and actionable — a registered spec was moved, renamed or
   * deleted, and the manifest now points at nothing. The same state on a remote
   * source usually means the network was flaky when the cache was written, and
   * reporting that at session start would be a false alarm nobody can act on.
   */
  const missing = sources.filter((s) => s?.state === "unreachable" && s?.host === "local").length
  if (stale === 0 && never === 0 && missing === 0) return null
  const parts = []
  if (stale) parts.push(`${stale} moved upstream`)
  if (never) parts.push(`${never} never distilled`)
  if (missing) parts.push(`${missing} registered file(s) missing from the repo`)
  let age = ""
  const checkedAt = Date.parse(report.checkedAt ?? "")
  if (Number.isFinite(checkedAt)) {
    const days = Math.floor((Date.now() - checkedAt) / 86_400_000)
    if (days >= 7) age = ` (last probed ${days}d ago — re-run \`npm run check:knowledge\`)`
  }
  return {
    key: "knowledge",
    line: `Knowledge: ${parts.join(", ")}${age} — the \`product-spec\` skill.`,
    count: stale + never + missing,
  }
}

/**
 * Library items whose UX docs are missing or no longer anchored — the PROJECT's
 * items only.
 *
 * Foundation-layer items are the hub's own skin. They ship with Synclair, they
 * sync from upstream, and a product team can neither own nor fix their docs. A
 * clone inherits whatever drift the mother repo shipped with, so counting them
 * here would put a permanent line in every session of every clone for work
 * nobody in that repo is going to do — the precise way a hook earns itself an
 * uninstall. Foundation debt still shows in `npm run refresh -- --check`, which
 * is where the foundation's own maintainer looks.
 */
function uxDebt() {
  const report = runJson("check-ux-docs.mjs")
  // The shape varies by version; read defensively rather than assume a key an
  // older clone may not emit.
  const items = Array.isArray(report?.items)
    ? report.items
    : Array.isArray(report)
      ? report
      : null
  if (!items) return null
  const bad = items.filter(
    (i) =>
      i && i.state && i.state !== "fresh" && i.state !== "ok"
      // An item with no layer predates the field: treat it as the project's,
      // matching the router's stated default. Silence would be the worse error.
      && (i.layer ?? "project") !== "foundation"
  )
  if (bad.length === 0) return null
  return {
    key: "ux-docs",
    line: `${plural(bad.length, "library item")} need UX docs written or re-affirmed — the \`ux-doc\` skill.`,
    count: bad.length,
  }
}

/**
 * What the WORK IN PROGRESS has already touched — the one signal that is about
 * this session rather than about the repo's standing condition.
 *
 * Deliberately quiet: it fires only when uncommitted changes reach something the
 * hub documents, and it names counts, not lists. The point is to catch the case
 * where someone has edited a shared component and has no idea a UX doc and
 * fourteen screens now describe something else.
 */
function workInProgress() {
  const r = runJson("impact.mjs")
  if (!r || !Array.isArray(r.changed) || r.changed.length === 0) return null
  const screens = r.pages?.length ?? 0
  const docs = r.docs?.length ?? 0
  const specs = r.knowledge?.length ?? 0
  const unknown = r.reachUnknown?.length ?? 0
  if (screens + docs + specs + unknown === 0) return null
  const parts = []
  if (screens) parts.push(`${plural(screens, "screen")}`)
  if (docs) parts.push(`${plural(docs, "UX doc")}`)
  if (specs) parts.push(`${plural(specs, "spec")}`)
  // Unknown reach is reported, never rounded down to zero.
  if (unknown) parts.push(`${unknown} item(s) whose screen reach is unmapped`)
  return {
    key: "impact",
    line: `Your uncommitted changes touch ${parts.join(", ")} — \`npm run impact\` lists them.`,
    count: screens + docs + specs + unknown,
  }
}

/**
 * Rulings governing whatever is being edited right now.
 *
 * This is the moment that matters. A standing decision recalled during review is
 * an explanation; the same decision surfaced before the code is written is a
 * different outcome. Reads the persisted register only — the scan itself walks
 * the repo and is far too slow for a session start.
 */
function governingRulings() {
  const register = readJson(".synclair/cache/rulings.json")
  const list = Array.isArray(register?.rulings) ? register.rulings : []
  if (list.length === 0) return null
  const impact = runJson("impact.mjs")
  const changed = Array.isArray(impact?.changed) ? impact.changed : []
  if (changed.length === 0) return null
  const hits = rulingsFor(list, changed).filter((r) => r.state !== "gone")
  if (hits.length === 0) return null
  // One line, quoting the ruling itself — a pointer to "see the register" is a
  // step nobody takes mid-task.
  const first = hits[0].statement
  const more = hits.length > 1 ? ` (+${hits.length - 1} more)` : ""
  return {
    key: "rulings",
    line: `A ruling governs what you're editing: “${first}”${more}`,
    count: hits.length,
  }
}

/**
 * API SURFACE DRIFT — the one staleness nothing else here can see.
 *
 * `artifactStaleness` reads freshness anchors, and the System Map's anchor is
 * its Prisma schemas: add a controller and the map goes on describing a surface
 * that has grown, while every gate reports fresh. That is the normal outcome of
 * rebasing from a backend trunk, and it lands on the agent least likely to
 * check — the one about to wire a screen to an endpoint.
 *
 * Ambient because it has to be: nobody runs a drift scan before asking a
 * question. The number is the whole message; the fix is one command.
 */
function apiDrift() {
  const scan = runJson("scan-system.mjs")
  const derived = Array.isArray(scan?.derived?.api) ? scan.derived.api : []
  if (derived.length === 0) return null
  const missing = Array.isArray(scan?.missing?.api) ? scan.missing.api : []
  const gone = Array.isArray(scan?.gone?.api) ? scan.gone.api : []
  if (missing.length === 0 && gone.length === 0) return null

  const parts = []
  if (missing.length) parts.push(`${missing.length} endpoint(s) in the code the System Map doesn't have`)
  if (gone.length) parts.push(`${gone.length} it describes that the code no longer has`)
  return {
    key: "api-drift",
    line: `${parts.join(", ")} — treat /synclair/system as partial for the backend (\`npm run scan:system -- --check\`)`,
    count: missing.length + gone.length,
  }
}

/**
 * INDEXED BUT UNDESCRIBED — a different thing from drift, and a much better
 * problem to have.
 *
 * Since `scan:system --write` became additive, a new endpoint lands in the map
 * the moment it is scanned, with an empty summary. So the map is no longer
 * MISSING it — the row is there, the path and source are right, and only the
 * meaning is outstanding. Worth a separate line because the fix is different:
 * drift needs a scan, this needs someone to write a sentence.
 *
 * Silent at zero, and never louder than the drift signal above it.
 */
function undescribedEndpoints() {
  const map = readJson("data/system-map.json")
  const api = Array.isArray(map?.api) ? map.api : []
  const blank = api.filter((e) => !e.summary)
  if (blank.length === 0) return null
  const sample = blank.slice(0, 3).map((e) => `${e.method} ${e.path}`).join(", ")
  return {
    key: "undescribed-api",
    line:
      `${blank.length} endpoint(s) indexed but not yet described (${sample}${blank.length > 3 ? " …" : ""})`
      + ` — the paths are right, the meaning isn't written; the \`codebase-map\` skill drains it.`,
    count: blank.length,
  }
}

for (const fn of [governingRulings, workInProgress, artifactStaleness, knowledgeStaleness, uxDebt, apiDrift, undescribedEndpoints]) {
  try {
    const s = fn()
    if (s) signals.push(s)
  } catch {
    // A broken signal drops out silently. One bad reader must not cost the
    // agent the other two.
  }
}

/**
 * The CHANGE FEED — what moved since this developer last saw the brief.
 *
 * Reported before the standing condition, because "a component was cataloged"
 * and "the Billing PRD drifted" are news, while "3 things are stale" is the same
 * sentence every session until someone acts on it. News first, wallpaper second.
 */
let feed = { first: true, events: [] }
let currentFingerprint = null
try {
  currentFingerprint = fingerprint(HUB_ROOT, artifactList())
  feed = changesSince(HUB_ROOT, currentFingerprint)
} catch {
  // No feed is a fine outcome; a broken one must not cost the standing signals.
}

// ── output ────────────────────────────────────────────────────────────────────

if (asJson) {
  /**
   * `--json` NEVER advances the cursor. A machine reading the feed is not a
   * person seeing it, and marking news as read on their behalf means the next
   * human session opens with nothing.
   */
  emitJson({
    hubRoot: HUB_ROOT,
    clean: signals.length === 0 && feed.events.length === 0,
    signals,
    feed,
  })
}

/**
 * A first run seeds the cursor and says nothing about the feed. Announcing 144
 * catalog items as "new" on the first session of a populated clone is the
 * loudest possible way to teach someone to ignore this.
 */
if (feed.first && currentFingerprint) advanceCursor(HUB_ROOT, currentFingerprint)

if (signals.length === 0 && feed.events.length === 0 && !force) process.exit(0)

/**
 * The header used to end with "ignore the rest", which is exactly backwards for
 * the one problem this whole layer has: Synclair helps silently, so the team
 * never sees it working and most of them never open the hub. If a line below
 * changes what gets built, the developer should hear about it in one sentence —
 * otherwise the value is real and invisible, which reads the same as absent.
 */
const header =
  "[synclair] Hub state — derived, not a request. Act on what your task touches, "
  + "ignore the rest, and if any of it changes what you build, say so in one line."
const feedLines = feed.events.map((e) => `  → ${e.text}`)
const body = [
  header,
  ...(feedLines.length ? ["  Since you last looked:", ...feedLines] : []),
  ...signals.map((s) => `  · ${s.line}`),
].join("\n")

/**
 * The cap truncates whole lines, never mid-sentence, and says that it did.
 *
 * Feed lines come first and are dropped last: news is perishable, the standing
 * condition is not — it will still be there next session, and `refresh --check`
 * prints all of it on demand.
 */
let out = body
let feedShown = feedLines.length
if (out.length > MAX_CHARS) {
  const budget = MAX_CHARS - header.length - 60
  const kept = []
  let used = 0
  feedShown = 0
  const push = (line, isFeed) => {
    if (used + line.length + 1 > budget) return false
    used += line.length + 1
    kept.push(line)
    if (isFeed) feedShown++
    return true
  }
  if (feedLines.length) push("  Since you last looked:", false)
  for (const l of feedLines) if (!push(l, true)) break
  for (const s of signals) if (!push(`  · ${s.line}`, false)) break
  const dropped = feedLines.length + signals.length - (kept.length - (feedLines.length ? 1 : 0))
  out = [header, ...kept, `  · (+${dropped} more — \`npm run refresh -- --check\`)`].join("\n")
}

process.stdout.write(out + "\n")

/**
 * Mark as read ONLY what was actually shown. If the cap swallowed part of the
 * feed, the cursor stays put and the rest arrives next session — a notification
 * nobody saw must never be recorded as delivered.
 */
if (currentFingerprint && !feed.first && feedShown === feedLines.length) {
  advanceCursor(HUB_ROOT, currentFingerprint)
}

process.exit(0)
