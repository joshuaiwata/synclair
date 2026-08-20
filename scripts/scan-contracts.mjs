#!/usr/bin/env node
/**
 * scan:contracts — derive the UI↔API seam into `.synclair/cache/contracts.json`.
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
 *   npm run scan:contracts -- --write write .synclair/cache/contracts.json
 *   npm run scan:contracts -- --json
 */

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"

// One owner per artifact (B3): the write validates in the TS artifact module;
// tsx's loader registers here so plain `node` keeps working everywhere.
import { register as registerTsx } from "tsx/esm/api"
registerTsx()

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

/**
 * ANCHOR the seam to the files that DECLARE the endpoints in it.
 *
 * Without one this map was not merely unchecked but uncheckable — nothing in the
 * toolchain could ever report it stale, so a contract map could describe a
 * long-since-refactored API and stay green forever.
 *
 * Provider sources, not every file scanned. The walk covers the whole repo, and
 * an anchor over all of it goes stale on any edit anywhere — a warning that
 * fires constantly teaches people to ignore it. The controllers and route
 * handlers are what the seam actually describes, so they are what should
 * invalidate it. Consumer call sites are deliberately excluded: a new caller
 * does not make the recorded providers wrong, only less complete, and that is
 * what the counts already say.
 */
/** The host repo's HEAD, when it is a git checkout. Label only. */
function hostCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: hostRoot })
      .toString()
      .trim()
  } catch {
    return null
  }
}

function sourceAnchor() {
  const sourceFiles = [...new Set(providers.map((p) => p.source).filter(Boolean))].sort()
  if (!sourceFiles.length) return {}
  const hash = createHash("sha256")
  let any = false
  for (const r of sourceFiles) {
    const abs = path.join(hostRoot, r)
    if (!existsSync(abs)) continue
    hash.update(r)
    hash.update("\n")
    hash.update(readFileSync(abs))
    hash.update("\0")
    any = true
  }
  return any ? { sourceFiles, sourceHash: hash.digest("hex") } : {}
}

const report = {
  generatedAt: new Date().toISOString(),
  generator: "scan:contracts",
  // "." when the scan covered the hub's own app: a null root made every
  // downstream resolver fall back to a legacy ".." and grade real files as
  // missing (found promoting the battery to the standalone mother repo).
  repo: { root: hostRoot === HUB_ROOT ? "." : path.relative(HUB_ROOT, hostRoot) },
  provenance: {
    generatedAt: new Date().toISOString(),
    generator: "scan:contracts",
    confidence: "medium",
    // Names the scan in the freshness report rather than "anchored at ?".
    ...(hostCommit() ? { commit: hostCommit() } : {}),
    ...sourceAnchor(),
  },
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
  const { writeContractsArtifact } = await import("../lib/artifacts/contracts.ts")
  writeContractsArtifact(report)
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
  write ? `\n  Written → .synclair/cache/contracts.json\n` : `\n  Report only. Add --write to persist.\n`
)
