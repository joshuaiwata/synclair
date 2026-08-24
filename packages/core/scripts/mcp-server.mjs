#!/usr/bin/env node
/**
 * SYNCLAIR MCP SERVER — the stdio transport for the hub's MCP tools.
 *
 * The hub at `/synclair` is the HUMAN view of Synclair's knowledge; this is the
 * agent view of the same data, for MCP clients working in a clone. All of the
 * substance — the tool registry (core + extension-contributed), the data
 * readers, the JSON-RPC dispatcher — lives in `scripts/mcp-tools.mjs`, shared
 * byte-for-byte with the hosted HTTP transport (`app/api/mcp/route.ts`). This
 * file only frames newline-delimited JSON-RPC over stdin/stdout.
 *
 *   node scripts/mcp-server.mjs           # serve (stdio; for an MCP client)
 *   node scripts/mcp-server.mjs --probe   # self-test: list tools + call each
 */

// tsx's loader is registered BEFORE loading the tools, which import TS
// artifact modules (B3). This keeps every existing registration and script
// running the server as plain `node scripts/mcp-server.mjs`.
import { register as registerTsx } from "tsx/esm/api"
registerTsx()

// An MCP client launches this from ITS OWN directory — for the project-scoped
// `.mcp.json` that is the REPO root, not the hub — and the tools capture the
// hub root from cwd at import time. Anchoring here is what stops every tool
// answering from the wrong root: it read as a hub that simply knew nothing
// (zero components, zero pages, "unanchored"), which is indistinguishable from
// a blank clone and so never looked like a failure. No-op when the caller was
// already in the hub.
import { hubRoot } from "./lib/hub-root.mjs"
process.chdir(hubRoot())

const { HUB_ROOT, allTools, callTool, handle } = await import("./mcp-tools.mjs")

function serve() {
  let buffer = ""
  // Replies must leave in arrival order even though handlers are async —
  // chain them rather than letting a fast tool overtake a slow one.
  let chain = Promise.resolve()
  process.stdin.setEncoding("utf8")
  process.stdin.on("data", (chunk) => {
    buffer += chunk
    let nl
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      chain = chain.then(async () => {
        let reply
        try {
          reply = await handle(JSON.parse(line))
        } catch (e) {
          reply = {
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32700,
              message: `Parse error: ${e instanceof Error ? e.message : e}`,
            },
          }
        }
        if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`)
      })
    }
  })
  // Deliberately NO process.exit() here. stdout is a pipe, and exit() discards
  // whatever is still buffered — which silently TRUNCATES large replies mid-JSON.
  // With stdin ended and no work left, the event loop empties and Node exits on
  // its own, after the writes have flushed.
  //
  // The flush matters: a client that writes a message without a trailing
  // newline and closes (`printf '{...}' | node mcp-server.mjs`) left the whole
  // request sitting in `buffer`, and the server exited 0 having answered
  // nothing.
  process.stdin.on("end", () => {
    const line = buffer.trim()
    buffer = ""
    if (!line) return
    chain = chain.then(async () => {
      let reply
      try {
        reply = await handle(JSON.parse(line))
      } catch (e) {
        reply = {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32700,
            message: `Parse error: ${e instanceof Error ? e.message : e}`,
          },
        }
      }
      if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`)
    })
  })
}

/**
 * Self-test: exercises every tool without an MCP client. Tools whose schema
 * requires input get representative arguments here — keep this map in step
 * when adding a tool with required fields. Extension tools that need config
 * may answer with their unconfigured state; that still counts as answering.
 */
const PROBE_ARGS = {
  get_component: { name: "status-badge" },
  search_all: { query: "account" },
}

async function probe() {
  const names = Object.keys(allTools())
  const out = [`hub root: ${HUB_ROOT}`, `tools:    ${names.length}`, ""]
  let total = 0
  for (const name of names) {
    const res = await callTool(name, PROBE_ARGS[name] ?? {})
    const size = res.content[0].text.length
    total += size
    const state = res.isError ? "ERROR" : "ok"
    out.push(
      `  ${name.padEnd(24)} ${state.padEnd(6)} ${String(size).padStart(6)} chars`
    )
    if (res.isError) out.push(`    ${res.content[0].text}`)
  }
  // The point of the layer: what a shaped answer costs vs opening files whole.
  out.push(
    "",
    `  all ${names.length} responses: ${total.toLocaleString()} chars ` +
      `(~${Math.round(total / 3.5).toLocaleString()} est. tokens)`
  )
  console.log(out.join("\n"))
}

if (process.argv.includes("--probe")) probe()
else serve()
