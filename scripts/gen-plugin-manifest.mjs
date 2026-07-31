#!/usr/bin/env node
/**
 * GENERATE the capability manifest — one declaration of what this foundation
 * offers an agent: its skills, its agents, and its MCP server.
 *
 * Synclair currently declares its capabilities three times over. The skills and
 * agents exist as files on disk; `AGENTS.md` describes them in prose; and the
 * unmerged bridge (synclair#23) proposed COPYING the ambient ones into
 * `.claude/`, `.agents/` and `.cursor/` so each tool would find them. Copies
 * drift — that is the one thing copies reliably do.
 *
 * A manifest doesn't. It is also, per docs/extensibility.md, most of what an
 * Extension has to declare (nav, routes, data, config, skills, agents, checks),
 * which is why this and the Extension registry must be ONE system rather than
 * two that describe the same capabilities differently. This generator is the
 * first half of that: it derives the manifest from what is actually on disk, so
 * the declaration cannot fall out of step with reality.
 *
 * Derived, never hand-edited — every field comes from a file's own frontmatter.
 * If a skill's `category`/`layer` is missing it is reported, not invented: a
 * guessed classifier is worse than a visible gap, because /synclair/ai-setup
 * shows it as fact.
 *
 *   node scripts/gen-plugin-manifest.mjs           write .claude-plugin/plugin.json
 *   node scripts/gen-plugin-manifest.mjs --check   exit 1 if stale (CI)
 *   node scripts/gen-plugin-manifest.mjs --print   show it, write nothing
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, ".claude-plugin")
const OUT_FILE = path.join(OUT_DIR, "plugin.json")

const args = process.argv.slice(2)
const check = args.includes("--check")
const printOnly = args.includes("--print")

const readText = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null)

/** Parse the leading `---` block. Only top-level `key: value` lines. */
function frontmatter(text) {
  if (!text?.startsWith("---")) return {}
  const end = text.indexOf("\n---", 3)
  if (end === -1) return {}
  const out = {}
  for (const line of text.slice(4, end).split("\n")) {
    const at = line.indexOf(":")
    if (at === -1 || line.startsWith(" ")) continue
    const key = line.slice(0, at).trim()
    if (key) out[key] = line.slice(at + 1).trim()
  }
  return out
}

const gaps = []

function collect(dir, listing, kind) {
  if (!existsSync(dir)) return []
  return listing(dir)
    .map(({ name, file }) => {
      const fm = frontmatter(readText(file) ?? "")
      const id = fm.name ?? name
      if (!fm.description) gaps.push(`${kind}/${id}: no description (it will never auto-trigger)`)
      if (!fm.category) gaps.push(`${kind}/${id}: no category (lands in "Other" on /synclair/ai-setup)`)
      if (!fm.layer) gaps.push(`${kind}/${id}: no layer (defaults to "project", so it won't sync)`)
      return {
        name: id,
        description: fm.description ?? "",
        // Absent classifiers are reported above and defaulted here the same way
        // the hub defaults them — the manifest must not disagree with the UI.
        category: fm.category ?? "other",
        layer: fm.layer ?? "project",
        source: path.relative(ROOT, file),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

const skills = collect(
  path.join(ROOT, ".claude/skills"),
  (dir) =>
    readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => ({ name: e.name, file: path.join(dir, e.name, "SKILL.md") }))
      .filter((e) => existsSync(e.file)),
  "skill"
)

const agents = collect(
  path.join(ROOT, ".claude/agents"),
  (dir) =>
    readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => ({ name: e.name.replace(/\.md$/, ""), file: path.join(dir, e.name) })),
  "agent"
)

const pkg = JSON.parse(readText(path.join(ROOT, "package.json")) ?? "{}")
const hasServer = existsSync(path.join(ROOT, "scripts", "mcp-server.mjs"))

const manifest = {
  name: "synclair",
  version: pkg.version ?? "0.0.0",
  description:
    "One aligned source of truth for humans and agents — design tokens, component "
    + "library, and project knowledge, served to agents over MCP.",
  // The MCP server is a capability of the same set, not a separate integration —
  // that is the whole point of one manifest.
  ...(hasServer
    ? { mcpServers: { synclair: { command: "node", args: ["scripts/mcp-server.mjs"] } } }
    : {}),
  skills: skills.map((s) => ({ ...s })),
  agents: agents.map((a) => ({ ...a })),
  generated: {
    by: "gen:plugin-manifest",
    note: "Derived from the files on disk — edit the capability's frontmatter, not this file.",
  },
}

const rendered = `${JSON.stringify(manifest, null, 2)}\n`

if (printOnly) {
  console.log(rendered)
  process.exit(0)
}

const current = readText(OUT_FILE)

if (check) {
  if (current === rendered) {
    console.log(`Plugin manifest current — ${skills.length} skills, ${agents.length} agents.`)
    process.exit(0)
  }
  console.error(
    current === null
      ? "No .claude-plugin/plugin.json — run `npm run gen:plugin-manifest`."
      : "Plugin manifest is stale — run `npm run gen:plugin-manifest`."
  )
  process.exit(1)
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT_FILE, rendered)

console.log(
  `Plugin manifest written → .claude-plugin/plugin.json`
  + `\n  ${skills.length} skills · ${agents.length} agents`
  + `${hasServer ? " · 1 MCP server" : " · no MCP server found"}`
)

if (gaps.length) {
  console.log(`\n  ${gaps.length} classifier gap(s) — reported, never guessed:`)
  for (const g of gaps.slice(0, 12)) console.log(`    ${g}`)
  if (gaps.length > 12) console.log(`    … and ${gaps.length - 12} more`)
}
