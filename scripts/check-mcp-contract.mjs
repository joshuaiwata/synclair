#!/usr/bin/env node
/**
 * CONTRACT CHECK for the MCP server — do the tools actually populate the fields
 * they promise?
 *
 * `mcp-server.mjs --probe` only asserts that each tool returns without erroring
 * and produces some bytes. That is not enough, and this file exists because it
 * wasn't: the server was written against *assumed* field names rather than the
 * schemas in lib/system/, so on a real clone it returned `path: undefined` for
 * 145/145 catalogued components and `name`/`linksTo: undefined` for 51/51 pages.
 * Every probe passed the whole time — the shape was right and the content was
 * empty.
 *
 * So this asserts on CONTENT: for each tool, the fields an agent would actually
 * use must be non-null on at least one returned record. A tool that answers
 * "where does this component live?" with `undefined` is worse than one that
 * errors, because the agent believes it.
 *
 * Runs against whatever data the clone has. On a blank seed most tools have
 * nothing to populate, so expectations are SKIPPED rather than failed — a fresh
 * clone must not fail this.
 *
 *   node scripts/check-mcp-contract.mjs           report
 *   node scripts/check-mcp-contract.mjs --strict  exit 1 on any violation (CI)
 */

import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SERVER = path.join(ROOT, "scripts", "mcp-server.mjs")
const strict = process.argv.includes("--strict")

/**
 * `at` walks into the response to the list of records to check; `fields` are
 * the keys that must be populated on at least one record. Only fields an agent
 * would act on — a missing `surface` on a single-surface project is fine, a
 * missing `path` never is.
 */
const EXPECTATIONS = [
  { tool: "search_library", args: {}, at: (r) => r.items, fields: ["name", "tier", "origin", "path"] },
  { tool: "get_page", args: {}, at: (r) => r.pages, fields: ["route", "name"] },
  { tool: "get_system", args: { section: "api" }, at: (r) => r.api, fields: ["path"] },
  { tool: "get_knowledge", args: {}, at: (r) => r.sources, fields: ["id", "title"] },
  { tool: "get_foundation", args: {}, at: (r) => r.tokens, fields: ["name", "value", "usage"] },
]

function call(tool, args) {
  const msgs = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {} } },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: args } },
  ]
  const proc = spawnSync(process.execPath, [SERVER], {
    input: `${msgs.map((m) => JSON.stringify(m)).join("\n")}\n`,
    encoding: "utf8",
  })
  if (proc.status !== 0) return { error: proc.stderr?.trim() || "server exited non-zero" }
  for (const line of (proc.stdout ?? "").trim().split("\n")) {
    try {
      const m = JSON.parse(line)
      if (m.id === 2) {
        if (m.result?.isError) return { error: m.result.content[0].text }
        return { data: JSON.parse(m.result.content[0].text) }
      }
    } catch {
      return { error: "unparseable reply (truncated?)" }
    }
  }
  return { error: "no reply" }
}

const results = []
for (const exp of EXPECTATIONS) {
  const { data, error } = call(exp.tool, exp.args)
  if (error) {
    results.push({ tool: exp.tool, state: "error", detail: error })
    continue
  }
  const records = exp.at(data)
  if (!Array.isArray(records) || records.length === 0) {
    // Nothing to check is not a failure — a blank clone has no data.
    results.push({ tool: exp.tool, state: "skipped", detail: "no records (blank seed?)" })
    continue
  }
  const empty = exp.fields.filter((f) => records.every((r) => r?.[f] === undefined || r?.[f] === null))
  const partial = exp.fields.filter(
    (f) => !empty.includes(f) && records.some((r) => r?.[f] === undefined || r?.[f] === null)
  )
  results.push({
    tool: exp.tool,
    state: empty.length ? "violation" : "ok",
    records: records.length,
    empty,
    partial,
  })
}

console.log("\nMCP contract — are the promised fields actually populated?\n")
for (const r of results) {
  if (r.state === "skipped") {
    console.log(`  skip   ${r.tool.padEnd(16)} ${r.detail}`)
  } else if (r.state === "error") {
    console.log(`  ERROR  ${r.tool.padEnd(16)} ${r.detail}`)
  } else if (r.state === "violation") {
    console.log(`  FAIL   ${r.tool.padEnd(16)} ${r.records} records · always null: ${r.empty.join(", ")}`)
    if (r.partial.length) console.log(`         ${" ".repeat(16)} sometimes null: ${r.partial.join(", ")}`)
  } else {
    console.log(
      `  ok     ${r.tool.padEnd(16)} ${r.records} records`
      + (r.partial.length ? ` · sometimes null: ${r.partial.join(", ")}` : "")
    )
  }
}

const bad = results.filter((r) => r.state === "violation" || r.state === "error")
console.log(
  bad.length
    ? `\n  ${bad.length} tool(s) returning empty fields. An agent believes these answers —`
      + `\n  a null path is worse than an error, because nothing signals it's wrong.\n`
    : "\n  Every checked field is populated on at least one record.\n"
)

process.exit(strict && bad.length ? 1 : 0)
