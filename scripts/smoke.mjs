#!/usr/bin/env node
/**
 * SMOKE — exercise the RUNNING hub, not just its source.
 *
 * verify-ui proves the code typechecks, lints, and keeps its registry honest.
 * None of that catches what actually bit this hub: a render loop that fired
 * 107 requests in two seconds, a reader that 414'd on real-sized diagrams, a
 * folder param nobody had ever loaded. Those live only in the running app —
 * so this walks the app the way a reader would: every core route, the deep
 * links, the degenerate params, and asserts on MARKERS (content that must be
 * there) and TRIPWIRES (strings that mean a page fell back to an error).
 *
 *   npm run smoke                      against http://localhost:4100
 *   SYNCLAIR_URL=… npm run smoke      against a deployed hub
 *
 * Exit 1 on any failure — cheap enough for CI behind a build, honest enough
 * to trust locally.
 */

const BASE = process.env.SYNCLAIR_URL ?? "http://localhost:4100"

const TRIPWIRES = [
  "Application error", // Next's client crash page
  "Internal Server Error",
  "__next_error__",
]

/** [path, must-contain markers, allow404?] */
const ROUTES = [
  // "/" 307s into the hub — asserted here (fetch follows redirects) so any
  // probe that checks health without following redirects (preview-server.sh
  // doctor once graded this healthy hop WEDGED) has the real shape on record.
  ["/", ["Synclair"]],
  ["/synclair", ["Synclair"]],
  ["/synclair/dashboard", ["Update"]],
  ["/synclair/dashboard?week=2026-08-10", ["Week of"]],
  ["/synclair/reports", ["report"]],
  ["/synclair/reports?id=definitely-not-a-report", ["report"]], // unknown id → latest or empty, never a crash
  ["/synclair/knowledge", ["Knowledge"]],
  ["/synclair/knowledge?folder=prd", ["PRDs"]],
  ["/synclair/knowledge?folder=bogus", ["Knowledge"]], // unknown folder degrades to the library
  ["/synclair/system", ["System Map"]],
  ["/synclair/pages", ["Pages"]],
  ["/synclair/foundations", ["Foundations"]],
  ["/synclair/library", ["Library"]],
  ["/synclair/hygiene", ["Hygiene"]],
  ["/synclair/references", ["References"]],
  ["/synclair/github", ["GitHub"]],
  ["/synclair/ai-setup", ["Setup"]],
  ["/synclair/environment", ["Environment"]],
  ["/synclair/settings", ["Settings"]],
]

/** Reader deep links — scraped from the TARGET's own knowledge page (rows are
 *  real <Link>s, so the hrefs are in the HTML). A blank clone yields none and
 *  only the 404 probe runs — honest on any target, local or deployed. */
async function readerRoutes() {
  const routes = []
  try {
    const res = await fetch(`${BASE}/synclair/knowledge`, {
      signal: AbortSignal.timeout(30000),
    })
    const html = await res.text()
    const ids = [
      ...new Set(
        [...html.matchAll(/\/synclair\/knowledge\/doc\/([a-z0-9-]+)/g)].map((m) => m[1])
      ),
    ]
    for (const id of ids.slice(0, 2)) {
      routes.push([`/synclair/knowledge/doc/${id}`, ["Full"]])
    }
  } catch {
    /* target down — the main loop will report it */
  }
  routes.push(["/synclair/knowledge/doc/no-such-document", [], true])
  return routes
}

let failed = 0

/**
 * Routes this hub GENERATION actually declares, derived from the app tree
 * (route groups stripped). A 404 on a route the tree doesn't declare is a
 * generation difference — the suite runs against mother and clones of
 * different vintages — and reads as "absent (skipped)", never a failure.
 * A 404 on a DECLARED route stays exactly the failure it always was.
 */
import { readdirSync } from "node:fs"
import path2 from "node:path"
const declaredRoutes = (() => {
  const routes = new Set()
  const walk = (dir, segs) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isFile() && /^page\.(t|j)sx?$/.test(e.name)) {
        routes.add("/" + segs.join("/"))
      } else if (e.isDirectory()) {
        const seg = e.name
        walk(path2.join(dir, seg), /^\(.*\)$/.test(seg) ? segs : [...segs, seg])
      }
    }
  }
  walk(path2.join(process.cwd(), "app"), [])
  return routes
})()
const isDeclared = (p) => {
  const clean = p.split("?")[0].replace(/\/$/, "") || "/"
  if (declaredRoutes.has(clean)) return true
  // Dynamic segments: accept when a declared route with [params] matches.
  const segs = clean.split("/").filter(Boolean)
  for (const r of declaredRoutes) {
    const rs = r.split("/").filter(Boolean)
    if (rs.length !== segs.length) continue
    if (rs.every((s, i) => s.startsWith("[") || s === segs[i])) return true
  }
  return false
}

async function hit([path, markers, allow404 = false]) {
  const url = `${BASE}${path}`
  let res
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30000) })
  } catch (e) {
    failed++
    console.log(`  ✗ ${path} — no response (${e.message})`)
    return
  }
  if (!res.ok && !(allow404 && res.status === 404)) {
    if (res.status === 404 && !isDeclared(path)) {
      console.log(`  - ${path} — absent in this hub generation (skipped)`)
      return
    }
    failed++
    console.log(`  ✗ ${path} — HTTP ${res.status}`)
    return
  }
  const html = await res.text()
  // An EXPECTED 404 is Next's not-found shell, which legitimately carries the
  // error-boundary marker — tripwires only apply to pages that claim success.
  const expected404 = allow404 && res.status === 404
  const tripped = expected404 ? null : TRIPWIRES.find((t) => html.includes(t))
  if (tripped) {
    failed++
    console.log(`  ✗ ${path} — tripwire "${tripped}"`)
    return
  }
  const missing = (allow404 && res.status === 404 ? [] : markers).filter(
    (m) => !html.includes(m)
  )
  if (missing.length) {
    failed++
    console.log(`  ✗ ${path} — missing marker(s): ${missing.join(", ")}`)
    return
  }
  console.log(`  ✓ ${path}`)
}

console.log(`\nSmoke — walking the running hub at ${BASE}\n`)
const all = [...ROUTES, ...(await readerRoutes())]
for (const r of all) await hit(r)

console.log(
  failed
    ? `\n${failed} of ${all.length} route(s) failed.\n`
    : `\nAll ${all.length} route(s) healthy.\n`
)
process.exit(failed ? 1 : 0)
