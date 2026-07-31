#!/usr/bin/env node
/**
 * ONE freshness report for every generated artifact.
 *
 * Synclair generates several digests, and each grew its own staleness check —
 * `check:pages` re-hashes per route, `check:host` re-hashes per catalog entry,
 * `check:ux-docs` compares commits, the System Map stores a commit nobody
 * verifies. To answer "is what I'm looking at still true?" you had to know which
 * of six scripts to run and how to read each one's output.
 *
 * This is the single place that asks all of them, using the shared vocabulary
 * from `lib/system/provenance.ts`:
 *
 *   fresh       the sources still hash to what was recorded
 *   stale       they don't — the artifact describes code that has moved on
 *   unanchored  no anchor to check, or the source isn't on this machine
 *   absent      never generated
 *
 * `unanchored` and `absent` are NOT failures. A blank clone has generated
 * nothing, and a host repo may not be checked out here; reporting either as a
 * problem would make this useless in exactly the clones that most need it.
 * Only a real `stale` is a finding, and even then this exits 0 unless asked —
 * staleness is a prompt to regenerate, not corruption. (Corruption is what
 * `check:host` reports, and it still owns that.)
 *
 *   node scripts/check-freshness.mjs           report (always exit 0)
 *   node scripts/check-freshness.mjs --strict  exit 1 if anything is stale (CI)
 *   node scripts/check-freshness.mjs --json    machine-readable
 */

import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const args = process.argv.slice(2)
const strict = args.includes("--strict")
const asJson = args.includes("--json")

function readJson(rel) {
  const p = path.join(ROOT, rel)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, "utf8"))
  } catch {
    return { __unreadable: true }
  }
}

/**
 * Must stay byte-identical to `hashSources` in lib/system/provenance.ts and to
 * check-pages.mjs: rel + "\n" + bytes + "\0" per file. Duplicated because this
 * runs without a TypeScript runtime, the same reason the MCP server duplicates it.
 */
function hashSources(files, baseDir) {
  const hash = createHash("sha256")
  let any = false
  for (const rel of files ?? []) {
    const p = path.join(baseDir, rel)
    if (!existsSync(p)) continue
    hash.update(rel)
    hash.update("\n")
    hash.update(readFileSync(p))
    hash.update("\0")
    any = true
  }
  return any ? hash.digest("hex") : null
}

const baseDirFor = (repoRoot) => (repoRoot ? path.join(ROOT, repoRoot) : ROOT)

function stateOf(anchor, repoRoot) {
  if (!anchor?.sourceHash || !anchor.sourceFiles?.length) return "unanchored"
  const current = hashSources(anchor.sourceFiles, baseDirFor(repoRoot))
  if (current === null) return "unanchored"
  return current === anchor.sourceHash ? "fresh" : "stale"
}

// ---------------------------------------------------------------- artifacts

const report = []

/** Pages — per-node anchors, so this is the most precise signal we have. */
function checkPages() {
  const map = readJson("data/pages-map.json")
  if (!map || map.__unreadable || !map.repo) {
    return { artifact: "pages", state: "absent", detail: "no map — `pages-map` skill" }
  }
  const nodes = map.pages ?? []
  const states = nodes.map((n) =>
    stateOf({ sourceHash: n.sourceHash, sourceFiles: n.sourceFiles }, map.repo?.root)
  )
  const stale = states.filter((s) => s === "stale").length
  const fresh = states.filter((s) => s === "fresh").length
  return {
    artifact: "pages",
    state: stale ? "stale" : fresh ? "fresh" : "unanchored",
    detail: `${nodes.length} route(s) — ${fresh} fresh, ${stale} stale, ${states.length - fresh - stale} unanchored`,
    stale,
    ...(stale ? { fix: "npm run map:pages" } : {}),
  }
}

/** Host catalog — per-entry source hashes, the same ones check:host verifies. */
function checkCatalog() {
  const cat = readJson("data/external-catalog.json")
  if (!cat || cat.__unreadable || !(cat.items ?? []).length) {
    return { artifact: "host-catalog", state: "absent", detail: "no entries" }
  }
  const hostRoot = (surface) => {
    const h = (cat.hosts ?? []).find((x) => x.surface === surface) ?? (cat.hosts ?? [])[0]
    return h ? path.resolve(ROOT, h.root) : null
  }
  let fresh = 0
  let stale = 0
  let unanchored = 0
  for (const it of cat.items) {
    const base = hostRoot(it.surface)
    const abs = base && it.hostPath ? path.join(base, it.hostPath) : null
    if (!abs || !existsSync(abs) || !it.sourceHash) {
      unanchored++
      continue
    }
    const h = createHash("sha256").update(readFileSync(abs)).digest("hex")
    if (h === it.sourceHash) fresh++
    else stale++
  }
  return {
    artifact: "host-catalog",
    state: stale ? "stale" : fresh ? "fresh" : "unanchored",
    detail: `${cat.items.length} entr(ies) — ${fresh} fresh, ${stale} stale, ${unanchored} unanchored`,
    stale,
    ...(stale ? { fix: "re-run the component-cataloger on the drifted entries" } : {}),
  }
}

/** System map + hygiene — catalog-level provenance only (Phase 1). */
function checkProvenanced(rel, artifact, emptyHint, fix) {
  const data = readJson(rel)
  if (!data || data.__unreadable) return { artifact, state: "absent", detail: emptyHint }
  const populated =
    (data.areas ?? data.findings ?? data.items ?? []).length > 0 || Boolean(data.repo)
  if (!populated) return { artifact, state: "absent", detail: emptyHint }
  const repoRoot = data.repo?.root ?? data.hosts?.[0]?.root ?? null
  const state = stateOf(data.provenance, repoRoot)
  return {
    artifact,
    state,
    detail:
      state === "unanchored"
        ? "generated, but carries no source anchor (pre-provenance or agent-written)"
        : `anchored at ${data.provenance?.commit?.slice(0, 7) ?? "?"}`,
    stale: state === "stale" ? 1 : 0,
    ...(state === "stale" ? { fix } : {}),
  }
}

report.push(checkPages())
report.push(checkCatalog())
report.push(
  checkProvenanced("data/system-map.json", "system-map", "not generated — `codebase-map` skill", "codebase-map skill")
)
report.push(
  checkProvenanced("data/host-hygiene.json", "hygiene", "no scan on record", "npm run scan:hygiene")
)

// ------------------------------------------------------------------- output

if (asJson) {
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), artifacts: report }, null, 2))
} else {
  const MARK = { fresh: "fresh     ", stale: "STALE     ", unanchored: "unanchored", absent: "not built " }
  console.log("\nFreshness — is what the hub shows still true?\n")
  for (const r of report) {
    console.log(`  ${MARK[r.state]}  ${r.artifact.padEnd(14)} ${r.detail}`)
    if (r.fix) console.log(`  ${" ".repeat(12)}  ${" ".repeat(14)} → ${r.fix}`)
  }
  const staleCount = report.reduce((n, r) => n + (r.stale ?? 0), 0)
  console.log(
    staleCount
      ? `\n  ${staleCount} stale item(s). Staleness is a prompt to regenerate, not corruption`
        + `\n  — check:host is what reports actual breakage.`
      : "\n  Nothing stale."
  )
  console.log(
    "\n  'unanchored' and 'not built' are not failures: a fresh clone has generated"
    + "\n  nothing, and a host repo may not be checked out here.\n"
  )
}

const anyStale = report.some((r) => r.state === "stale")
process.exit(strict && anyStale ? 1 : 0)
