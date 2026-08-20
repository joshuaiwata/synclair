#!/usr/bin/env node
/**
 * Recipe check — the ABSENCE sweep, and the third fiction direction the hub was
 * missing.
 *
 * The other two ask about entries. check:coverage asks whether the catalog
 * matches what exists; check:tiering asks whether it documents anything twice.
 * Both are answerable from the catalog alone, which is exactly why neither can
 * see the failure that costs a developer the most: a piece of UI the app builds
 * by hand in forty places because no component was ever made for it. The
 * catalog is perfectly accurate about that; it simply has nothing to say.
 *
 * That gap has a shape in the source. When a team needs a section eyebrow and
 * no `Eyebrow` exists, they don't stop — they type the classes, slightly
 * differently, once per screen. So the signal is CLUSTERS of near-identical
 * class lists spread across files:
 *
 *   · BYPASSED — a cataloged component's own class list is being retyped
 *     inline. The component exists and is being worked around, usually because
 *     it can't do one thing the site needs (a header band, a padding). The fix
 *     is to grow the component, and the count says how much it would earn.
 *   · MISSING — a shape repeated across files that no cataloged component
 *     owns. Nobody can reuse what was never named; every new screen types it
 *     again, and each copy drifts a little.
 *
 * Matching is fuzzy on purpose. Exact string equality finds almost nothing
 * here: the copies vary — that IS the symptom — so a sweep looking for
 * identical strings reports a clean bill of health on a codebase with forty
 * versions of one eyebrow. Clusters are formed on token overlap instead.
 *
 * ADVISORY: always exits 0. Every cluster is a candidate for a conversation,
 * not a defect — some repetition is honest, and deciding which is design work.
 *
 * Usage:
 *   npm run check:recipes
 *   npm run check:recipes -- --min-files 5      # stricter
 *   npm run check:recipes -- --json
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { MAX_FILE_BYTES, norm, walkAll } from "./lib/host-walk.mjs"

const root = process.cwd()
const args = process.argv.slice(2)
const asJson = args.includes("--json")
const minFiles = Number(args[args.indexOf("--min-files") + 1]) || 3
const MIN_OCCURRENCES = 4
/** Below this a class list is a one-off tweak, not a recipe worth naming. */
const MIN_TOKENS = 4
/** Two lists this similar are the same intent typed twice. */
const SIMILARITY = 0.7

/**
 * Tokens that describe a slot rather than a thing. A recipe's identity is its
 * surface treatment — radius, border, background, shadow, padding — and if
 * position and sizing count toward similarity, every flex row in the app
 * clusters with every other one.
 */
const POSITIONAL = /^(flex|grid|inline-flex|block|hidden|absolute|relative|fixed|sticky|w-|h-|min-|max-|mt-|mb-|ml-|mr-|mx-|my-|top-|left-|right-|bottom-|z-|col-|row-|order-|shrink|grow|basis-|justify-|items-|self-|content-|place-|gap-x|gap-y|overflow|truncate|whitespace|break-)/

const catalogPath = path.join(root, "data", "external-catalog.json")
if (!existsSync(catalogPath)) {
  console.log("check:recipes: no external catalog — nothing to check.")
  process.exit(0)
}
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"))

/** Every class list in a file: `className="…"`, and the string arms inside cn()/clsx(). */
function classLists(source) {
  const out = []
  const re = /className=\{?\s*["'`]([^"'`]{12,400})["'`]|["'`]([a-z][a-z0-9:/[\]._-]*(?:\s+[a-z][a-z0-9:/[\]._-]*){3,})["'`]/g
  let m
  while ((m = re.exec(source))) {
    const raw = (m[1] ?? m[2] ?? "").trim()
    if (raw.includes("${") || raw.includes("<")) continue
    out.push(raw)
  }
  return out
}

const signature = (raw) => {
  const tokens = raw
    .split(/\s+/)
    .filter((t) => t && !POSITIONAL.test(t))
    .map((t) => t.replace(/^(hover|focus|focus-visible|active|disabled|group-hover|dark|sm|md|lg|xl|2xl):/, ""))
  return [...new Set(tokens)].sort()
}

const jaccard = (a, b) => {
  const B = new Set(b)
  let inter = 0
  for (const t of a) if (B.has(t)) inter++
  return inter / (a.length + b.length - inter)
}

const report = []

for (const host of catalog.hosts ?? []) {
  const hostRoot = path.resolve(root, host.root)
  if (!existsSync(hostRoot)) continue
  const surface = host.surface ?? "web"

  // Every occurrence, with the file it came from — files are what make a
  // recipe a pattern rather than one component used in a loop.
  const occurrences = []
  for (const rel of walkAll(hostRoot)) {
    if (!/\.(tsx|jsx)$/.test(rel)) continue
    let source
    try {
      source = readFileSync(path.join(hostRoot, rel), "utf8")
    } catch {
      continue
    }
    if (source.length > MAX_FILE_BYTES) continue
    for (const raw of classLists(source)) {
      const sig = signature(raw)
      if (sig.length >= MIN_TOKENS) occurrences.push({ file: norm(rel), sig, raw })
    }
  }

  // Greedy clustering, seeded by the most common signatures so the biggest
  // recipe claims its copies before a near-neighbour does.
  const byKey = new Map()
  for (const o of occurrences) {
    const k = o.sig.join(" ")
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push(o)
  }
  const seeds = [...byKey.entries()].sort((a, b) => b[1].length - a[1].length)

  const clusters = []
  const claimed = new Set()
  for (const [key, seedGroup] of seeds) {
    if (claimed.has(key)) continue
    const sig = seedGroup[0].sig
    const members = []
    for (const [k, group] of byKey) {
      if (claimed.has(k)) continue
      if (k === key || jaccard(sig, group[0].sig) >= SIMILARITY) {
        claimed.add(k)
        members.push(...group)
      }
    }
    const files = new Set(members.map((m) => m.file))
    if (members.length >= MIN_OCCURRENCES && files.size >= minFiles) {
      clusters.push({ sig, count: members.length, files: [...files], sample: members[0].raw })
    }
  }

  /**
   * Does a cataloged component already OWN this shape?
   *
   * Only its ROOT class list counts, at a stricter threshold than clustering
   * uses. Anything looser attributes an eyebrow to whichever component happens
   * to contain one — naming a real component as "already existing" when the
   * shape is in fact unowned, which sends the reader to grow the wrong thing.
   * A wrong owner is worse than no owner: it converts a missing component into
   * a false reassurance.
   */
  const OWNER_SIMILARITY = 0.85
  const owners = new Map()
  for (const item of catalog.items ?? []) {
    if ((item.surface ?? surface) !== surface || !item.hostPath) continue
    let src
    try {
      src = readFileSync(path.join(hostRoot, item.hostPath), "utf8")
    } catch {
      continue
    }
    const first = classLists(src)[0]
    if (!first) continue
    const sig = signature(first)
    if (sig.length >= MIN_TOKENS) owners.set(item.name, sig)
  }

  for (const c of clusters) {
    c.owner = null
    for (const [name, sig] of owners) {
      if (jaccard(c.sig, sig) >= OWNER_SIMILARITY) {
        c.owner = name
        break
      }
    }
  }

  report.push({
    surface,
    host: host.name ?? host.root,
    bypassed: clusters.filter((c) => c.owner).sort((a, b) => b.count - a.count),
    missing: clusters.filter((c) => !c.owner).sort((a, b) => b.count - a.count),
  })
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

if (report.length === 0) {
  console.log("check:recipes: no host declared — nothing to scan.")
  process.exit(0)
}

for (const r of report) {
  const total = r.bypassed.length + r.missing.length
  console.log(`\ncheck:recipes — ${r.host}: ${total} repeated class recipe(s) across ${minFiles}+ files.`)

  if (r.bypassed.length > 0) {
    console.log(`\n  BYPASSED (${r.bypassed.length}) — a component owns this shape and is being retyped:`)
    for (const c of r.bypassed.slice(0, 6)) {
      console.log(`    · ${c.count}× in ${c.files.length} files — ${c.owner} exists`)
      console.log(`        ${c.sample.slice(0, 96)}`)
    }
  }

  if (r.missing.length > 0) {
    console.log(`\n  MISSING (${r.missing.length}) — repeated everywhere, owned by nothing:`)
    for (const c of r.missing.slice(0, 8)) {
      console.log(`    · ${c.count}× in ${c.files.length} files`)
      console.log(`        ${c.sample.slice(0, 96)}`)
      console.log(`        e.g. ${c.files.slice(0, 3).join(", ")}`)
    }
    if (r.missing.length > 8) console.log(`    … ${r.missing.length - 8} more`)
  }

  if (total > 0) {
    console.log(
      `\n  Advisory. A BYPASSED count is what growing that component would earn back;\n  a MISSING cluster is a component nobody has made yet. Both are design calls.`
    )
  }
}
