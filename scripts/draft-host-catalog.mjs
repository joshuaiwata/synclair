#!/usr/bin/env node
/**
 * DRAFT host-catalog entries — the deterministic half of cataloging a host app.
 *
 * Cataloging a host component is two jobs mixed together. One is mechanical:
 * where the file is, what it hashes to, what it exports, whether it wraps a
 * shadcn/Radix primitive or is hand-built, how many places render it. The other
 * is judgment: what the thing is FOR, when to reach for it, which tier it is.
 *
 * This script does the mechanical half and hands the rest to the
 * `component-cataloger` digger, so the digger spends its context writing prose
 * instead of re-deriving facts a regex can settle.
 *
 * IT DOES NOT WRITE THE CATALOG. That restraint is the whole design. A
 * mechanical walk yields CANDIDATES, and candidates are not components —
 * providers, page one-offs and icon wrappers all export PascalCase functions.
 * Auto-adding them is exactly how a hub ends up advertising 40 components when
 * the app renders 23, which is the fiction `check:coverage` exists to catch.
 * So this emits a draft for triage; a human or the digger decides what's real
 * and merges it.
 *
 *   node scripts/draft-host-catalog.mjs --host ../acme-app       # print drafts
 *   node scripts/draft-host-catalog.mjs --host ../acme-app --json # machine-readable
 *   node scripts/draft-host-catalog.mjs --out drafts.json         # write drafts elsewhere
 *
 * Hosts default to those declared in data/external-catalog.json.
 */

import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { exportsOf, norm, walkAll, walkComponents } from "./lib/host-walk.mjs"

const ROOT = process.cwd()
const CATALOG_PATH = path.join(ROOT, "data", "external-catalog.json")

const args = process.argv.slice(2)
const flagValue = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : (args[i + 1] ?? null)
}
const asJson = args.includes("--json")
const outPath = flagValue("--out")

// ------------------------------------------------------------------- hosts

function readCatalog() {
  if (!existsSync(CATALOG_PATH)) return { hosts: [], items: [] }
  try {
    const parsed = JSON.parse(readFileSync(CATALOG_PATH, "utf8"))
    return {
      hosts: Array.isArray(parsed.hosts) ? parsed.hosts : parsed.host ? [parsed.host] : [],
      items: Array.isArray(parsed.items) ? parsed.items : [],
    }
  } catch (e) {
    console.error(`data/external-catalog.json unreadable: ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  }
}

const catalog = readCatalog()
const hostFlag = flagValue("--host")
const hosts = hostFlag
  ? [{ name: path.basename(path.resolve(ROOT, hostFlag)), root: hostFlag }]
  : catalog.hosts

if (hosts.length === 0) {
  console.log(
    "Draft host catalog: no hosts declared and no --host given — nothing to draft.\n"
    + "  node scripts/draft-host-catalog.mjs --host ../your-app"
  )
  process.exit(0)
}

// ------------------------------------------------------- derivation helpers

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex")

/** PascalCase → kebab-case, the catalog's `name` convention. */
const kebab = (s) =>
  s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2").toLowerCase()

/**
 * Is this built ON the host's design-system primitives, or hand-built? Drives
 * the companion-mode gallery's shadcn-vs-custom split. Radix/cva imports or a
 * `ui/` location are the signal shadcn's own generator leaves behind.
 */
function deriveBasis(src, rel) {
  const radix = /@radix-ui\//.test(src)
  const cva = /class-variance-authority/.test(src)
  const inUiDir = rel.split(path.sep).includes("ui")
  if (radix || (cva && inUiDir)) return { basis: "shadcn", why: radix ? "imports @radix-ui" : "cva primitive in ui/" }
  return { basis: "custom", why: "no shadcn/Radix primitive detected" }
}

/**
 * Flag candidates that are probably NOT design-system components. Advisory
 * only — the point is to put the likely noise at the bottom of a triage list,
 * never to silently drop something the digger should have seen.
 */
function noiseSignal(name, src) {
  if (/(Provider|Context)$/.test(name)) return "name ends in Provider/Context — likely app plumbing"
  if (/^use[A-Z]/.test(name)) return "looks like a hook, not a component"
  if (/export\s+default\s+function\s+Page\b/.test(src)) return "a route entry, not a reusable piece"
  if (src.length < 200) return "very small — may be a re-export or stub"
  return null
}

/** Props an agent would otherwise read the file to find. */
function deriveProps(src, exportName) {
  const iface = new RegExp(`(?:interface|type)\\s+${exportName}Props[^{]*\\{([\\s\\S]*?)\\n\\}`, "m").exec(src)
  if (!iface) return []
  const props = []
  // One field per line: `name?: type` optionally preceded by a /** doc */.
  const lines = iface[1].split("\n")
  let pendingDoc = null
  for (const line of lines) {
    const doc = /\/\*\*\s*(.*?)\s*\*\//.exec(line)
    if (doc) {
      pendingDoc = doc[1]
      continue
    }
    const m = /^\s*([a-zA-Z_$][\w$]*)(\?)?\s*:\s*(.+?);?\s*$/.exec(line)
    if (m) {
      props.push({
        name: m[1],
        type: m[3].replace(/;$/, "").trim(),
        required: !m[2],
        ...(pendingDoc ? { description: pendingDoc } : {}),
      })
      pendingDoc = null
    }
  }
  return props
}

/** How many places actually render it — the anti-fiction signal. */
function countUsage(tag, corpus) {
  const re = new RegExp(`<${tag}[\\s/>]`, "g")
  let n = 0
  for (const src of corpus) n += (src.match(re) ?? []).length
  return n
}

// ------------------------------------------------------------------ drafting

const report = []

for (const host of hosts) {
  const hostAbs = path.resolve(ROOT, host.root)
  if (!existsSync(hostAbs)) {
    report.push({ host: host.name, error: `host root not found: ${host.root}` })
    continue
  }

  const documented = new Set(catalog.items.map((it) => norm(it.hostPath ?? "")))
  const corpus = walkAll(hostAbs)
    .map((rel) => {
      try {
        return readFileSync(path.join(hostAbs, rel), "utf8")
      } catch {
        return ""
      }
    })
    .filter(Boolean)

  const drafts = []
  for (const rel of walkComponents(hostAbs)) {
    if (documented.has(norm(rel))) continue // already cataloged — check:host owns its freshness
    const abs = path.join(hostAbs, rel)
    let raw
    try {
      raw = readFileSync(abs)
    } catch {
      continue
    }
    const src = raw.toString("utf8")
    const names = exportsOf(abs)
    if (names.length === 0) continue

    // The primary export is the one whose name matches the file, else the first.
    const base = path.basename(rel).replace(/\.(tsx|jsx)$/, "")
    const primary = names.find((n) => kebab(n) === base) ?? names[0]
    const { basis, why } = deriveBasis(src, rel)
    const noise = noiseSignal(primary, src)

    drafts.push({
      // ---- derived facts: correct by construction ----
      name: kebab(primary),
      hostPath: norm(rel),
      sourceHash: sha256(raw),
      catalogedAt: new Date().toISOString().slice(0, 10),
      basis,
      props: deriveProps(src, primary),
      usage: { renderedIn: countUsage(primary, corpus) },
      exports: names,
      surface: host.surface,

      // ---- for the digger to decide: NOT guessed here ----
      title: null,
      description: null,
      kind: null,
      categories: null,
      notes: null,

      // ---- triage hints ----
      _basisWhy: why,
      ..._noise(noise),
    })
  }

  // Likely-noise last, then least-used first: the triage order a human wants.
  drafts.sort((a, b) => {
    if (Boolean(a._likelyNoise) !== Boolean(b._likelyNoise)) return a._likelyNoise ? 1 : -1
    return (b.usage.renderedIn ?? 0) - (a.usage.renderedIn ?? 0)
  })

  report.push({
    host: host.name,
    root: host.root,
    candidates: drafts.length,
    alreadyCataloged: documented.size,
    drafts,
  })
}

function _noise(reason) {
  return reason ? { _likelyNoise: true, _noiseReason: reason } : {}
}

// ------------------------------------------------------------------- output

const payload = {
  draftedAt: new Date().toISOString(),
  generator: "draft:host-catalog",
  // Say plainly what this is, so nobody pastes it in wholesale.
  note:
    "DRAFT ONLY — derived facts, unmerged. Candidates are not components: triage before "
    + "adding. title/description/kind/categories are deliberately null for the "
    + "component-cataloger to write.",
  hosts: report,
}

if (outPath) {
  writeFileSync(path.resolve(ROOT, outPath), `${JSON.stringify(payload, null, 2)}\n`)
  console.log(`drafts written → ${outPath}`)
  process.exit(0)
}

if (asJson) {
  console.log(JSON.stringify(payload, null, 2))
  process.exit(0)
}

for (const h of report) {
  if (h.error) {
    console.log(`\n${h.host} — ${h.error}`)
    continue
  }
  console.log(`\n${h.host} — ${h.candidates} undocumented candidate(s), ${h.alreadyCataloged} already cataloged`)
  for (const d of h.drafts) {
    const flags = [
      d.basis,
      d.usage.renderedIn ? `rendered ${d.usage.renderedIn}×` : "never rendered",
      d.props.length ? `${d.props.length} props` : null,
    ].filter(Boolean)
    console.log(`  ${d._likelyNoise ? "?" : "·"} ${d.name.padEnd(22)} ${flags.join(" · ")}`)
    console.log(`      ${d.hostPath}`)
    if (d._likelyNoise) console.log(`      triage: ${d._noiseReason}`)
  }
}

console.log(
  `\nDRAFT ONLY — nothing written to data/external-catalog.json.`
  + `\nCandidates are not components: triage, then let the component-cataloger write`
  + `\ntitle / description / kind / categories for the ones that are real.`
)
