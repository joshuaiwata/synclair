#!/usr/bin/env node
/**
 * SYSTEM INVENTORY — the derivable half of the System Map.
 *
 * Be clear about how much of this job a script can honestly do. Looking at a
 * real System Map, the value is in sentences like *"Owns the ABAC permission
 * model and the Stytch B2B session/webhook handling"* — architecture, judgment,
 * the reason anyone reads the page. No scanner writes that.
 *
 * What a scanner CAN do is make sure nothing is missed and nothing goes quietly
 * out of date:
 *
 *   ENUMERATE   every workspace, endpoint, model and integration that exists
 *   DRIFT       what exists in the code but isn't in the map (--check)
 *   SKELETON    ready-to-fill entries so the agent writes prose, not inventory
 *
 * So this is deliberately scoped as an inventory + drift detector, NOT a
 * generator. `summary` and `details` stay empty for the `system-mapper` to write,
 * and existing prose is carried over untouched. The honest split is roughly:
 * names/paths/methods/types derived, everything worth reading still authored.
 *
 *   node scripts/scan-system.mjs --host ..      inventory a repo
 *   node scripts/scan-system.mjs --check        what's missing from the map
 *   node scripts/scan-system.mjs --write        merge into data/system-map.json
 */

import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"

import { emitJson } from "./lib/emit.mjs"

const ROOT = process.cwd()
const MAP_PATH = path.join(ROOT, "data", "system-map.json")

const args = process.argv.slice(2)
const flag = (n) => {
  const i = args.indexOf(n)
  return i === -1 ? null : (args[i + 1] ?? null)
}
const check = args.includes("--check")
const write = args.includes("--write")
const asJson = args.includes("--json")

/** Corrupt input reports itself rather than throwing a stack trace at the user. */
function readExisting() {
  if (!existsSync(MAP_PATH)) return {}
  try {
    return JSON.parse(readFileSync(MAP_PATH, "utf8"))
  } catch (e) {
    console.error(
      `data/system-map.json is not valid JSON (${e instanceof Error ? e.message : e}).\n`
      + "  Fix the file (or restore it from git) and re-run."
    )
    process.exit(1)
  }
}

const existing = readExisting()
const target = flag("--host") ?? existing?.repo?.root ?? null
const REPO = target ? path.resolve(ROOT, target) : ROOT

if (!existsSync(REPO)) {
  console.error(`Target repo not found: ${REPO}`)
  process.exit(1)
}

const SKIP = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", "coverage", ".turbo",
  ".vercel", "public", "__tests__", "e2e", ".storybook", "synclair",
])

function walk(dir, out = [], depth = 0) {
  if (depth > 8) return out
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || SKIP.has(e.name)) continue
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) walk(abs, out, depth + 1)
    else if (e.isFile()) out.push(abs)
  }
  return out
}

const rel = (abs) => path.relative(REPO, abs).split(path.sep).join("/")
const files = walk(REPO)

/**
 * The schema files the data model is derived from, as repo-relative paths —
 * the same base `repo.root` uses, so check:freshness resolves them the way it
 * resolves every other map's anchor.
 */
const schemaFiles = () => files.filter((f) => f.endsWith("schema.prisma")).map(rel).sort()

/**
 * A source anchor for the provenance block: the files, plus one hash over their
 * contents. Mirrors `hashSources` in lib/system/provenance.ts — the name and
 * bytes of each file in order — because that is what reads it back.
 *
 * Returns nothing when there is nothing to hash, so a project without schema
 * files records no anchor rather than a hash of emptiness that would read as
 * fresh forever.
 */
function anchorOf(sourceFiles) {
  if (!sourceFiles.length) return {}
  const hash = createHash("sha256")
  let any = false
  for (const r of sourceFiles) {
    const abs = path.join(REPO, r)
    if (!existsSync(abs)) continue
    hash.update(r)
    hash.update("\n")
    hash.update(readFileSync(abs))
    hash.update("\0")
    any = true
  }
  return any ? { sourceFiles, sourceHash: hash.digest("hex") } : {}
}

// -------------------------------------------------------------------- areas

/**
 * A monorepo states its areas structurally (`apps/*`, `packages/*`); a single
 * app doesn't, so we fall back to top-level source directories. Either way this
 * only yields the NAME and PATH — what the area is *for* is the agent's line.
 */
function deriveAreas() {
  const out = []
  for (const group of ["apps", "packages", "services"]) {
    const dir = path.join(REPO, group)
    if (!existsSync(dir)) continue
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue
      const p = `${group}/${e.name}`
      out.push({ name: e.name, path: p, files: files.filter((f) => rel(f).startsWith(`${p}/`)).length })
    }
  }
  if (out.length) return out
  // Single app: top-level dirs under src/ (or the repo root).
  const base = existsSync(path.join(REPO, "src")) ? path.join(REPO, "src") : REPO
  for (const e of readdirSync(base, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith(".") || SKIP.has(e.name)) continue
    const p = rel(path.join(base, e.name))
    out.push({ name: e.name, path: p, files: files.filter((f) => rel(f).startsWith(`${p}/`)).length })
  }
  return out
}

// ---------------------------------------------------------------------- api

const HTTP = ["Get", "Post", "Put", "Patch", "Delete", "Options", "Head"]

/**
 * Two conventions cover most of what we meet: NestJS decorators and the Next
 * app router's `route.ts`. Anything else is reported as unknown rather than
 * guessed at — a wrong endpoint list is worse than an admittedly partial one.
 */
function deriveApi() {
  const out = []
  for (const abs of files) {
    const r = rel(abs)
    let src
    try {
      if (statSync(abs).size > 300 * 1024) continue
      src = readFileSync(abs, "utf8")
    } catch {
      continue
    }

    // NestJS: @Controller('base') then @Get('sub') on each handler.
    if (r.endsWith(".controller.ts")) {
      const base = /@Controller\(\s*['"`]([^'"`]*)['"`]/.exec(src)?.[1] ?? ""
      for (const verb of HTTP) {
        const re = new RegExp(`@${verb}\\(\\s*(?:['"\`]([^'"\`]*)['"\`])?\\s*\\)`, "g")
        let m
        while ((m = re.exec(src)) !== null) {
          const sub = m[1] ?? ""
          const full = `/${[base, sub].filter(Boolean).join("/")}`.replace(/\/+/g, "/")
          out.push({ method: verb.toUpperCase(), path: full, source: r })
        }
      }
      continue
    }

    // Next app router: exported HTTP verbs in a route.ts.
    if (/(^|\/)route\.(ts|js)$/.test(r)) {
      const routePath = `/${r.replace(/^(src\/)?app\//, "").replace(/\/route\.(ts|js)$/, "")}`
        .replace(/\/\([^)]*\)/g, "")
        .replace(/\/+/g, "/")
      for (const verb of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
        if (new RegExp(`export\\s+(?:async\\s+)?function\\s+${verb}\\b`).test(src)) {
          out.push({ method: verb, path: routePath, source: r })
        }
      }
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
}

// --------------------------------------------------------------------- data

/**
 * Prisma models: name + field names/types + the schema NAMESPACE it declares.
 * Meaning is the agent's job; all of this is mechanical.
 *
 * The namespace matters more than it looks. One database is routinely carved
 * into namespaces that are the real subsystems — a `messaging` or a `billing`
 * holding twenty tables that only relate to each other. Recording only the file
 * a model came from flattens all of them into "this service", so the biggest
 * database reads as one undifferentiated mass instead of the handful of
 * subsystems it actually is. It is one declaration per model, already sitting in
 * the schema, and nothing downstream could recover it afterwards.
 */
function deriveData() {
  const out = []
  for (const abs of files.filter((f) => f.endsWith("schema.prisma"))) {
    let src
    try {
      src = readFileSync(abs, "utf8")
    } catch {
      continue
    }
    const re = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g
    let m
    while ((m = re.exec(src)) !== null) {
      const fields = []
      let namespace
      for (const line of m[2].split("\n")) {
        const ns = /^\s*@@schema\(\s*["'](\w+)["']\s*\)/.exec(line)
        if (ns) {
          namespace = ns[1]
          continue
        }
        const f = /^\s*(\w+)\s+(\S+)/.exec(line)
        if (f && !line.trim().startsWith("@@")) fields.push({ name: f[1], type: f[2] })
      }
      out.push({
        name: m[1],
        kind: "table",
        fields,
        source: rel(abs),
        // Absent on a single-schema database, which is the common case — the
        // field stays optional rather than inventing a "public" for everyone.
        ...(namespace ? { namespace } : {}),
      })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

// ------------------------------------------------------------- integrations

/** Third-party services the code actually depends on, by package name. */
const KNOWN = {
  stytch: "auth", "@stytch": "auth", "next-auth": "auth", "@clerk": "auth",
  stripe: "payments", "@stripe": "payments",
  twilio: "messaging", "@sendgrid": "email", resend: "email", nodemailer: "email",
  "@aws-sdk": "cloud", "@google-cloud": "cloud", "@supabase": "database",
  prisma: "database", "@prisma": "database", drizzle: "database", mongoose: "database",
  redis: "cache", ioredis: "cache", bullmq: "queue", bull: "queue",
  "@sentry": "observability", posthog: "analytics", segment: "analytics",
}

function deriveIntegrations() {
  const found = new Map()
  for (const abs of files.filter((f) => path.basename(f) === "package.json")) {
    if (rel(abs).includes("node_modules")) continue
    let pkg
    try {
      pkg = JSON.parse(readFileSync(abs, "utf8"))
    } catch {
      continue
    }
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      for (const [needle, kind] of Object.entries(KNOWN)) {
        if (dep === needle || dep.startsWith(`${needle}/`) || dep.startsWith(needle)) {
          const name = needle.replace(/^@/, "")
          if (!found.has(name)) found.set(name, { name, kind, package: dep })
        }
      }
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// ------------------------------------------------------------------- result

const derived = {
  areas: deriveAreas(),
  api: deriveApi(),
  data: deriveData(),
  integrations: deriveIntegrations(),
}

/** What the code has that the map doesn't mention — the drift signal. */
function drift() {
  const known = {
    areas: new Set((existing.areas ?? []).map((a) => a.path ?? a.name)),
    api: new Set((existing.api ?? []).map((e) => `${e.method} ${e.path}`)),
    data: new Set((existing.data ?? []).map((d) => d.name)),
    integrations: new Set((existing.integrations ?? []).map((i) => i.name.toLowerCase())),
  }
  return {
    areas: derived.areas.filter((a) => !known.areas.has(a.path) && !known.areas.has(a.name)),
    api: derived.api.filter((e) => !known.api.has(`${e.method} ${e.path}`)),
    data: derived.data.filter((d) => !known.data.has(d.name)),
    integrations: derived.integrations.filter((i) => !known.integrations.has(i.name.toLowerCase())),
  }
}

/**
 * The OTHER direction: what the map still describes that the code no longer has.
 *
 * Drift was only ever reported one way — code-not-in-map — so a table, endpoint
 * or integration deleted from the codebase stayed in the map indefinitely and
 * every check stayed green. That is worse than a missing entry: a gap is visibly
 * a gap, while a confident description of something that does not exist reads as
 * fact. Found in a real clone, where the map documented two tables that had been
 * removed months earlier.
 *
 * Names carrying a disambiguating suffix — "Thing (service)" where two services
 * declare the same model — match on the bare name, or every one of them would be
 * reported as removed.
 *
 * DATA MODELS ONLY, and deliberately so. Endpoints and integrations are written
 * in the map the way a person names them — a path without its service prefix, an
 * integration called "S3 / MinIO" where the scanner sees the package `@aws-sdk`.
 * Comparing those to derived strings reported twenty-five departures of which
 * two were real, and a check that is wrong twenty-three times out of twenty-five
 * is one people learn to scroll past — the same reason scan:contracts refuses to
 * name unused endpoints. A model name is canonical in both places, so that is
 * where this can be trusted. Widening it means teaching the scanner to normalise
 * those names first, not loosening the comparison.
 */
function departed() {
  const bare = (n) => String(n).replace(/\s*\([^)]*\)\s*$/, "").trim()
  const live = new Set(derived.data.map((d) => d.name))
  return {
    data: (existing.data ?? []).filter((d) => !live.has(bare(d.name))),
  }
}

const missing = drift()
const missingTotal = Object.values(missing).reduce((n, v) => n + v.length, 0)
const gone = departed()
const goneTotal = Object.values(gone).reduce((n, v) => n + v.length, 0)

if (asJson) {
  // Flush synchronously: this payload is ~64KB on a real monorepo, and
  // `console.log` + `process.exit()` drops whatever is still buffered — the
  // reader gets JSON cut mid-object. Same bug the MCP server and scan:contracts
  // already paid for.
  emitJson({ repo: rel(REPO) || ".", derived, missing, gone })
}

/**
 * Name the repo, not the path that reaches it. `repo.root` is a relative hop
 * (`..` for an embedded clone), and printing it raw produced the heading
 * "System inventory — ..", which tells a reader nothing about what was scanned.
 */
const scannedLabel = target
  ? (existing?.repo?.name ?? path.basename(REPO) ?? target)
  : "this repo"
console.log(`\nSystem inventory — ${scannedLabel}`)
console.log(
  `  ${derived.areas.length} areas · ${derived.api.length} endpoints · `
  + `${derived.data.length} models · ${derived.integrations.length} integrations`
)

if (!existing.repo) {
  console.log(
    `\n  No system map yet — this inventory is the skeleton for one.`
    + `\n  Run the \`codebase-map\` skill; the system-mapper writes the summaries.`
  )
} else if (missingTotal === 0) {
  console.log(`\n  The map covers everything this scan can see.`)
} else {
  console.log(`\n  ${missingTotal} item(s) exist in the code but not in the map:`)
  for (const [k, v] of Object.entries(missing)) {
    if (!v.length) continue
    // A monorepo has one schema.prisma per app, so the same model name can
    // legitimately appear several times as genuinely different tables. They stay
    // separate in the inventory; only this sample is deduped, so the list reads
    // as names rather than as a stutter.
    const labels = [...new Set(v.map((x) => x.name ?? `${x.method} ${x.path}`))]
    console.log(
      `    ${k}: ${v.length}${labels.length !== v.length ? ` (${labels.length} distinct)` : ""}`
      + ` — ${labels.slice(0, 6).join(", ")}${labels.length > 6 ? " …" : ""}`
    )
  }
  console.log(`\n  Re-run the \`codebase-map\` skill to document them.`)
}

/**
 * Reported separately from `missing`, and worded harder, because the two are not
 * the same kind of problem. A gap reads as a gap; a description of something
 * that no longer exists reads as fact, and nothing else in the toolchain looks
 * for it.
 */
if (existing.repo && goneTotal > 0) {
  console.log(`\n  ${goneTotal} item(s) in the map that the code no longer has:`)
  for (const [k, v] of Object.entries(gone)) {
    if (!v.length) continue
    const labels = [...new Set(v.map((x) => x.name ?? `${x.method} ${x.path}`))]
    console.log(
      `    ${k}: ${v.length} — ${labels.slice(0, 6).join(", ")}${labels.length > 6 ? " …" : ""}`
    )
  }
  console.log(
    `\n  These describe code that is gone. Delete them, or confirm the scan simply`
    + `\n  cannot see them (a store this scanner does not parse, or a host that is`
    + `\n  not checked out here) — but do not leave them unexamined.`
  )
}

console.log(
  `\n  Inventory only. Names, paths, methods and field types are derived;`
  + `\n  what any of it MEANS is written by the system-mapper and never guessed here.\n`
)

if (write) {
  const byName = new Map((existing.areas ?? []).map((a) => [a.name, a]))
  const merged = {
    ...existing,
    areas: derived.areas.map((a) => ({
      ...a,
      // Carry the agent's prose across; never overwrite it with a blank.
      summary: byName.get(a.name)?.summary ?? "",
      details: byName.get(a.name)?.details,
      surface: byName.get(a.name)?.surface,
    })),
    provenance: {
      ...(existing.provenance ?? {}),
      generatedAt: new Date().toISOString(),
      generator: "scan:system",
      confidence: derived.areas.every((a) => byName.get(a.name)?.summary) ? "high" : "medium",
      // Mirror the repo commit so the freshness report can name it rather
      // than printing "anchored at ?".
      ...(existing.repo?.commit ? { commit: existing.repo.commit } : {}),
      /**
       * ANCHOR the map to the schemas it was built from.
       *
       * Without this the System Map is not merely unchecked but UNCHECKABLE:
       * check:freshness reports it "unanchored", which is a state no amount of
       * regenerating clears, so the largest digest in the hub could describe a
       * schema from six months ago and every gate would stay green. It is how a
       * map ends up documenting tables that were deleted.
       *
       * Schema files only. They are what the data model — the half most likely
       * to be read as current — is derived from, and hashing every file the scan
       * touched would mark the map stale on any unrelated edit anywhere in the
       * repo, which is the fastest way to teach people to ignore a warning.
       */
      ...anchorOf(schemaFiles()),
    },
  }
  writeFileSync(MAP_PATH, `${JSON.stringify(merged, null, 2)}\n`)
  console.log(`  areas merged into data/system-map.json (prose preserved)\n`)
}

process.exit(check && missingTotal > 0 && existing.repo ? 1 : 0)
