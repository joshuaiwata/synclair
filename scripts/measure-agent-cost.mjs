#!/usr/bin/env node
/**
 * MEASURE AGENT COST — the baseline every agent-interface change is judged against.
 *
 * Synclair's knowledge reaches agents two ways today, and both cost tokens:
 *
 *   AMBIENT — what loads into EVERY session before a task even starts: the
 *   router (`AGENTS.md` + `CLAUDE.md`) plus the frontmatter description of every
 *   skill and agent, which the harness surfaces so capabilities can auto-trigger.
 *   This is a fixed tax on every conversation.
 *
 *   LOOKUP — what an agent must READ to answer a specific question, because the
 *   answer lives in a data file or a skill body it has to open whole.
 *
 * Both are measured here so the MCP server (which replaces whole-file reads with
 * task-shaped responses) can be proven to help rather than assumed to. Run it
 * before and after; `--compare` diffs against the stored baseline.
 *
 * IMPORTANT — run this in a POPULATED clone for meaningful LOOKUP numbers. In
 * the mother repo `data/*.json` ship blank (seed), so lookup costs read near
 * zero. Blank inputs are reported as `blank`, never silently counted as 0.
 *
 *   node scripts/measure-agent-cost.mjs             # measure + print
 *   node scripts/measure-agent-cost.mjs --save      # ...and write the baseline
 *   node scripts/measure-agent-cost.mjs --compare   # ...and diff vs baseline
 *   node scripts/measure-agent-cost.mjs --json      # machine-readable
 */

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const BASELINE_PATH = path.join(ROOT, "data", "agent-cost.json")

/**
 * Chars-per-token divisor. We deliberately do NOT take a tokenizer dependency —
 * this script must run in any clone with zero install. These are the standard
 * rough ratios for BPE tokenizers; they are ESTIMATES and labelled as such
 * everywhere they surface. What matters for this harness is the DELTA between
 * two runs using the same estimator, not the absolute value.
 */
const CHARS_PER_TOKEN = { prose: 4.0, code: 3.5 }

const estTokens = (chars, kind = "prose") => Math.round(chars / CHARS_PER_TOKEN[kind])

// ---------------------------------------------------------------- utilities

function readIfPresent(rel) {
  const abs = path.join(ROOT, rel)
  if (!existsSync(abs)) return null
  try {
    if (statSync(abs).isDirectory()) return null
    return readFileSync(abs, "utf8")
  } catch {
    return null
  }
}

/**
 * A data file counts as `blank` when it is the shipped seed — an empty object,
 * empty array, or a wrapper whose only populated key is a schema marker. We
 * check for emptiness structurally rather than by byte length so a 33-byte seed
 * isn't reported as a real 33-byte cost.
 */
function isBlankData(text) {
  if (!text?.trim()) return true
  try {
    const v = JSON.parse(text)
    if (Array.isArray(v)) return v.length === 0
    if (v && typeof v === "object") {
      const keys = Object.keys(v).filter((k) => k !== "$schema" && k !== "version")
      if (keys.length === 0) return true
      // A wrapper like {"repo": null} or {"items": []} is still blank.
      return keys.every((k) => {
        const inner = v[k]
        if (inner === null || inner === undefined) return true
        if (Array.isArray(inner)) return inner.length === 0
        if (typeof inner === "object") return Object.keys(inner).length === 0
        return false
      })
    }
  } catch {
    /* not JSON — fall through, treat as real content */
  }
  return false
}

/** Parse the leading `---` YAML block. Returns {} when absent or malformed. */
function frontmatter(text) {
  if (!text?.startsWith("---")) return {}
  const end = text.indexOf("\n---", 3)
  if (end === -1) return {}
  const out = {}
  for (const line of text.slice(4, end).split("\n")) {
    const at = line.indexOf(":")
    if (at === -1) continue
    const key = line.slice(0, at).trim()
    if (!key || line.startsWith(" ")) continue
    out[key] = line.slice(at + 1).trim()
  }
  return out
}

function listDirs(rel) {
  const abs = path.join(ROOT, rel)
  if (!existsSync(abs)) return []
  return readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

function listFiles(rel, ext) {
  const abs = path.join(ROOT, rel)
  if (!existsSync(abs)) return []
  return readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(ext))
    .map((e) => e.name)
    .sort()
}

// ------------------------------------------------------------------ ambient

/**
 * The per-session tax: the router files load in full via the `@AGENTS.md`
 * import, and every skill/agent contributes `name` + `description` to the
 * capability listing the harness injects. Bodies are NOT ambient — a skill body
 * is only read once its description matches the task (progressive disclosure) —
 * so body size is reported separately as context, not counted in the tax.
 */
function measureAmbient() {
  const routers = ["AGENTS.md", "CLAUDE.md"].map((rel) => {
    const text = readIfPresent(rel)
    return { file: rel, chars: text?.length ?? 0, present: text !== null }
  })

  const capability = (dir, files, label) => {
    const entries = files.map((f) => {
      const rel = path.join(dir, f)
      const text = readIfPresent(rel) ?? ""
      const fm = frontmatter(text)
      const surfaced = `${fm.name ?? ""}: ${fm.description ?? ""}`
      return {
        name: fm.name ?? f,
        rel,
        surfacedChars: surfaced.length,
        bodyChars: text.length,
        missingCategory: !fm.category,
        missingLayer: !fm.layer,
      }
    })
    return {
      kind: label,
      count: entries.length,
      surfacedChars: entries.reduce((n, e) => n + e.surfacedChars, 0),
      bodyChars: entries.reduce((n, e) => n + e.bodyChars, 0),
      entries,
    }
  }

  const skills = capability(
    ".claude/skills",
    listDirs(".claude/skills").map((d) => `${d}/SKILL.md`),
    "skills"
  )
  const agents = capability(".claude/agents", listFiles(".claude/agents", ".md"), "agents")

  const routerChars = routers.reduce((n, r) => n + r.chars, 0)
  const ambientChars = routerChars + skills.surfacedChars + agents.surfacedChars

  return {
    routers,
    skills,
    agents,
    routerChars,
    ambientChars,
    ambientTokens: estTokens(ambientChars, "prose"),
    /** Read only on demand — reported for context, NOT part of the tax. */
    deferredBodyChars: skills.bodyChars + agents.bodyChars,
  }
}

// ------------------------------------------------------------------- lookup

/**
 * Representative questions an agent actually asks Synclair, each paired with the
 * files it must read WHOLE today to answer. These are the scenarios the MCP
 * tools will serve as shaped responses, so the pairing is the comparison.
 */
const SCENARIOS = [
  {
    id: "what-components-exist",
    question: "What components exist and which should I use?",
    tool: "search_library",
    reads: ["registry.json", "data/external-catalog.json", ".claude/skills/component-library/SKILL.md"],
  },
  {
    id: "what-does-page-compose",
    question: "What pages exist and what does each one compose?",
    tool: "get_page",
    reads: ["data/pages-map.json", ".claude/skills/pages-map/SKILL.md"],
  },
  {
    id: "which-token",
    question: "Which token do I use for this styling decision?",
    tool: "get_foundation",
    reads: ["lib/system/tokens.ts", "lib/system/seed/foundation.ts", "lib/system/seed/brand-ramps.ts"],
  },
  {
    id: "what-is-this-project",
    question: "What is this project / what's being built?",
    tool: "get_overview",
    reads: [
      ".claude/skills/project-identity/SKILL.md",
      "lib/system/knowledge/sources.ts",
      "data/setup.json",
      "data/system-map.json",
    ],
  },
  {
    id: "what-is-the-system",
    question: "What does this codebase consist of beyond the UI?",
    tool: "get_system",
    reads: ["data/system-map.json", ".claude/skills/codebase-map/SKILL.md"],
  },
]

function measureLookups() {
  return SCENARIOS.map((s) => {
    const files = s.reads.map((rel) => {
      const text = readIfPresent(rel)
      if (text === null) return { rel, state: "missing", chars: 0 }
      if (rel.startsWith("data/") && isBlankData(text)) return { rel, state: "blank", chars: 0 }
      return { rel, state: "read", chars: text.length }
    })
    const chars = files.reduce((n, f) => n + f.chars, 0)
    const kind = s.reads.some((r) => r.endsWith(".ts") || r.endsWith(".json")) ? "code" : "prose"
    return {
      id: s.id,
      question: s.question,
      tool: s.tool,
      files,
      chars,
      tokens: estTokens(chars, kind),
      /** Every file the agent opens is a round trip, not just tokens. */
      reads: files.filter((f) => f.state === "read").length,
      blank: files.filter((f) => f.state === "blank").map((f) => f.rel),
      missing: files.filter((f) => f.state === "missing").map((f) => f.rel),
    }
  })
}

// ---------------------------------------------------------------------- mcp

/**
 * The "after" side of the comparison, measured rather than estimated: spawn the
 * real MCP server, do a real JSON-RPC round trip, and count the bytes an agent
 * would actually receive.
 *
 * Two costs matter and they pull in opposite directions — the tool SURFACE
 * (descriptions + schemas, added to every session's ambient tax) and the
 * RESPONSES (which replace whole-file reads). A tool layer only pays for itself
 * when the second saving beats the first, so both are reported.
 */
function measureMcp() {
  const server = path.join(ROOT, "scripts", "mcp-server.mjs")
  if (!existsSync(server)) return null

  const calls = SCENARIOS.map((s, i) => ({
    jsonrpc: "2.0",
    id: 100 + i,
    method: "tools/call",
    params: { name: s.tool, arguments: scenarioArgs(s.id) },
  }))

  const lines = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {} } },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ...calls,
  ]
    .map((m) => JSON.stringify(m))
    .join("\n")

  const proc = spawnSync(process.execPath, [server], { input: `${lines}\n`, encoding: "utf8" })
  if (proc.status !== 0 || !proc.stdout) return { error: proc.stderr?.trim() || "server did not respond" }

  const replies = new Map()
  for (const line of proc.stdout.trim().split("\n")) {
    try {
      const m = JSON.parse(line)
      replies.set(m.id, m)
    } catch {
      /* ignore non-JSON noise */
    }
  }

  const list = replies.get(2)?.result?.tools ?? []
  const surfaceChars = JSON.stringify(list).length

  const perScenario = SCENARIOS.map((s, i) => {
    const reply = replies.get(100 + i)
    const text = reply?.result?.content?.[0]?.text
    const chars = text?.length ?? 0
    return {
      id: s.id,
      tool: s.tool,
      chars,
      tokens: estTokens(chars, "code"),
      /** One tool call replaces N file reads — round trips matter as much as tokens. */
      reads: 1,
      error: reply?.result?.isError ? text : undefined,
    }
  })

  return {
    tools: list.length,
    surfaceChars,
    surfaceTokens: estTokens(surfaceChars, "prose"),
    scenarios: perScenario,
    totals: {
      lookupTokens: perScenario.reduce((n, s) => n + s.tokens, 0),
      lookupReads: perScenario.length,
    },
  }
}

/** Representative arguments — a real question, not an empty call. */
function scenarioArgs(id) {
  if (id === "what-components-exist") return { query: "badge" }
  if (id === "which-token") return { query: "muted" }
  return {}
}

// ------------------------------------------------------------------- report

function build() {
  const ambient = measureAmbient()
  const lookups = measureLookups()
  const mcp = measureMcp()
  const populated = lookups.every((l) => l.blank.length === 0)

  return {
    measuredAt: new Date().toISOString(),
    estimator: { charsPerToken: CHARS_PER_TOKEN, note: "estimate — compare deltas, not absolutes" },
    repo: path.basename(ROOT),
    /** False in the mother repo (blank seed): LOOKUP numbers are not meaningful. */
    populated,
    ambient: {
      chars: ambient.ambientChars,
      tokens: ambient.ambientTokens,
      routerChars: ambient.routerChars,
      routers: ambient.routers,
      skills: { count: ambient.skills.count, surfacedChars: ambient.skills.surfacedChars },
      agents: { count: ambient.agents.count, surfacedChars: ambient.agents.surfacedChars },
      deferredBodyChars: ambient.deferredBodyChars,
    },
    // Per-file detail stays out of the snapshot — it's noise in a diff, and the
    // `blank`/`missing` lists already name anything that needs attention.
    lookups: lookups.map((l) => ({ ...l, files: undefined })),
    totals: {
      lookupTokens: lookups.reduce((n, l) => n + l.tokens, 0),
      lookupReads: lookups.reduce((n, l) => n + l.reads, 0),
    },
    mcp,
    /** Capability hygiene — a missing classifier degrades /synclair/ai-setup. */
    unclassified: [...ambient.skills.entries, ...ambient.agents.entries]
      .filter((e) => e.missingCategory || e.missingLayer)
      .map((e) => e.rel),
  }
}

const fmt = (n) => n.toLocaleString("en-US")

function print(snap, prev) {
  const delta = (now, before) => {
    if (!before) return ""
    const d = now - before
    if (d === 0) return "  (unchanged)"
    const pct = before === 0 ? "" : ` ${((d / before) * 100).toFixed(1)}%`
    return `  (${d > 0 ? "+" : ""}${fmt(d)}${pct})`
  }

  console.log(`\nAgent cost — ${snap.repo}  ·  ${snap.measuredAt.slice(0, 10)}`)
  console.log(`Token counts are ESTIMATES (${CHARS_PER_TOKEN.prose} chars/token prose,`
    + ` ${CHARS_PER_TOKEN.code} code). Compare deltas, not absolutes.\n`)

  console.log("AMBIENT — loaded every session, before any task")
  console.log(`  router (AGENTS.md + CLAUDE.md)   ${fmt(snap.ambient.routerChars).padStart(9)} chars`)
  console.log(`  ${String(snap.ambient.skills.count).padStart(2)} skill descriptions`
    + `             ${fmt(snap.ambient.skills.surfacedChars).padStart(9)} chars`)
  console.log(`  ${String(snap.ambient.agents.count).padStart(2)} agent descriptions`
    + `             ${fmt(snap.ambient.agents.surfacedChars).padStart(9)} chars`)
  console.log(`  ─ ambient total                  ${fmt(snap.ambient.tokens).padStart(9)} tokens`
    + delta(snap.ambient.tokens, prev?.ambient?.tokens))
  console.log(`    (skill/agent BODIES, read on demand only: `
    + `${fmt(snap.ambient.deferredBodyChars)} chars)\n`)

  console.log("LOOKUP — what answering a question costs today")
  if (!snap.populated) {
    console.log("  ⚠ blank seed in this clone — lookup numbers are NOT meaningful here.")
    console.log("    Run in a populated clone for real figures.\n")
  }
  for (const l of snap.lookups) {
    const prevL = prev?.lookups?.find((p) => p.id === l.id)
    const flag = l.blank.length ? "  [blank seed]" : l.missing.length ? "  [missing files]" : ""
    const files = `${l.reads} ${l.reads === 1 ? "file" : "files"}`
    console.log(`  ${l.question}`)
    console.log(`    → ${`${l.tool}()`.padEnd(20)}`
      + `${files.padStart(8)}`
      + `  ${fmt(l.tokens).padStart(7)} tokens${flag}`
      + delta(l.tokens, prevL?.tokens))
  }
  console.log(`  ─ total  ${fmt(snap.totals.lookupReads)} reads,`
    + ` ${fmt(snap.totals.lookupTokens)} tokens`
    + delta(snap.totals.lookupTokens, prev?.totals?.lookupTokens))

  if (snap.mcp && !snap.mcp.error) {
    const m = snap.mcp
    console.log(`\nMCP — the same questions, answered by the tool layer`)
    console.log(`  tool surface (${m.tools} tools, added to ambient)`
      + `  ${fmt(m.surfaceTokens).padStart(7)} tokens`)
    for (const s of m.scenarios) {
      const before = snap.lookups.find((l) => l.id === s.id)
      const saved = before ? before.tokens - s.tokens : 0
      const pct = before?.tokens ? ` ${((saved / before.tokens) * 100).toFixed(0)}%` : ""
      console.log(`    ${s.tool.padEnd(20)}${"1 call".padStart(8)}`
        + `  ${fmt(s.tokens).padStart(7)} tokens`
        + (before ? `   was ${fmt(before.tokens)}${saved > 0 ? ` (−${pct.trim()})` : ""}` : "")
        + (s.error ? "  [ERROR]" : ""))
    }
    const net = snap.totals.lookupTokens - m.totals.lookupTokens - m.surfaceTokens
    console.log(`  ─ lookups ${fmt(snap.totals.lookupReads)} reads/${fmt(snap.totals.lookupTokens)} tok`
      + ` → ${fmt(m.totals.lookupReads)} calls/${fmt(m.totals.lookupTokens)} tok`)
    console.log(`    net of the +${fmt(m.surfaceTokens)} surface: `
      + `${net >= 0 ? "−" : "+"}${fmt(Math.abs(net))} tokens per session's worth of lookups`)
    if (!snap.populated) {
      console.log(`    ⚠ blank seed — the real saving scales with populated data, not this figure.`)
    }
  } else if (snap.mcp?.error) {
    console.log(`\nMCP — probe failed: ${snap.mcp.error}`)
  }

  if (snap.unclassified.length) {
    console.log(`\n  ${snap.unclassified.length} capability file(s) missing category/layer:`)
    for (const rel of snap.unclassified) console.log(`    ${rel}`)
  }
  console.log("")
}

// --------------------------------------------------------------------- main

const args = new Set(process.argv.slice(2))
const snap = build()

if (args.has("--json")) {
  console.log(JSON.stringify(snap, null, 2))
} else {
  let prev = null
  if (args.has("--compare")) {
    const raw = readIfPresent("data/agent-cost.json")
    if (raw) {
      try {
        prev = JSON.parse(raw)
      } catch {
        console.error("baseline unreadable — measuring without comparison")
      }
    } else {
      console.error("no baseline yet — run with --save first")
    }
  }
  print(snap, prev)
}

if (args.has("--save")) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(snap, null, 2)}\n`)
  console.log(`baseline written → data/agent-cost.json\n`)
}
