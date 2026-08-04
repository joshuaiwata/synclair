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
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { buildGraph, impactOf } from "./lib/edges.mjs"
import { resolveTarget } from "./lib/topology.mjs"

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

/**
 * An artifact records paths against its own base; the edge graph is keyed on the
 * PRODUCT repo. Normalise once here rather than letting each caller guess — a
 * wrong base yields an empty cascade that looks exactly like a clean one.
 */
const HUB = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const HOST = resolveTarget(HUB).hostRoot ?? HUB
const toProductRel = (rel, repoRoot) =>
  path.relative(HOST, path.resolve(ROOT, repoRoot ?? ".", rel)).split(path.sep).join("/")

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
  /**
   * The files that actually drifted, product-repo-relative — the cascade needs
   * PATHS, not a count. Returning only "3 stale" made the one-hop walk silently
   * traverse nothing, which is the same blind-scanner failure that reported 75
   * endpoints as unused elsewhere in this plan.
   */
  const staleSources = nodes
    .filter((_, i) => states[i] === "stale")
    .flatMap((n) => (n.sourceFiles ?? []).map((f) => toProductRel(f, map.repo?.root)))
  return {
    artifact: "pages",
    state: stale ? "stale" : fresh ? "fresh" : "unanchored",
    detail: `${nodes.length} route(s) — ${fresh} fresh, ${stale} stale, ${states.length - fresh - stale} unanchored`,
    stale,
    sourceFiles: staleSources,
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
  /**
   * The component files that drifted. This is the cascade that earns its keep:
   * a changed component reaches the screens that render it and the docs that
   * describe it — things nobody would otherwise think to re-check.
   */
  const staleSources = []
  for (const it of cat.items) {
    const base = hostRoot(it.surface)
    const abs = base && it.hostPath ? path.join(base, it.hostPath) : null
    if (!abs || !existsSync(abs) || !it.sourceHash) {
      unanchored++
      continue
    }
    const h = createHash("sha256").update(readFileSync(abs)).digest("hex")
    if (h === it.sourceHash) fresh++
    else {
      stale++
      staleSources.push(path.relative(HOST, abs).split(path.sep).join("/"))
    }
  }
  return {
    artifact: "host-catalog",
    state: stale ? "stale" : fresh ? "fresh" : "unanchored",
    detail: `${cat.items.length} entr(ies) — ${fresh} fresh, ${stale} stale, ${unanchored} unanchored`,
    stale,
    sourceFiles: staleSources,
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

/**
 * The Figma manifest, reported by AGE rather than by hash.
 *
 * Every other artifact here is anchored to files on disk, so "has the source
 * moved" is answerable locally. Figma's has not: the source lives behind an
 * authenticated API this deterministic check will not call, which is exactly why
 * the generic knowledge probe reports those sources `unverifiable` rather than
 * guessing. So the honest signal is not freshness but AGE — how long since anyone
 * looked. A snapshot nobody has refreshed in months is the thing worth surfacing,
 * and silence about it was reading as "fine".
 */
function checkFigmaManifest() {
  const dir = path.join(ROOT, "data", "figma-manifest")
  let snapshots = []
  try {
    snapshots = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
  } catch {
    /* never generated */
  }
  const latest = snapshots.at(-1)
  if (!latest) {
    return {
      artifact: "figma-manifest",
      state: "absent",
      detail: "no snapshot on record — the `figma-distiller` skill takes one",
    }
  }
  const taken = latest.replace(/\.json$/, "")
  const days = Math.floor((Date.now() - Date.parse(taken)) / 86_400_000)
  // 30 days is a judgement, not a measurement: long enough that a working file
  // has certainly moved, short enough to still be actionable.
  const old = days >= 30
  return {
    artifact: "figma-manifest",
    state: old ? "stale" : "fresh",
    detail: `snapshot taken ${taken} (${days} day${days === 1 ? "" : "s"} ago) — age only; Figma cannot be hashed locally`,
    stale: old ? 1 : 0,
    /**
     * ADVISORY under `--strict`: this is the one artifact whose staleness is a
     * CALENDAR reading, not evidence that anything changed. Nothing local can
     * hash Figma, so a 30-day-old snapshot of an untouched file is reported
     * identically to one of a file redrawn yesterday — and re-taking it needs
     * Figma access the person hitting the gate may not have.
     *
     * A gate that fails for a reason you cannot fix is one people learn to
     * bypass, and they bypass it for the other artifacts too. So this still
     * reports, loudly, and never fails the build on its own.
     */
    advisory: true,
    ...(old ? { fix: "re-take the snapshot via the `figma-distiller` skill" } : {}),
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
report.push(
  checkProvenanced(
    "data/contracts.json",
    "contracts",
    "not derived — npm run scan:contracts",
    "npm run scan:contracts -- --write"
  )
)
report.push(checkFigmaManifest())

// ----------------------------------------------------------------- cascade
/**
 * Staleness that TRAVELS.
 *
 * Every check above asks whether its own artifact drifted. None asks what a
 * drift invalidated elsewhere — yet a stale pages map means the docs and specs
 * covering those routes are suspect too, and nobody thinks to look.
 *
 * So: take the source files the stale artifacts recorded, and walk them one hop
 * through the edge graph. One hop, deliberately — a transitive walk reaches most
 * of an app in three, and a report that names everything names nothing.
 *
 * ADVISORY. Cascade findings never change the exit code: they are a pointer, and
 * an artifact that drifted only because a neighbour did has not itself failed.
 */
function cascade() {
  const staleArtifacts = report.filter((r) => r.state === "stale")
  const staleSources = staleArtifacts.flatMap((r) => r.sourceFiles ?? [])
  if (staleSources.length === 0) return null
  try {
    const graph = buildGraph(HUB)
    const hit = impactOf(graph, staleSources)
    /**
     * Suppress the category the stale artifact IS. "The pages map drifted, which
     * reaches 50 screens" is a tautology dressed as a finding, and a report whose
     * first line restates its own input teaches people to skip the rest. What is
     * worth saying is what the drift reaches BEYOND itself.
     */
    const names = new Set(staleArtifacts.map((r) => r.artifact))

    /**
     * The pages map already cascades BY CONSTRUCTION — each route hashes its
     * whole source closure, so a changed component makes its routes stale
     * without any graph. Restating that as a finding would be a tautology.
     *
     * What the graph adds is CAUSATION: which routes went stale *because of*
     * which components. Two independent numbers become one sentence a reviewer
     * can act on.
     */
    const catalog = report.find((r) => r.artifact === "host-catalog" && r.state === "stale")
    const explained =
      catalog?.sourceFiles?.length && names.has("pages")
        ? impactOf(graph, catalog.sourceFiles).pages
        : []

    const out = {
      pages: names.has("pages") ? [] : hit.pages,
      docs: hit.docs,
      knowledge: hit.knowledge,
      explainedPages: explained,
      explainedBy: explained.length ? catalog.sourceFiles.length : 0,
    }
    const total =
      out.pages.length + out.docs.length + out.knowledge.length + out.explainedPages.length
    return total > 0 ? out : null
  } catch {
    // A clone with no edges cascades to nothing. Not an error.
    return null
  }
}

const downstream = cascade()

// ------------------------------------------------------------------- output

if (asJson) {
  console.log(
    JSON.stringify(
      { checkedAt: new Date().toISOString(), artifacts: report, downstream },
      null,
      2
    )
  )
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
  if (downstream) {
    console.log(`\n  What that drift reaches (one hop):`)
    if (downstream.explainedPages.length) {
      console.log(
        `    ${downstream.explainedPages.length} of the stale route(s) drifted because`
        + ` ${downstream.explainedBy} cataloged component(s) changed`
      )
    }
    if (downstream.pages.length) console.log(`    ${downstream.pages.length} screen(s)`)
    if (downstream.docs.length) console.log(`    ${downstream.docs.length} UX doc(s)`)
    if (downstream.knowledge.length) console.log(`    ${downstream.knowledge.length} spec(s)`)
    console.log(`    → npm run impact  lists them`)
  }
  console.log(
    "\n  'unanchored' and 'not built' are not failures: a fresh clone has generated"
    + "\n  nothing, and a host repo may not be checked out here.\n"
  )
}

const anyStale = report.some((r) => r.state === "stale")
/**
 * `--strict` fails only on staleness someone can actually act on — an artifact
 * whose recorded sources demonstrably moved. Advisory artifacts (see
 * `advisory` above) still print as STALE; they just don't decide the exit code.
 */
const blocking = report.filter((r) => r.state === "stale" && !r.advisory)
if (strict && anyStale && !blocking.length) {
  console.log(
    "  Stale, but advisory only — not failing the build. Regenerate when you can.\n"
  )
}
process.exit(strict && blocking.length ? 1 : 0)
