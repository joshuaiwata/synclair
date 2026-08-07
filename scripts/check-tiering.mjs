#!/usr/bin/env node
/**
 * Tiering check — the anti-REDUNDANCY sweep for the external catalog, and the
 * third fiction direction after check:coverage's two.
 *
 * check:coverage asks whether the catalog matches what EXISTS. This asks
 * whether it documents the same UI more than once. A gallery can be perfectly
 * accurate — every entry real, every entry rendering — and still be unusable,
 * because a screen, the section inside it, and the section inside THAT are all
 * cataloged as peers. The reader sees what looks like three similar blocks and
 * concludes the app has three; it has one, photographed at three zoom levels.
 *
 * The signal is CONTAINMENT. For every cataloged block/template, resolve which
 * other cataloged entries it imports, and who imports it:
 *
 *   1. WRAPPER — an entry whose render is dominated by ONE cataloged child
 *      (small file, single cataloged import). It documents its child, not
 *      itself: the two gallery cards show the same picture. Catalog the child.
 *   2. FOLDED — an entry reachable through exactly ONE cataloged parent and
 *      nothing else. It is a part of that parent, not a peer of it. Real
 *      library blocks earn the tier by being composed in more than one place.
 *   3. CHAIN — three or more entries nested in a line. Every level after the
 *      first is redundant shelf space; the chain is printed whole so the
 *      judgment call ("which link is the reusable one?") is made with the
 *      shape visible rather than one pair at a time.
 *
 * ADVISORY: always exits 0. Tiering is a judgment call about what a library is
 * FOR, and this script has no opinion about which link in a chain deserves the
 * tier — only that documenting every link is how a 20-block library reads as
 * 108. Nothing here rewrites the catalog. Pass --json to feed a re-tier.
 *
 * Usage:
 *   npm run check:tiering
 *   npm run check:tiering -- --surface web
 *   npm run check:tiering -- --json
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { MAX_FILE_BYTES, norm, walkAll } from "./lib/host-walk.mjs"

const root = process.cwd()
const args = process.argv.slice(2)
const asJson = args.includes("--json")
const surfaceArg = args[args.indexOf("--surface") + 1]
const onlySurface = args.includes("--surface") ? surfaceArg : null

/** A wrapper's own contribution is chrome; past this it's doing real work. */
const WRAPPER_MAX_BYTES = 6 * 1024

const catalogPath = path.join(root, "data", "external-catalog.json")
if (!existsSync(catalogPath)) {
  console.log("check:tiering: no external catalog — nothing to check.")
  process.exit(0)
}
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"))
const hosts = catalog.hosts ?? []

/**
 * Resolve every import specifier in a file to the FILE it names.
 *
 * Matching imported identifiers against catalog names looks equivalent and is
 * not: an entry is a file, and a file's exports are frequently named something
 * else. A module cataloged as `PaymentSheet` may be imported everywhere as
 * `usePaymentSheet` and `PaymentOffer` — by identifier it reads as imported by
 * nobody, which is the direction that makes a shared module look like a
 * one-parent region and get folded. Six entries were wrongly folded this way
 * before this resolved by path instead.
 */
function importSpecifiers(source) {
  const out = []
  const re = /from\s+['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(source))) out.push(m[1])
  return out
}

/** Specifier → repo-relative file, honouring relative paths and `@/*`-style roots. */
function resolveSpecifier(fromRel, spec, sources, aliases) {
  let base
  if (spec.startsWith(".")) base = norm(path.join(path.dirname(fromRel), spec))
  else {
    const alias = aliases.find((a) => spec === a.prefix || spec.startsWith(a.prefix + "/"))
    if (!alias) return null
    base = norm(path.join(alias.target, spec.slice(alias.prefix.length).replace(/^\//, "")))
  }
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (sources.has(base + ext)) return base + ext
  }
  return sources.has(base) ? base : null
}

/**
 * `@/…`-style roots read from the host's own tsconfig `paths`, so this follows
 * the host's aliasing rather than assuming one convention.
 */
function aliasesFor(hostRoot) {
  const out = []
  try {
    const raw = readFileSync(path.join(hostRoot, "tsconfig.json"), "utf8").replace(/\/\/.*$/gm, "")
    const paths = JSON.parse(raw).compilerOptions?.paths ?? {}
    for (const [k, v] of Object.entries(paths)) {
      const target = (Array.isArray(v) ? v[0] : v) ?? ""
      out.push({ prefix: k.replace(/\/\*$/, ""), target: norm(target.replace(/\/\*$/, "").replace(/^\.\//, "")) })
    }
  } catch {
    /* no tsconfig, or unparseable — relative imports still resolve */
  }
  return out
}

/** Route files are the framework's entry points, not composition by a peer. */
const isRoute = (rel) => /(^|\/)(app|pages)\//.test(rel)

const report = []

for (const host of hosts) {
  const surface = host.surface ?? "web"
  if (onlySurface && surface !== onlySurface) continue
  const hostRoot = path.resolve(root, host.root)
  if (!existsSync(hostRoot)) continue

  const entries = catalog.items.filter(
    (i) => (i.surface ?? hosts[0]?.surface) === surface && (i.kind === "block" || i.kind === "template")
  )
  if (entries.length === 0) continue
  const byName = new Map(entries.map((i) => [i.name, i]))

  // Read every host file ONCE: the containment graph needs both directions,
  // and importers must be counted across the whole app, not just the catalog.
  // walkAll yields paths RELATIVE to the host root, which is also how the
  // catalog stores `hostPath` — so they compare directly, and only the read
  // needs the root joined back on.
  const sources = new Map()
  for (const rel of walkAll(hostRoot)) {
    if (!/\.tsx?$/.test(rel)) continue
    try {
      const s = readFileSync(path.join(hostRoot, rel), "utf8")
      if (s.length <= MAX_FILE_BYTES) sources.set(norm(rel), s)
    } catch {
      /* unreadable file — the walk already tolerates these */
    }
  }

  const aliases = aliasesFor(hostRoot)
  const entryByPath = new Map(entries.map((i) => [norm(i.hostPath ?? ""), i.name]))

  const children = new Map() // entry -> cataloged entries it renders
  const importers = new Map() // entry -> FILES importing it (routes included)
  for (const [rel, source] of sources) {
    const targets = importSpecifiers(source)
      .map((spec) => resolveSpecifier(rel, spec, sources, aliases))
      .filter((t) => t && t !== rel)
    const self = entryByPath.get(rel)
    if (self) {
      children.set(self, new Set(targets.map((t) => entryByPath.get(t)).filter((n) => n && n !== self)))
    }
    for (const t of targets) {
      const n = entryByPath.get(t)
      if (!n) continue
      if (!importers.has(n)) importers.set(n, new Set())
      importers.get(n).add(rel)
    }
  }

  /** Composition by a PEER — the signal for "is this reused?" Routes don't count. */
  const nonRouteImporters = (name) =>
    [...(importers.get(name) ?? [])].filter((rel) => !isRoute(rel))

  const sizeOf = (name) => (sources.get(norm(byName.get(name).hostPath ?? "")) ?? "").length

  const wrappers = []
  const folded = []
  for (const entry of entries) {
    const kids = children.get(entry.name) ?? new Set()
    const peers = nonRouteImporters(entry.name)
    const parents = peers.map((rel) => entryByPath.get(rel)).filter(Boolean)

    // REUSE OUTRANKS SHAPE. A wrapper composed in several places is something a
    // developer imports by name — thin or not, it earns its entry. Only a
    // wrapper nothing else reuses is purely the child wearing a second card.
    if (peers.length >= 2) continue

    if (kids.size === 1 && sizeOf(entry.name) <= WRAPPER_MAX_BYTES) {
      wrappers.push({ entry: entry.name, kind: entry.kind, wraps: [...kids][0], bytes: sizeOf(entry.name) })
    } else if (parents.length === 1 && peers.length === 1) {
      folded.push({ entry: entry.name, kind: entry.kind, parent: parents[0] })
    }
  }

  // Longest nesting line through each entry — printed whole, deepest first.
  const chains = new Set()
  const walk = (name, seen) => {
    const kids = [...(children.get(name) ?? [])].filter((k) => !seen.includes(k))
    if (kids.length === 0) return [[name]]
    return kids.flatMap((k) => walk(k, [...seen, name]).map((tail) => [name, ...tail]))
  }
  for (const entry of entries) {
    for (const c of walk(entry.name, [])) if (c.length >= 3) chains.add(c.join(" → "))
  }
  const deepest = [...chains].sort((a, b) => b.split(" → ").length - a.split(" → ").length).slice(0, 8)

  report.push({ surface, total: entries.length, wrappers, folded, chains: deepest })
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

if (report.length === 0) {
  console.log("check:tiering: no block/template entries to check.")
  process.exit(0)
}

for (const r of report) {
  const redundant = new Set([...r.wrappers.map((w) => w.entry), ...r.folded.map((f) => f.entry)])
  console.log(
    `\ncheck:tiering — ${r.surface}: ${r.total} blocks/templates, ${redundant.size} documenting UI another entry already covers.`
  )

  if (r.wrappers.length > 0) {
    console.log(`\n  WRAPPERS (${r.wrappers.length}) — the card shows its child, not itself:`)
    for (const w of r.wrappers.slice(0, 12))
      console.log(`    · ${w.entry} (${w.kind}, ${Math.round(w.bytes / 100) / 10}kb) wraps ${w.wraps}`)
    if (r.wrappers.length > 12) console.log(`    … ${r.wrappers.length - 12} more`)
  }

  if (r.folded.length > 0) {
    console.log(`\n  PARTS (${r.folded.length}) — reached through one parent, composed nowhere else:`)
    for (const f of r.folded.slice(0, 12)) console.log(`    · ${f.entry} (${f.kind}) — only inside ${f.parent}`)
    if (r.folded.length > 12) console.log(`    … ${r.folded.length - 12} more`)
  }

  if (r.chains.length > 0) {
    console.log(`\n  CHAINS — one piece of UI, cataloged at every level:`)
    for (const c of r.chains) console.log(`    · ${c}`)
  }

  console.log(
    `\n  Advisory. Decide which link in each chain is the reusable one; the rest belong to\n  the page that composes them (/synclair/pages already records that). \`--json\` feeds a re-tier.`
  )
}
