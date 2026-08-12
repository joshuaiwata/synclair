#!/usr/bin/env node
/**
 * REGISTRATION CHECK for the MCP server — is it actually reachable from where
 * people start their sessions?
 *
 * `--probe` asserts the server runs. `check-mcp-contract.mjs` asserts its tools
 * return real content. Both can pass while every agent in the repo still reads
 * whole files by hand, because neither asks the question this one does:
 * **is the server registered, and would a session launched here find it?**
 *
 * That gap is silent by construction. The router tells agents "not offering
 * those tools? register once" — which asks an agent to notice an *absence*,
 * the one thing agents reliably fail to do. So this makes the absence loud, and
 * `gen-agents-block.mjs` puts the same answer in the router where every session
 * reads it.
 *
 * Three things are checked per registration file:
 *
 *   1. does it exist and name a `synclair` server?
 *   2. does the path it records resolve to a file that is actually there?
 *      (a relative path is resolved from the file's own directory, which is
 *      what the client does)
 *   3. does the server it points at belong to THIS hub? A stale entry left by
 *      an earlier clone resolves fine and serves someone else's catalog.
 *
 * Plus one question no per-file check can answer: the CURRENT working directory.
 * A project-scoped config is read from the launch directory and is never
 * searched for up the tree, so a session started one level above the repo gets
 * nothing while every file on disk looks correct.
 *
 *   node scripts/check-mcp-registration.mjs           report
 *   node scripts/check-mcp-registration.mjs --strict  exit 1 on any problem (CI)
 *   node scripts/check-mcp-registration.mjs --json    machine-readable
 */

import { existsSync, readFileSync, realpathSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { clientsFor, launchDirs, resolveTarget, userScopeFile } from "./lib/topology.mjs"

const HUB_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SERVER_REL = path.join("scripts", "mcp-server.mjs")
const SERVER_ABS = path.join(HUB_ROOT, SERVER_REL)

const args = process.argv.slice(2)
const strict = args.includes("--strict")
const asJson = args.includes("--json")

function readJson(p) {
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

const same = (a, b) => {
  try {
    return realpathSync(a) === realpathSync(b)
  } catch {
    return path.resolve(a) === path.resolve(b)
  }
}

/** Inspect one registration file the way the client would read it. */
function inspect(file, dir) {
  const json = readJson(file)
  if (!json) return { state: "missing" }
  const entry = json.mcpServers?.synclair
  if (!entry) return { state: "absent", note: "file exists but registers no synclair server" }

  const recorded = Array.isArray(entry.args) ? entry.args[0] : null
  if (!recorded) return { state: "broken", note: "entry has no server path" }

  const resolved = path.isAbsolute(recorded) ? recorded : path.resolve(dir, recorded)
  if (!existsSync(resolved)) return { state: "broken", note: `path does not resolve: ${recorded}` }
  if (!same(resolved, SERVER_ABS)) {
    return { state: "foreign", note: `points at another hub: ${resolved}` }
  }
  return { state: "ok", path: recorded }
}

const { hostRoot, mode } = resolveTarget(HUB_ROOT)
const dirs = hostRoot ? launchDirs(HUB_ROOT, hostRoot) : []
const results = clientsFor(dirs).map((c) => ({ ...c, ...inspect(c.file, c.dir) }))

// User scope — launch-directory independent, so it rescues every case below.
const userFile = userScopeFile()
const userResult = { label: "Claude Code (user scope)", file: userFile, ...inspect(userFile, path.dirname(userFile)) }

/**
 * The launch-directory question. `cwd` is where this was run from, which for a
 * developer is usually where they also start their agent.
 */
const cwd = process.cwd()
const cwdCovered =
  inspect(path.join(cwd, ".mcp.json"), cwd).state === "ok" || userResult.state === "ok"

const anyOk = results.some((r) => r.state === "ok") || userResult.state === "ok"

/**
 * What `--strict` fails on, and what it only mentions.
 *
 * FAIL — never installed at all, or an entry that is actively wrong (a path
 * that doesn't resolve, or one pointing at a different hub). Both mean an agent
 * gets nothing or, worse, someone else's catalog.
 *
 * WARN — a client that was simply never written (not every team uses Cursor),
 * and the launch-directory question. `verify-ui` runs from the hub root, which
 * in embedded mode is correctly NOT a launch directory, so failing on that
 * would fail every properly installed clone.
 */
const wrong = results.filter((r) => r.state === "broken" || r.state === "foreign")
const problems = results.filter((r) => r.state !== "ok")
const failing = !anyOk || wrong.length > 0

if (asJson) {
  console.log(
    JSON.stringify({ mode, hostRoot, results, userScope: userResult, cwd, cwdCovered, failing }, null, 2)
  )
  process.exit(strict && failing ? 1 : 0)
}

const MARK = { ok: "ok", missing: "MISSING", absent: "MISSING", broken: "BROKEN", foreign: "FOREIGN" }

console.log(`topology: ${mode}`)
console.log(`hub:      ${HUB_ROOT}`)
console.log("")
for (const r of results) {
  const where = hostRoot ? path.relative(hostRoot, r.file) || r.file : r.file
  console.log(`  ${MARK[r.state].padEnd(8)} ${r.label.padEnd(22)} ${where}${r.note ? `  — ${r.note}` : ""}`)
}
console.log(
  `  ${MARK[userResult.state].padEnd(8)} ${userResult.label.padEnd(22)} ~/.claude.json`
  + `${userResult.note ? `  — ${userResult.note}` : ""}`
)

if (!anyOk) {
  console.log("")
  console.log("  The MCP server is not registered anywhere. Every agent in this repo is")
  console.log("  reading catalog and knowledge files by hand instead of asking for them.")
  console.log("")
  console.log("    npm run mcp:install")
} else if (!cwdCovered) {
  console.log("")
  console.log(`  Registered, but NOT from where this was run:`)
  console.log(`    ${cwd}`)
  console.log("")
  console.log("  A project-scoped config is read from the session's launch directory and is")
  console.log("  never searched for up the tree, so a session started here gets no tools even")
  console.log("  though the files above are correct. Either start the agent in a directory")
  console.log("  listed above, or register once at user scope, which ignores launch directory:")
  console.log("")
  console.log("    npm run mcp:install -- --user")
}

if (problems.length && anyOk) {
  console.log("")
  console.log(`  ${problems.length} registration file(s) need attention — re-run: npm run mcp:install`)
}

if (anyOk && cwdCovered && !problems.length) {
  console.log("")
  console.log("  Registered and reachable from here. Restart the agent client if it was")
  console.log("  already running when this was written.")
}

process.exit(strict && failing ? 1 : 0)
