#!/usr/bin/env node
/**
 * GENERATE the clone-status block in AGENTS.md — deterministically, no LLM.
 *
 * `AGENTS.md` is the first thing every agent reads, and it loads in FULL on
 * every session. Most of it is architecture that is identical in every clone
 * (the "Where things live" table, the rules) — that's foundation content, it
 * syncs, and generating it would be pointless churn.
 *
 * What differs per clone, and what an agent currently has to discover by opening
 * half a dozen data files, is *what is actually populated here*. That's what
 * this generates: one short block saying what this clone knows, with counts and
 * freshness. It is the cheapest possible answer to "where am I".
 *
 * Marker-delimited so hand-written content is never at risk:
 *
 *   no file           → refuse (the router is foundation content, not ours to create)
 *   no markers        → append the block, touch nothing else
 *   markers present   → replace ONLY what's between them
 *
 * SYNC NOTE: the block's content is clone-specific, so a foundation merge can
 * conflict here. It's deterministic — resolve any conflict by taking either side
 * and re-running this. That's why it lives at the end, in its own block, rather
 * than woven through the router.
 *
 *   node scripts/gen-agents-block.mjs           write it
 *   node scripts/gen-agents-block.mjs --check   exit 1 if stale (CI)
 *   node scripts/gen-agents-block.mjs --print   show the block, write nothing
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { launchDirs, resolveTarget, userScopeFile } from "./lib/topology.mjs"

const ROOT = process.cwd()
const TARGET = path.join(ROOT, "AGENTS.md")
const START = "<!-- SYNCLAIR:STATUS:START -->"
const END = "<!-- SYNCLAIR:STATUS:END -->"

const args = process.argv.slice(2)
const check = args.includes("--check")
const printOnly = args.includes("--print")

function readJson(rel) {
  const p = path.join(ROOT, rel)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

const readText = (rel) => {
  const p = path.join(ROOT, rel)
  return existsSync(p) ? readFileSync(p, "utf8") : null
}

// ------------------------------------------------------------------- gather

function scanProject() {
  const text = readText("lib/system/seed/project.ts") ?? ""
  return {
    name: /name:\s*"([^"]*)"/.exec(text)?.[1],
    tagline: /tagline:\s*"([^"]*)"/.exec(text)?.[1],
  }
}

function counts() {
  const reg = readJson("registry.json")
  const cat = readJson("data/external-catalog.json")
  const pages = readJson("data/pages-map.json")
  const sys = readJson("data/system-map.json")
  const setup = readJson("data/setup.json")
  const hygiene = readJson("data/host-hygiene.json")
  const knowledge = (readText("lib/system/knowledge/sources.ts") ?? "").match(/\bid:\s*"/g)?.length ?? 0

  const items = Array.isArray(reg?.items) ? reg.items : []

  /**
   * shadcn registry type → tier. Substring-matching each tier name separately
   * meant `registry:page` matched NONE of them and vanished from every count;
   * it's a whole view, so it belongs with templates. Must agree with
   * `tierOf` in scripts/mcp-server.mjs — two places reporting different
   * totals for the same library is worse than either number alone.
   */
  const nativeTier = (type) =>
    (type ?? "").includes("block")
      ? "block"
      : (type ?? "").includes("template") || (type ?? "").includes("page")
        ? "template"
        : "component"

  /**
   * Counted per ORIGIN, never summed. Synclair's own chrome and the product's
   * catalogue are different questions, and a combined figure disagrees with the
   * hub — which shows the host's count for the surface you're looking at.
   */
  const nativeBy = (t) => items.filter((i) => nativeTier(i.type) === t).length
  const hostBy = (t) => (cat?.items ?? []).filter((i) => (i.kind ?? "component") === t).length

  return {
    setupMode: setup?.mode ?? null,
    hosts: (cat?.hosts ?? []).map((h) => h.name ?? h.root).filter(Boolean),
    native: items.length,
    host: (cat?.items ?? []).length,
    nativeComponents: nativeBy("component"),
    nativeBlocks: nativeBy("block"),
    nativeTemplates: nativeBy("template"),
    hostComponents: hostBy("component"),
    hostBlocks: hostBy("block"),
    hostTemplates: hostBy("template"),
    pages: (pages?.pages ?? []).length,
    pagesRepo: pages?.repo?.name ?? null,
    areas: (sys?.areas ?? []).length,
    api: (sys?.api ?? []).length,
    entities: (sys?.data ?? []).length,
    knowledge,
    hygieneFindings: hygiene?.totals?.findings ?? null,
  }
}

/**
 * Is the MCP server registered anywhere a client would read it?
 *
 * Deliberately re-derived here from the same topology helpers the installer and
 * `check-mcp-registration.mjs` use, rather than reading a status file some
 * earlier step was supposed to write — a cached "installed: true" is exactly
 * the kind of claim that outlives the thing it describes.
 */
function mcpRegistration() {
  const serverAbs = path.join(ROOT, "scripts", "mcp-server.mjs")
  const seen = new Set()

  const names = (file, dir) => {
    if (!existsSync(file)) return
    let entry
    try {
      entry = JSON.parse(readFileSync(file, "utf8"))?.mcpServers?.synclair
    } catch {
      return
    }
    const recorded = Array.isArray(entry?.args) ? entry.args[0] : null
    if (!recorded) return
    const resolved = path.isAbsolute(recorded) ? recorded : path.resolve(dir, recorded)
    if (existsSync(resolved) && path.resolve(resolved) === path.resolve(serverAbs)) return true
  }

  const { hostRoot } = resolveTarget(ROOT)
  for (const dir of hostRoot ? launchDirs(ROOT, hostRoot) : []) {
    if (names(path.join(dir, ".mcp.json"), dir)) seen.add("Claude Code")
    if (names(path.join(dir, ".cursor", "mcp.json"), dir)) seen.add("Cursor")
  }
  const user = userScopeFile()
  if (names(user, path.dirname(user))) seen.add("Claude Code user scope")

  return { registered: seen.size > 0, clients: [...seen] }
}

// -------------------------------------------------------------------- render

function buildBlock() {
  const p = scanProject()
  const c = counts()
  const lines = []

  lines.push(START)
  lines.push("")
  lines.push("## This clone, right now")
  lines.push("")
  lines.push(
    "_Generated by `npm run gen:agents-block` — anything between the markers is"
    + " overwritten. Counts are what THIS clone has actually been populated with;"
    + " zero means not done yet, not unavailable._"
  )
  lines.push("")

  if (p.name && p.name !== "Your Product") {
    lines.push(`- **Product** — ${p.name}${p.tagline ? `: ${p.tagline}` : ""}`)
  } else {
    lines.push("- **Product** — not named yet (`lib/system/seed/project.ts`)")
  }

  lines.push(
    `- **Setup** — ${c.setupMode ?? "unset"}`
    + (c.hosts.length ? ` · hosts: ${c.hosts.join(", ")}` : "")
  )

  const tiers = (comp, blk, tpl) => `${comp} components · ${blk} blocks · ${tpl} templates`
  if (!c.native && !c.host) {
    lines.push("- **Library** — empty (no components catalogued yet)")
  } else if (c.host) {
    // Companion mode: lead with the PRODUCT's catalogue — that's what anyone
    // building here means — and keep Synclair's own chrome as a separate line.
    lines.push(`- **Library (host)** — ${tiers(c.hostComponents, c.hostBlocks, c.hostTemplates)}`)
    lines.push(
      `- **Library (Synclair's own)** — ${tiers(c.nativeComponents, c.nativeBlocks, c.nativeTemplates)}`
    )
  } else {
    lines.push(`- **Library** — ${tiers(c.nativeComponents, c.nativeBlocks, c.nativeTemplates)}`)
  }

  lines.push(
    c.pages
      ? `- **Pages** — ${c.pages} mapped${c.pagesRepo ? ` (${c.pagesRepo})` : ""}`
      : "- **Pages** — not mapped yet (`pages-map` skill)"
  )

  lines.push(
    c.areas || c.api || c.entities
      ? `- **System map** — ${c.areas} areas · ${c.api} endpoints · ${c.entities} entities`
      : "- **System map** — not generated yet (`codebase-map` skill)"
  )

  lines.push(
    c.knowledge
      ? `- **Knowledge** — ${c.knowledge} source(s) registered`
      : "- **Knowledge** — no sources registered yet"
  )

  if (c.hygieneFindings !== null) lines.push(`- **Hygiene** — ${c.hygieneFindings} finding(s)`)

  lines.push("")

  /**
   * The MCP line is the reason this block earns its keep.
   *
   * The old sentence here told agents to prefer the tools — useless advice to
   * an agent whose client never registered them, because nothing can notice
   * tools that were never offered. It quietly reads files instead, at many
   * times the tokens, for the whole session.
   *
   * So state the answer rather than the instruction. This block loads in full
   * every session, which makes it the one place a missing registration cannot
   * go unread.
   */
  const mcp = mcpRegistration()
  if (mcp.registered) {
    lines.push(
      `- **MCP** — registered (${mcp.clients.join(", ")}). Prefer these tools over`
      + " reading the files above: `get_overview` answers most of it in one call."
    )
  } else {
    lines.push(
      "- **MCP** — **not registered**, so the `synclair` tools are unavailable and"
      + " everything above has to be read from files instead. Fix once with"
      + " `npm run mcp:install` (add `-- --user` if sessions start outside this"
      + " repo), then `npm run check:mcp`."
    )
  }

  lines.push("")
  lines.push(END)
  return lines.join("\n")
}

// --------------------------------------------------------------------- apply

const block = buildBlock()

if (printOnly) {
  console.log(block)
  process.exit(0)
}

const current = readText("AGENTS.md")
if (current === null) {
  // The router is foundation content. If it's missing, something is wrong with
  // the clone and quietly conjuring one would hide that.
  console.error("AGENTS.md not found — refusing to create the router from scratch.")
  process.exit(1)
}

let next
const s = current.indexOf(START)
const e = current.indexOf(END)

if (s !== -1 && e !== -1 && e > s) {
  next = current.slice(0, s) + block + current.slice(e + END.length)
} else if (s !== -1 || e !== -1) {
  console.error(
    "AGENTS.md has only one of the two status markers — refusing to guess where the block ends.\n"
    + "Remove the stray marker and re-run."
  )
  process.exit(1)
} else {
  next = `${current.replace(/\s*$/, "")}\n\n${block}\n`
}

if (check) {
  if (next === current) {
    console.log("AGENTS.md status block is current.")
    process.exit(0)
  }
  console.error("AGENTS.md status block is stale — run `npm run gen:agents-block`.")
  process.exit(1)
}

if (next === current) {
  console.log("AGENTS.md status block already current — no change.")
  process.exit(0)
}

writeFileSync(TARGET, next)
console.log(
  `AGENTS.md status block ${s === -1 ? "appended" : "updated"} `
  + `(${block.length} chars).`
)
