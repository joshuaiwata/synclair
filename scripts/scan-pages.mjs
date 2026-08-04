#!/usr/bin/env node
/**
 * ROUTE ENUMERATION — the deterministic half of the pages map.
 *
 * Generating the sitemap has always been one agent job: find every route, work
 * out what each composes, and describe it. Two of those three are FACTS a script
 * can derive, and deriving them is both cheaper and more reliable than asking an
 * agent to read a routing tree. This script does the first (which routes exist);
 * `resolve-page-items.mjs` already does the second (what each composes).
 *
 * That leaves the agent with the only part that needs judgment — what a screen
 * is FOR — which is the whole point of the split:
 *
 *   scan:pages     routes, files, kind, dynamic, preview URLs   ← deterministic
 *   resolve:pages  composed catalog items + source closure      ← deterministic
 *   check:pages    freshness anchors                            ← deterministic
 *   page-mapper    title + summary + auth notes                 ← judgment
 *
 * PROSE SURVIVES A RESCAN. Fields an agent wrote (`title`, `summary`, `auth`,
 * `surface`, `templateName`, `links`) are carried over per route; only facts are
 * refreshed. Re-running this must never destroy written work — otherwise nobody
 * will run it, and a map nobody refreshes is the problem we started with.
 *
 *   node scripts/scan-pages.mjs            scan + write data/pages-map.json
 *   node scripts/scan-pages.mjs --check    report drift, exit 1 (CI)
 *   node scripts/scan-pages.mjs --print    show what it found, write nothing
 *
 * Full deterministic pass: `npm run map:pages` (scan → resolve → reanchor).
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const MAP_PATH = path.join(ROOT, "data", "pages-map.json")

const args = process.argv.slice(2)
const check = args.includes("--check")
const printOnly = args.includes("--print")

// --------------------------------------------------------------- host guard

/**
 * A corrupt map must report itself, not throw a stack trace. It also must NOT
 * be treated as "no map" — that would silently discard every summary in it on
 * the next write.
 */
function readExisting() {
  if (!existsSync(MAP_PATH)) return {}
  try {
    return JSON.parse(readFileSync(MAP_PATH, "utf8"))
  } catch (e) {
    console.error(
      `data/pages-map.json is not valid JSON (${e instanceof Error ? e.message : e}).\n`
      + "  Refusing to scan — rewriting now would destroy whatever prose it still holds.\n"
      + "  Fix the file (or restore it from git) and re-run."
    )
    process.exit(1)
  }
}

const existing = readExisting()

/**
 * WHOSE routes are these, and can we read that router?
 *
 * The guard used to refuse every host outright. That was too blunt: it refuses
 * on TOPOLOGY when the real question is the ROUTER. A companion clone whose host
 * is a Next app-router project — which this scanner understands exactly — was
 * left with a map only an agent could refresh, so on a real clone 50 of 51
 * routes sat stale with nothing able to fix them.
 *
 * So: scan whatever we can actually read, wherever it lives, and refuse only a
 * router we don't understand (react-router, Expo, Next pages) — that genuinely
 * needs the `page-mapper` agent reading host source.
 */
const hostRoot = typeof existing?.repo?.root === "string" && existing.repo.root ? existing.repo.root : null
const REPO_DIR = hostRoot ? path.resolve(ROOT, hostRoot) : ROOT
const routerKind = existing?.routerKind ?? null

// `src/app` or `app` — both are conventional Next app-router layouts.
const APP_DIR = [path.join(REPO_DIR, "src", "app"), path.join(REPO_DIR, "app")].find((d) =>
  existsSync(d)
)

if (hostRoot && routerKind && routerKind !== "next-app") {
  console.log(
    `Pages scan: host router is "${routerKind}", which this scanner doesn't read — `
    + "it understands the Next app router only. Refresh with the `pages-map` skill "
    + "(the page-mapper reads the host's own router). Skipping (no changes)."
  )
  process.exit(0)
}

if (hostRoot && !APP_DIR) {
  console.log(
    `Pages scan: no app/ or src/app in the host (${hostRoot}) — nothing this scanner `
    + "can enumerate. Use the `pages-map` skill. Skipping (no changes)."
  )
  process.exit(0)
}

if (!APP_DIR) {
  console.error("Pages scan: no app/ or src/app directory — nothing to enumerate.")
  process.exit(1)
}

// ------------------------------------------------------------- enumeration

const PAGE_FILES = new Set(["page.tsx", "page.ts", "page.jsx", "page.js"])
const ROUTE_FILES = new Set(["route.ts", "route.js"])
/** Next conventions that never contribute a URL segment. */
const IGNORED_DIRS = new Set(["node_modules", "__tests__", "_components", "_lib"])

/**
 * Walk `app/` for route entry files. Route GROUPS — `(hub)` — are real
 * directories that contribute no URL segment, and private folders (`_foo`) are
 * excluded from routing entirely; both rules are Next's, and getting them wrong
 * silently produces routes that 404.
 */
function walk(dir, segments = [], out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith("_")) continue
      // "(group)" organises files without adding a URL segment.
      const isGroup = entry.name.startsWith("(") && entry.name.endsWith(")")
      // "@slot" is a parallel route — not a navigable URL of its own.
      if (entry.name.startsWith("@")) continue
      walk(full, isGroup ? segments : [...segments, entry.name], out)
    } else if (PAGE_FILES.has(entry.name) || ROUTE_FILES.has(entry.name)) {
      out.push({
        file: path.relative(REPO_DIR, full),
        segments,
        api: ROUTE_FILES.has(entry.name),
      })
    }
  }
  return out
}

const slugify = (route) =>
  route
    .replace(/^\/+|\/+$/g, "")
    .replace(/[[\]().]/g, "")
    .replace(/[^a-zA-Z0-9/_-]+/g, "-")
    .replace(/\//g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "home"

/**
 * A concrete path to frame — a preview of "/orders/[id]" can't load literally.
 *
 * `previewable` means SAME-ORIGIN: the hub can frame the route directly because
 * the hub serves it. That is only ever true when the map is of this app. For a
 * HOST repo the route belongs to another server, so it must stay false and
 * resolve through `liveBaseUrl` (`resolvePreviewSrc` in lib/system/dev-servers)
 * — otherwise the bare path is framed against the hub's own origin and every
 * preview 404s while the host dev server sits there running.
 */
function previewFor(route, dynamic, api, sameOrigin) {
  if (api) return { previewable: false }
  // A host route still records its path: that is what gets appended to the live
  // base URL, and what "open route" links to when the host is not running.
  if (!dynamic) return { previewUrl: route, previewable: sameOrigin }
  // Dynamic routes need a real example; the agent supplies one it knows exists.
  return { previewable: false }
}

const found = walk(APP_DIR)
  .map(({ file, segments, api }) => {
    const route = `/${segments.join("/")}`.replace(/\/+/g, "/")
    const dynamic = segments.some((s) => s.startsWith("["))
    return {
      id: slugify(route),
      route,
      file,
      kind: api ? "api" : dynamic ? "dynamic" : "page",
      ...(dynamic ? { dynamic: true } : {}),
      ...previewFor(route, dynamic, api, !hostRoot),
    }
  })
  .sort((a, b) => a.route.localeCompare(b.route))

// ------------------------------------------------------------------- merge

const prior = Array.isArray(existing.pages) ? existing.pages : []
const priorByRoute = new Map(prior.map((p) => [p.route, p]))

/**
 * Judgment fields, carried over verbatim. Everything NOT in this list is a fact
 * and gets recomputed — including `items` and `sourceFiles`, which the resolver
 * owns and refills on the next step.
 */
const PROSE_FIELDS = ["title", "summary", "auth", "surface", "templateName", "links", "previewUrl"]

const pages = found.map((node) => {
  const before = priorByRoute.get(node.route)
  if (!before) return { ...node, items: [] }
  const carried = {}
  for (const f of PROSE_FIELDS) {
    if (before[f] !== undefined) carried[f] = before[f]
  }
  return {
    ...node,
    ...carried,
    // Facts the resolver/anchor own — preserved so a scan alone doesn't blank
    // them, then refreshed by the next step in the pass.
    items: Array.isArray(before.items) ? before.items : [],
    ...(before.sourceFiles ? { sourceFiles: before.sourceFiles } : {}),
    ...(before.sourceHash ? { sourceHash: before.sourceHash } : {}),
  }
})

const foundRoutes = new Set(found.map((p) => p.route))
const added = found.filter((p) => !priorByRoute.has(p.route)).map((p) => p.route)
const removed = prior.filter((p) => !foundRoutes.has(p.route)).map((p) => p.route)
const undocumented = pages.filter((p) => !p.summary && p.kind !== "api").map((p) => p.route)

// ------------------------------------------------------------------ report

function commit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim()
  } catch {
    return undefined
  }
}

const summary = [
  `Pages scan: ${pages.length} route(s) from app/`,
  added.length ? `  + ${added.length} new: ${added.slice(0, 8).join(", ")}${added.length > 8 ? " …" : ""}` : null,
  removed.length ? `  − ${removed.length} gone: ${removed.slice(0, 8).join(", ")}${removed.length > 8 ? " …" : ""}` : null,
].filter(Boolean)

if (printOnly) {
  console.log(summary.join("\n"))
  for (const p of pages) {
    console.log(`  ${p.route.padEnd(42)} ${(p.kind ?? "page").padEnd(8)} ${p.file}`)
  }
  process.exit(0)
}

if (check) {
  /**
   * A BLANK seed is a valid state, not drift. The mother repo deliberately ships
   * `data/pages-map.json` empty, and a fresh clone has no map until someone runs
   * the pages-map skill. Reporting "26 routes missing" there would fail CI in
   * every unmapped clone forever — the same trap `check-pages.mjs` sidesteps by
   * treating a blank seed as "nothing to check".
   */
  if (!existing?.repo || prior.length === 0) {
    console.log(
      "Pages scan: blank seed (no map generated yet) — nothing to check. "
      + "Generate it with `npm run map:pages` plus the pages-map skill."
    )
    process.exit(0)
  }

  console.log(summary.join("\n"))
  if (added.length || removed.length) {
    console.error(
      `\nPages map is out of date with app/ — run \`npm run map:pages\` to refresh it.`
    )
    process.exit(1)
  }
  console.log("Pages map matches app/ — no route drift.")
  process.exit(0)
}

const next = {
  ...existing,
  repo: {
    name: existing.repo?.name ?? path.basename(ROOT),
    root: hostRoot,
    commit: commit(),
    digestedAt: new Date().toISOString(),
    ...(existing.repo?.previewBaseUrl ? { previewBaseUrl: existing.repo.previewBaseUrl } : {}),
  },
  routerKind: "next-app",
  pages,
  provenance: {
    generatedAt: new Date().toISOString(),
    commit: commit(),
    generator: "scan:pages",
    // Routes and composition are derived; the prose around them is not, so the
    // artifact as a whole is only as trustworthy as its written half.
    confidence: undocumented.length ? "medium" : "high",
  },
}

writeFileSync(MAP_PATH, `${JSON.stringify(next, null, 2)}\n`)

console.log(summary.join("\n"))
console.log(`  written → data/pages-map.json`)
if (undocumented.length) {
  console.log(
    `\n  ${undocumented.length} route(s) have no summary — facts are derived, but a sitemap`
    + `\n  without prose is an inventory, not a map. Run the \`pages-map\` skill to write them:`
  )
  for (const r of undocumented.slice(0, 10)) console.log(`    ${r}`)
  if (undocumented.length > 10) console.log(`    … and ${undocumented.length - 10} more`)
}
console.log(`\n  next: npm run resolve:pages && npm run check:pages -- --reanchor`)
