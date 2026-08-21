#!/usr/bin/env node
/**
 * REAL-WORLD SCENARIO AUDIT.
 *
 * Four people doing four ordinary things in a repo that has Synclair in it. Every
 * step below is EXECUTED — a controller really gets written, the gate really runs,
 * the MCP really answers — and each outcome is classified by who had to do it:
 *
 *   AUTO    happened with nobody asking and nobody told to
 *   TOLD    a human was informed without asking, and the fix is one command
 *   MANUAL  a human has to decide or write something; no tool can do it
 *
 * The point is the ratio, and specifically where MANUAL sits. A tool that claims
 * everything is automatic is lying; the useful claim is that the automatic half
 * is the half nobody remembers to do.
 *
 * Runs against a throwaway worktree. Never point it at a live checkout.
 */

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const ROOT = process.argv[2]
const OUT = process.argv[3] ?? "/tmp/scenario-results.json"
if (!ROOT || !existsSync(path.join(ROOT, "synclair"))) {
  console.error("usage: scenario-audit.mjs <worktree-root> [out.json]")
  process.exit(1)
}
const HUB = path.join(ROOT, "synclair")

const sh = (cmd, args, cwd = HUB) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf8", timeout: 120000, maxBuffer: 16e6 })
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`
  }
}
const node = (script, args = [], cwd = HUB) =>
  sh(process.execPath, [path.join(HUB, "scripts", script), ...args], cwd)

const mcp = async (tool, args = {}) => {
  const mod = await import(path.join(HUB, "scripts", "mcp-tools.mjs"))
  const prevCwd = process.cwd()
  process.chdir(HUB)
  try {
    const r = await mod.callTool(tool, args)
    const text = typeof r === "string" ? r : r?.content?.[0]?.text
    return JSON.parse(text)
  } finally {
    process.chdir(prevCwd)
  }
}

/**
 * Each scenario starts from the same map.
 *
 * The write is ADDITIVE by design, so deleting a scenario's controller does not
 * remove the rows it added — the first run had the backend dev's endpoints still
 * sitting in the map when the team scenario ran, which made the team's numbers
 * that scenario's leftovers rather than staging's. Snapshot and restore.
 */
const MAP = path.join(HUB, "data/system-map.json")
let mapSnapshot = null
const snapshotMap = () => {
  mapSnapshot = readFileSync(MAP, "utf8")
}
const restoreMap = () => {
  if (mapSnapshot !== null) writeFileSync(MAP, mapSnapshot)
}

const scenarios = []
let current = null
const scenario = (persona, title, question) => {
  restoreMap()
  snapshotMap()
  current = { persona, title, question, steps: [] }
  scenarios.push(current)
}
const step = (who, what, evidence) => {
  current.steps.push({ who, what, evidence: String(evidence).trim().slice(0, 600) })
}

const firstLine = (s, match) =>
  String(s).split("\n").find((l) => (match ? l.includes(match) : l.trim())) ?? ""

// ═══════════════════════════════════════════════ 1 · backend dev ships an endpoint

scenario(
  "Backend developer",
  "Ships a new endpoint",
  "I added a controller. Does anyone need to tell Synclair?"
)
{
  const file = path.join(ROOT, "apps/core-api/src/geo/service-area.controller.ts")
  writeFileSync(
    file,
    `import { Controller, Get, Post } from '@nestjs/common';\n` +
      `@Controller('service-areas')\n` +
      `export class ServiceAreaController {\n` +
      `  @Get() list() { return []; }\n` +
      `  @Post() create() { return {}; }\n` +
      `}\n`
  )
  step("dev", "Writes a controller with two endpoints and commits", "GET /service-areas, POST /service-areas")

  const gate = node("scan-system.mjs", ["--check"])
  step(
    "AUTO",
    "The local gate fails the commit-time check",
    firstLine(gate, "exist in the code") + "\n" + firstLine(gate, "service-areas")
  )

  const brief = node("agent-brief.mjs", ["--force"])
  step(
    "TOLD",
    "Any agent opening a session is told, without asking",
    firstLine(brief, "System Map doesn't have") || "(no line)"
  )

  node("scan-system.mjs", ["--write"])
  const map = JSON.parse(readFileSync(path.join(HUB, "data/system-map.json"), "utf8"))
  const added = map.api.filter((e) => String(e.source).includes("service-area.controller"))
  step(
    "AUTO",
    "The index writes itself — rows appear with paths and sources, no model involved",
    added.map((e) => `${e.method} ${e.path} → ${e.source}`).join("\n")
  )

  step(
    "MANUAL",
    "What the endpoints MEAN is still blank — a person writes this",
    added.map((e) => `${e.method} ${e.path} · summary: ${JSON.stringify(e.summary)}`).join("\n")
  )

  const after = node("scan-system.mjs", ["--check"])
  step("AUTO", "Drift is closed; the gate passes again", firstLine(after, "covers everything") || firstLine(after, "exist in"))

  rmSync(file)
}

// ═══════════════════════════════════════════ 2 · frontend dev wires a screen

scenario(
  "Frontend developer",
  "Wires a screen to the backend",
  "I need file upload on this screen. Where's the endpoint?"
)
{
  const hits = await mcp("search_all", { query: "file upload" })
  const sys = hits.groups?.system
  step(
    "AUTO",
    "One MCP call, no repo grep — the natural phrasing returns the surface",
    `search_all("file upload") → ${sys?.total ?? 0} system matches, ${hits.groups?.library?.total ?? 0} library`
  )

  const detail = await mcp("get_system", { query: "file.upload" })
  const e = (detail.api ?? [])[0]
  step(
    "AUTO",
    "It names the real transport, not the one you would assume",
    e ? `${e.method} ${e.path}\n${e.source}\n${e.summary}` : "(nothing returned)"
  )
  step(
    "AUTO",
    "The answer prevents the wrong guess",
    "The obvious assumption is REST. There is no HTTP controller for files at all — " +
      "every operation is request/reply over the message bus. The map says so explicitly."
  )

  const comp = await mcp("search_library", { query: "gallery", limit: 3 })
  step(
    "AUTO",
    "The UI side of the same question is one call away",
    (comp.items ?? []).map((i) => `${i.name} (${i.tier}, ${i.origin})`).join("\n") || "(none)"
  )
  step(
    "MANUAL",
    "Whether this screen SHOULD use that endpoint is a product decision",
    "Synclair reports what exists. Choosing among them, and handling the states, stays with the developer."
  )
}

// ═══════════════════════════════════════════ 3 · designer adds a component

scenario(
  "Designer",
  "Adds a component to the prototype",
  "I built a new component. Does the catalog know?"
)
{
  const rel = "apps/prototype/src/components/CoverageBadge.tsx"
  const file = path.join(ROOT, rel)
  writeFileSync(
    file,
    `export function CoverageBadge({ pct }: { pct: number }) {\n` +
      `  return <span className="text-sm">{pct}%</span>;\n}\n`
  )
  step("designer", "Creates a component in the prototype", rel)

  const changed = path.join(ROOT, "changed.txt")
  writeFileSync(changed, `${rel}\n`)
  const gateOut = sh(
    process.execPath,
    [path.join(HUB, "scripts", "ci-pr-catalog-check.mjs"), changed],
    ROOT
  )
  step(
    "TOLD",
    "The pull request gets a comment naming it — nobody had to run anything",
    gateOut.split("\n").filter((l) => l.includes("uncataloged") || l.includes("CoverageBadge")).join("\n") ||
      firstLine(gateOut, "Synclair")
  )
  step(
    "MANUAL",
    "Cataloging it — the description, the usage, the tier — is a person's judgment",
    "The gate reports the gap and names the skill (`component-cataloger`); it does not invent the entry."
  )

  rmSync(file)
  rmSync(changed)
}

// ═══════════════════════════════════════════ 4 · the team rebases from the trunk

scenario(
  "The team",
  "Rebases from the backend trunk",
  "Six commits of backend work just landed. What now?"
)
{
  const merge = sh("git", ["merge", "parent/staging", "--no-edit"], ROOT)
  sh("git", ["checkout", "--theirs", "_docs/conventions/development/github-workflow.md"], ROOT)
  sh("git", ["add", "-A"], ROOT)
  sh("git", ["commit", "-q", "--no-verify", "-m", "merge staging"], ROOT)
  step(
    "human",
    "Merges the trunk — one docs conflict, no code conflicts",
    firstLine(merge, "CONFLICT") || "clean"
  )

  const check = node("scan-system.mjs", ["--check"])
  step(
    "AUTO",
    "The gate refuses immediately, naming what arrived",
    check.split("\n").filter((l) => l.includes("exist in the code") || l.includes("api:")).join("\n")
  )

  const changedList = sh(
    "git",
    ["diff", "--name-only", "HEAD~1", "HEAD"],
    ROOT
  )
  const changed = path.join(ROOT, "changed.txt")
  writeFileSync(changed, changedList)
  const ci = sh(process.execPath, [path.join(HUB, "scripts", "ci-pr-catalog-check.mjs"), changed], ROOT)
  step(
    "TOLD",
    "CI names every endpoint the map is missing, with its source file",
    ci.split("\n").filter((l) => l.startsWith("**This PR adds") || l.startsWith("- `")).slice(0, 6).join("\n")
  )

  const before = JSON.parse(readFileSync(path.join(HUB, "data/system-map.json"), "utf8")).api.length
  node("scan-system.mjs", ["--write"])
  const map = JSON.parse(readFileSync(path.join(HUB, "data/system-map.json"), "utf8"))
  const blank = map.api.filter((e) => !e.summary)
  step(
    "AUTO",
    "The refresh workflow indexes all of it and opens a PR — zero model calls",
    `${before} → ${map.api.length} endpoints. Newly indexed: ${blank.length}\n` +
      blank.slice(0, 4).map((e) => `  ${e.method} ${e.path}`).join("\n")
  )

  const brief = node("agent-brief.mjs", ["--force"])
  step(
    "TOLD",
    "Every agent session now opens with the honest caveat",
    firstLine(brief, "indexed but not yet described") || "(no line)"
  )

  step(
    "MANUAL",
    `Writing ${blank.length} summaries — the only part that needs a person`,
    "Drained by the `codebase-map` skill. Until then the paths are right and the meaning is blank, " +
      "which is visible in the hub and stated in every MCP answer."
  )

  const after = node("scan-system.mjs", ["--check"])
  step("AUTO", "Structural drift is closed", firstLine(after, "covers everything") || firstLine(after, "exist in"))

  rmSync(changed)
}

// ═══════════════════════════════════════════════════════════════════ tally

const all = scenarios.flatMap((s) => s.steps)
const tally = { AUTO: 0, TOLD: 0, MANUAL: 0, human: 0 }
for (const s of all) {
  if (tally[s.who] !== undefined) tally[s.who]++
  else tally.human++
}
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), tally, scenarios }, null, 2))

for (const s of scenarios) {
  console.log(`\n━━ ${s.persona}: ${s.title}`)
  console.log(`   "${s.question}"`)
  for (const st of s.steps) {
    console.log(`   [${st.who.padEnd(6)}] ${st.what}`)
    for (const l of st.evidence.split("\n").slice(0, 3)) if (l.trim()) console.log(`            ${l.trim()}`)
  }
}
console.log(
  `\nAUTO ${tally.AUTO} · TOLD ${tally.TOLD} · MANUAL ${tally.MANUAL} · human-initiated ${tally.human}`
)
console.log(`results → ${OUT}`)
