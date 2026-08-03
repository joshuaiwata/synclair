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

/** Prisma models: name + field names/types. Meaning is the agent's job. */
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
      for (const line of m[2].split("\n")) {
        const f = /^\s*(\w+)\s+(\S+)/.exec(line)
        if (f && !line.trim().startsWith("@@")) fields.push({ name: f[1], type: f[2] })
      }
      out.push({ name: m[1], kind: "table", fields, source: rel(abs) })
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

const missing = drift()
const missingTotal = Object.values(missing).reduce((n, v) => n + v.length, 0)

if (asJson) {
  // Flush synchronously: this payload is ~64KB on a real monorepo, and
  // `console.log` + `process.exit()` drops whatever is still buffered — the
  // reader gets JSON cut mid-object. Same bug the MCP server and scan:contracts
  // already paid for.
  emitJson({ repo: rel(REPO) || ".", derived, missing })
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
    },
  }
  writeFileSync(MAP_PATH, `${JSON.stringify(merged, null, 2)}\n`)
  console.log(`  areas merged into data/system-map.json (prose preserved)\n`)
}

process.exit(check && missingTotal > 0 && existing.repo ? 1 : 0)
