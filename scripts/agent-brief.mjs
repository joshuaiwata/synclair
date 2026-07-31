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
import { fileURLToPath } from "node:url"

const HUB_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

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
  const p = path.join(HUB_ROOT, "scripts", script)
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

/** Generated artifacts whose recorded sources have moved on. */
function artifactStaleness() {
  const report = runJson("check-freshness.mjs")
  const list = Array.isArray(report?.artifacts) ? report.artifacts : []
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
  const report = readJson("data/knowledge/freshness.json")
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

for (const fn of [artifactStaleness, knowledgeStaleness, uxDebt]) {
  try {
    const s = fn()
    if (s) signals.push(s)
  } catch {
    // A broken signal drops out silently. One bad reader must not cost the
    // agent the other two.
  }
}

// ── output ────────────────────────────────────────────────────────────────────

if (asJson) {
  process.stdout.write(
    JSON.stringify({ hubRoot: HUB_ROOT, clean: signals.length === 0, signals }, null, 2) + "\n"
  )
  process.exit(0)
}

if (signals.length === 0 && !force) process.exit(0)

const header = "[synclair] Hub state — derived, not a request. Fix what your task touches; ignore the rest."
const body = [header, ...signals.map((s) => `  · ${s.line}`)].join("\n")

/** The cap truncates whole lines, never mid-sentence, and says that it did. */
let out = body
if (out.length > MAX_CHARS) {
  const kept = []
  let used = header.length
  for (const s of signals) {
    const line = `\n  · ${s.line}`
    if (used + line.length > MAX_CHARS - 40) break
    used += line.length
    kept.push(`  · ${s.line}`)
  }
  const dropped = signals.length - kept.length
  out = [header, ...kept, `  · (+${dropped} more — \`npm run refresh -- --check\`)`].join("\n")
}

process.stdout.write(out + "\n")
process.exit(0)
