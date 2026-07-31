#!/usr/bin/env node
/**
 * REGISTER the Synclair MCP server with the agent tools in a HOST repo.
 *
 * Shipping the server costs nothing — it's a committed script that arrives with
 * the clone. Registering it is the only step that varies, and it varies by
 * TOPOLOGY (`docs/setup-modes.md`):
 *
 *   embedded — the clone lives INSIDE the product repo (e.g. <host>/synclair).
 *   The host's `.mcp.json` gets a repo-relative path, so it can be COMMITTED and
 *   every teammate and agent picks it up on clone with no setup at all.
 *
 *   watcher — the clone sits BESIDE the product. The path crosses a repo
 *   boundary and differs per machine, so the entry is written with an absolute
 *   path and the file is left for the user to gitignore. Committing a path that
 *   only resolves on one laptop is worse than not committing it.
 *
 * Deliberately NOT run from `postinstall`. Writing into a repo's own
 * `.mcp.json` is fair — it's project scope, visible in git, and the client asks
 * before trusting it. Writing into a user's global agent config as a side
 * effect of `npm install` would be invisible and hard to undo, so this only
 * ever touches the target repo, and only when a human runs it.
 *
 *   node scripts/mcp-install.mjs --print          # show what would be written
 *   node scripts/mcp-install.mjs                  # write it (target from setup.json)
 *   node scripts/mcp-install.mjs --host ../app    # explicit host repo
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HUB_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SERVER_REL = path.join("scripts", "mcp-server.mjs")

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : (args[i + 1] ?? "")
}
const has = (name) => args.includes(name)

function readJson(p) {
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, "utf8"))
  } catch (e) {
    console.error(`unreadable: ${p} — ${e instanceof Error ? e.message : e}`)
    return null
  }
}

/**
 * Work out where the product repo is and how this clone sits relative to it.
 * `data/setup.json` records the topology; an explicit `--host` always wins.
 */
function resolveTarget() {
  const explicit = flag("--host")
  const setup = readJson(path.join(HUB_ROOT, "data", "setup.json")) ?? {}

  if (explicit) {
    const hostRoot = path.resolve(process.cwd(), explicit)
    return { hostRoot, mode: setup.mode ?? "explicit" }
  }

  // Embedded: the clone is a subdirectory of the product repo.
  if (setup.mode === "embedded") {
    return { hostRoot: path.dirname(HUB_ROOT), mode: "embedded" }
  }

  // Watcher: the host path is recorded by intake; fall back to asking.
  if (setup.mode === "watcher") {
    const hostRel = setup.hostRoot ?? setup.host?.root
    if (!hostRel) return { hostRoot: null, mode: "watcher" }
    return { hostRoot: path.resolve(HUB_ROOT, hostRel), mode: "watcher" }
  }

  // No mode recorded — this clone IS the project (standalone / new-project).
  return { hostRoot: HUB_ROOT, mode: setup.mode ?? "standalone" }
}

const { hostRoot, mode } = resolveTarget()

if (!hostRoot) {
  console.error(
    `Topology is "watcher" but data/setup.json records no host path.\n`
    + `Re-run with an explicit target:  node scripts/mcp-install.mjs --host ../your-app`
  )
  process.exit(1)
}

/**
 * Embedded and standalone can use a repo-relative path (committable). Watcher
 * crosses a repo boundary, so it must be absolute and must not be committed.
 */
const embeddedish = mode === "embedded" || mode === "standalone" || hostRoot === HUB_ROOT
const serverPath = embeddedish
  ? path.relative(hostRoot, path.join(HUB_ROOT, SERVER_REL)) || SERVER_REL
  : path.join(HUB_ROOT, SERVER_REL)

const entry = { command: "node", args: [serverPath], env: {} }
const targetFile = path.join(hostRoot, ".mcp.json")

if (has("--print")) {
  console.log(`topology:  ${mode}`)
  console.log(`hub:       ${HUB_ROOT}`)
  console.log(`host repo: ${hostRoot}`)
  console.log(`target:    ${targetFile}`)
  console.log(`committable: ${embeddedish ? "yes — relative path" : "no — absolute path, gitignore it"}`)
  console.log(`\n${JSON.stringify({ mcpServers: { synclair: entry } }, null, 2)}`)
  process.exit(0)
}

// Merge, never clobber: a host repo may already register other MCP servers.
const existing = readJson(targetFile) ?? {}
const servers = { ...(existing.mcpServers ?? {}) }
const had = Boolean(servers.synclair)
servers.synclair = entry

writeFileSync(targetFile, `${JSON.stringify({ ...existing, mcpServers: servers }, null, 2)}\n`)

console.log(`${had ? "updated" : "registered"} "synclair" in ${targetFile}`)
console.log(`  topology: ${mode}`)
console.log(`  server:   ${serverPath}`)
if (!embeddedish) {
  console.log(
    `\n  This path is absolute and machine-specific — add .mcp.json to the host's\n`
    + `  .gitignore rather than committing it.`
  )
}
console.log(`\n  Restart the agent client to pick it up. Verify with:`)
console.log(`    node ${path.join(HUB_ROOT, SERVER_REL)} --probe`)
