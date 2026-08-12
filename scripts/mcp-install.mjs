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
 *   node scripts/mcp-install.mjs --user           # + Claude Code user scope
 *   node scripts/mcp-install.mjs --codex          # + Codex user scope
 *
 * Verify afterwards with `npm run check:mcp`, which is the half this script
 * cannot do for itself: whether a session launched from a given directory would
 * actually find what was written.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  clientsFor,
  isEmbeddedish,
  launchDirs,
  resolveTarget,
  scriptPathFor,
  userScopeFile,
} from "./lib/topology.mjs"

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
 * Where the product repo is, and how this clone sits relative to it, now lives
 * in `scripts/lib/topology.mjs` — shared with `install-agent-hooks.mjs`, which
 * needs the identical answer. Same reasoning that extracted `host-walk.mjs`:
 * the second copy is the moment to extract, because the third guarantees drift.
 */
const { hostRoot, mode, inferred } = resolveTarget(HUB_ROOT, flag("--host"))

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
const embeddedish = isEmbeddedish(HUB_ROOT, hostRoot, mode)
const serverPath = scriptPathFor(HUB_ROOT, hostRoot, mode, SERVER_REL)

const entry = { command: "node", args: [serverPath], env: {} }

/**
 * One server, three clients, three different mechanisms — a team is rarely all
 * on one tool, and a registration that only covers Claude Code silently leaves
 * everyone else reading whole files.
 *
 *   Claude Code  <host>/.mcp.json        project-scoped, COMMITTABLE
 *   Cursor       <host>/.cursor/mcp.json project-scoped, COMMITTABLE
 *   Codex        ~/.codex/config.toml    USER-GLOBAL — no project-scoped file
 *                                        exists, so it can't be committed and
 *                                        every developer runs it once.
 *
 * The first two land on `git pull`. Codex is opt-in via `--codex` because it
 * writes outside the repo, into a file the user owns.
 */
/**
 * Where to write them is `launchDirs` in scripts/lib/topology.mjs — shared with
 * the registration check, so "where it was installed" and "where it is looked
 * for" can never disagree.
 *
 * (Repowise avoids this by shipping a binary on PATH, so its config is just
 * `repowise mcp` with no path to resolve. Synclair's server is deliberately
 * anchored to its own location so it always serves ITS hub — the trade is that
 * the config names a path, so the paths have to be right in each place.)
 */
const CLIENTS = clientsFor(launchDirs(HUB_ROOT, hostRoot))

/** TOML block for Codex, marker-delimited so re-running replaces rather than repeats. */
const CODEX_START = "# >>> synclair >>>"
const CODEX_END = "# <<< synclair <<<"
function codexBlock() {
  // Codex spawns from the user's home, not the repo — the path must be absolute
  // whatever the topology says.
  const absServer = path.join(HUB_ROOT, SERVER_REL)
  return [
    CODEX_START,
    "[mcp_servers.synclair]",
    'command = "node"',
    `args = ["${absServer}"]`,
    CODEX_END,
  ].join("\n")
}

if (has("--print")) {
  console.log(`topology:  ${mode}${inferred ? " (inferred — not yet recorded in data/setup.json)" : ""}`)
  console.log(`hub:       ${HUB_ROOT}`)
  console.log(`host repo: ${hostRoot}`)
  console.log(`committable: ${embeddedish ? "yes — relative path" : "no — absolute path, gitignore it"}`)
  for (const c of CLIENTS) console.log(`  ${c.label.padEnd(12)} → ${path.relative(hostRoot, c.file)}`)
  console.log(`  ${"Codex".padEnd(12)} → ${path.join(process.env.HOME ?? "~", ".codex/config.toml")} (--codex)`)
  console.log(`\n${JSON.stringify({ mcpServers: { synclair: entry } }, null, 2)}`)
  console.log(`\n${codexBlock()}`)
  process.exit(0)
}

for (const client of CLIENTS) {
  // Merge, never clobber: a host repo may already register other MCP servers.
  const existing = readJson(client.file) ?? {}
  const servers = { ...(existing.mcpServers ?? {}) }
  const had = Boolean(servers.synclair)
  // Relative to THIS directory — apps/prototype needs ../../synclair/…
  const fromHere = embeddedish
    ? path.relative(client.dir, path.join(HUB_ROOT, SERVER_REL))
    : path.join(HUB_ROOT, SERVER_REL)
  servers.synclair = { ...entry, args: [fromHere] }
  mkdirSync(path.dirname(client.file), { recursive: true })
  writeFileSync(client.file, `${JSON.stringify({ ...existing, mcpServers: servers }, null, 2)}\n`)
  console.log(`  ${had ? "updated" : "registered"} ${client.label.padEnd(12)} ${path.relative(hostRoot, client.file)}  →  ${fromHere}`)
}

/**
 * USER-SCOPE registration for Claude Code.
 *
 * The repo-scoped files above are read from the session's launch directory, so
 * they do nothing for a session started somewhere else — above the repo, or in
 * a folder that holds several repos. That failure is silent: the agent simply
 * never sees the tools and falls back to reading files, which is the expensive
 * path the router warns about.
 *
 * User scope is launch-directory independent, so it covers that case. Opt-in,
 * for the same reason `--codex` is: it writes outside the repo, into a file the
 * user owns. The path must be absolute whatever the topology says.
 */
if (has("--user")) {
  const userFile = userScopeFile()
  const existing = readJson(userFile) ?? {}
  const servers = { ...(existing.mcpServers ?? {}) }
  const had = Boolean(servers.synclair)
  servers.synclair = { command: "node", args: [path.join(HUB_ROOT, SERVER_REL)], env: {} }
  mkdirSync(path.dirname(userFile), { recursive: true })
  writeFileSync(userFile, `${JSON.stringify({ ...existing, mcpServers: servers }, null, 2)}\n`)
  console.log(`  ${had ? "updated" : "registered"} Claude Code (user scope)  ${userFile}`)
}

if (has("--codex")) {
  const codexFile = path.join(process.env.HOME ?? "", ".codex", "config.toml")
  const current = existsSync(codexFile) ? readFileSync(codexFile, "utf8") : ""
  const s = current.indexOf(CODEX_START)
  const e = current.indexOf(CODEX_END)
  let next
  if (s !== -1 && e !== -1 && e > s) next = current.slice(0, s) + codexBlock() + current.slice(e + CODEX_END.length)
  else if (s !== -1 || e !== -1) {
    console.error("~/.codex/config.toml has only one synclair marker — remove the stray one and re-run.")
    process.exit(1)
  } else next = `${current.replace(/\s*$/, "")}\n\n${codexBlock()}\n`
  mkdirSync(path.dirname(codexFile), { recursive: true })
  writeFileSync(codexFile, next)
  console.log(`registered "synclair" for Codex → ${codexFile}`)
} else {
  console.log(
    `\nCodex users: its MCP config is USER-GLOBAL (~/.codex/config.toml), so it`
    + `\ncannot ship in the repo. Each Codex user runs once:  npm run mcp:install -- --codex`
  )
}

console.log(`\n  topology: ${mode}`)
console.log(`  server:   ${serverPath}`)
if (!embeddedish) {
  console.log(
    `\n  Paths are absolute and machine-specific — gitignore the written files\n`
    + `  rather than committing them.`
  )
}
console.log(`\n  Restart the agent client to pick it up. Verify with:`)
console.log(`    node ${path.join(HUB_ROOT, SERVER_REL)} --probe`)
