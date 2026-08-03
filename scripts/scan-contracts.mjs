#!/usr/bin/env node
/**
 * scan:contracts — derive the UI↔API seam into `data/contracts.json`.
 *
 * Unlike the prose halves of the System Map, this is DERIVED end to end: no
 * model, no network, re-runnable on a hook. That is the point — the authored
 * `api[]` list is a snapshot of someone's reading and rots invisibly, while this
 * cannot claim an endpoint that isn't in the source.
 *
 * Scope comes from what the clone already declares: host roots in
 * `data/external-catalog.json`, plus any workspace app directory. Nothing is
 * configured twice.
 *
 *   npm run scan:contracts            report
 *   npm run scan:contracts -- --write write data/contracts.json
 *   npm run scan:contracts -- --json
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  appOf,
  extractConsumers,
  extractProviders,
  matchContracts,
  orphanConfidence,
} from "./lib/contracts.mjs"
import { emitJson } from "./lib/emit.mjs"
import { resolveTarget } from "./lib/topology.mjs"

const HUB_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT = path.join(HUB_ROOT, "data", "contracts.json")

const args = process.argv.slice(2)
const asJson = args.includes("--json")
const write = args.includes("--write")

const hostRoot = resolveTarget(HUB_ROOT).hostRoot ?? HUB_ROOT

/**
 * Where to look. Workspace directories are the unit: one app is one service
 * boundary, which is also how the catalog and the surfaces seed already carve
 * this repo up.
 */
function scanRoots() {
  const roots = new Set()
  for (const dir of ["apps", "packages", "services"]) {
    const abs = path.join(hostRoot, dir)
    if (!existsSync(abs)) continue
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (e.isDirectory() && !e.name.startsWith(".")) roots.add(`${dir}/${e.name}`)
    }
  }
  // Single-app repo: scan its source root rather than reporting nothing.
  if (roots.size === 0) {
    for (const dir of ["src", "app", "server"]) {
      if (existsSync(path.join(hostRoot, dir))) roots.add(dir)
    }
  }
  return [...roots].sort()
}

const roots = scanRoots()
const providers = []
const consumers = []
let opaque = 0

for (const r of roots) {
  providers.push(...extractProviders(hostRoot, r))
  const c = extractConsumers(hostRoot, r)
  consumers.push(...c.consumers)
  opaque += c.opaque
}

const { links, unmatched, orphans } = matchContracts(providers, consumers)

const byReason = {}
for (const u of unmatched) byReason[u.reason] = (byReason[u.reason] ?? 0) + 1

const confidence = orphanConfidence({
  resolved: consumers.length,
  opaque,
  providers: providers.length,
  orphans: orphans.length,
})

const report = {
  generatedAt: new Date().toISOString(),
  generator: "scan:contracts",
  repo: { root: hostRoot === HUB_ROOT ? null : path.relative(HUB_ROOT, hostRoot) },
  scanned: roots,
  providers,
  links,
  diagnostics: {
    /**
     * Counted, never hidden. A call whose URL is built by a helper cannot be
     * resolved without executing the code, and reporting "42 consumers" while
     * silently dropping 30 more would make an incomplete seam look complete.
     */
    opaqueCalls: opaque,
    unmatched,
    unmatchedByReason: byReason,
    /**
     * Only asserted when consumer coverage is good enough to mean it. When the
     * gate closes this is null and `orphanConfidence` explains why — "we
     * couldn't tell" must never be rendered as "nothing uses these".
     */
    orphanProviders: confidence.trustworthy ? orphans : null,
    orphanConfidence: confidence,
  },
}

if (write) {
  mkdirSync(path.dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n")
}

if (asJson) {
  // Flush before exiting: this payload is far larger than a pipe buffer.
  emitJson(report)
}

if (roots.length === 0) {
  console.log("scan:contracts — no app/source directories found. Nothing to scan.")
  process.exit(0)
}

console.log(`\nscan:contracts — ${roots.length} root(s)\n`)
console.log(`  ${providers.length} endpoint(s) provided · ${consumers.length} call(s) found · ${links.length} linked`)

const byApp = {}
for (const l of links) {
  const k = l.scope === "cross-app" ? `${l.consumerApp} → ${l.providerApp}` : `${l.consumerApp} → its own API`
  byApp[k] = (byApp[k] ?? 0) + 1
}
if (Object.keys(byApp).length) {
  console.log(`\n  Seams:`)
  for (const [k, n] of Object.entries(byApp).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(38)} ${n} call(s)`)
  }
}

if (!confidence.trustworthy) {
  console.log(`\n  Unused-endpoint check SKIPPED — ${confidence.why}.`)
  console.log(`  Reporting ${orphans.length} endpoint(s) as unused here would invite someone to`)
  console.log(`  delete a live one. Unknown outranks proven-zero.`)
} else if (orphans.length) {
  /**
   * "No caller found", never "unused". A static scan cannot prove absence — it
   * can only report what it saw — and the difference between those two
   * sentences is whether someone deletes a live endpoint on our say-so.
   */
  console.log(`\n  ${orphans.length} endpoint(s) with no caller found — CANDIDATES, verify before acting:`)
  for (const o of orphans.slice(0, 8)) console.log(`    · ${o.method} ${o.path}  (${appOf(o.source)})`)
  if (orphans.length > 8) console.log(`    · +${orphans.length - 8} more`)
  console.log(`    (a call made through a dynamic URL or an unrecognised helper looks like this too)`)
}

if (Object.keys(byReason).length) {
  console.log(`\n  Unmatched calls, by reason:`)
  for (const [r, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${r.padEnd(18)} ${n}`)
  }
}
if (opaque) {
  console.log(`\n  ${opaque} call(s) had a URL this scanner can't resolve without running the code.`)
  console.log(`  They are excluded, not assumed absent — the seam is a floor, not a census.`)
}

console.log(
  write ? `\n  Written → data/contracts.json\n` : `\n  Report only. Add --write to persist.\n`
)
