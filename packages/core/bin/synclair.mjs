#!/usr/bin/env node
/**
 * The ONE entry point (north-star: "one entry point, not sixty-three npm
 * scripts"). `synclair <command> [args]` runs the core script of that name
 * from the package, in the CALLER'S working directory — the hub root — which
 * is where every scanner and check resolves data/, the cache, and the app
 * tree. The npm-script names in a hub's package.json stay as muscle-memory
 * aliases onto this.
 *
 *   synclair index            rebuild the derived cache
 *   synclair smoke            walk the running hub
 *   synclair audit-mcp        the adversarial MCP audit
 *   synclair sim-fresh-clone  the blank-clone drill
 *   synclair <any-script>     scripts/<any-script>.{mjs,ts,sh} in the package
 */
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const CORE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const SCRIPTS = path.join(CORE, "scripts")
const [cmd, ...args] = process.argv.slice(2)

const available = () =>
  readdirSync(SCRIPTS)
    .filter((f) => /\.(mjs|ts|sh)$/.test(f) && !f.endsWith(".d.ts"))
    .map((f) => f.replace(/\.(mjs|ts|sh)$/, ""))
    .sort()

if (!cmd || cmd === "--help" || cmd === "help") {
  console.log("synclair <command> [args]\n\nCommands (from @synclair/core):")
  for (const c of available()) console.log("  " + c)
  process.exit(cmd ? 0 : 1)
}

const candidates = [`${cmd}.mjs`, `${cmd}.ts`, `${cmd}.sh`].map((f) => path.join(SCRIPTS, f))
const script = candidates.find((p) => existsSync(p))
if (!script) {
  console.error(`synclair: unknown command "${cmd}". Run \`synclair help\` for the list.`)
  process.exit(1)
}

let runner
if (script.endsWith(".sh")) {
  runner = ["bash", [script, ...args]]
} else if (script.endsWith(".ts")) {
  // tsx is a dependency of this package; resolve its bin relative to us so
  // the caller needs nothing installed globally. The candidates cover every
  // layout core ships in: its own node_modules (isolated install), the hub
  // root's when vendored as packages/core (hoisted two levels up), and the
  // hub root's when installed from the registry (the caller's cwd IS the hub
  // root — the one rule the CLI guarantees).
  const candidates = [
    path.join(CORE, "node_modules", ".bin", "tsx"),
    path.join(CORE, "..", "..", "node_modules", ".bin", "tsx"),
    path.join(process.cwd(), "node_modules", ".bin", "tsx"),
  ]
  runner = [candidates.find((p) => existsSync(p)) ?? "tsx", [script, ...args]]
} else {
  runner = [process.execPath, [script, ...args]]
}

const res = spawnSync(runner[0], runner[1], { stdio: "inherit", cwd: process.cwd() })
process.exit(res.status ?? 1)
