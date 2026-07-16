#!/usr/bin/env node
/**
 * synclair — scaffold a Synclair clone.
 *
 * Synclair is a foundation you CLONE, not a dependency you install: the source
 * transfers to you, nothing auto-updates. This CLI is just the front door —
 * it clones the mother repo, points `upstream` at it (so `synclair-sync` and
 * call-home work), and hands you the docs for reseeding.
 */
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

const MOTHER_URL = "https://github.com/joshuaiwata/synclair.git"

const HELP = `synclair — a project foundation you clone, not a package you install
https://synclair.dev · https://github.com/joshuaiwata/synclair

Usage:
  npx synclair new <dir>    Clone the foundation into <dir>, ready to reseed

What you get: design tokens, a live component library (shadcn-style registry),
UX docs, and an AI knowledge layer — served by an in-repo hub at /synclair,
built for humans browsing and agents building.

After scaffolding:
  cd <dir>
  npm install && npm run dev          # hub at http://localhost:4100/synclair
  docs/new-project.md                 # the clone IS the project
  docs/existing-project.md            # companion beside an existing app

Updates are opt-in (nothing phones home): npm run call-home, synclair-sync skill.
`

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const [command, target] = process.argv.slice(2)

if (command === "new") {
  if (!target) {
    console.error("Usage: npx synclair new <dir>")
    process.exit(1)
  }
  if (existsSync(target)) {
    console.error(`✗ ${target} already exists — pick a fresh directory.`)
    process.exit(1)
  }
  if (spawnSync("git", ["--version"], { stdio: "ignore" }).status !== 0) {
    console.error("✗ git is required — install git and retry.")
    process.exit(1)
  }

  console.log(`› Cloning the Synclair foundation into ${target}…`)
  run("git", ["clone", MOTHER_URL, target])
  // The clone is YOUR repo: the mother becomes `upstream` (for synclair-sync);
  // `origin` is freed for wherever this project will live.
  run("git", ["-C", target, "remote", "rename", "origin", "upstream"])

  console.log(`
✓ Foundation cloned. The source is yours (GPL-3.0) — next steps:

  cd ${target}
  npm install && npm run dev          # hub at http://localhost:4100/synclair

  New project?      read docs/new-project.md   (reseed brand, identity, knowledge)
  Existing app?     read docs/existing-project.md
  Foundation updates stay opt-in:     npm run call-home

  The mother repo is wired as the 'upstream' remote; add your own 'origin'
  when you create the project's repo.
`)
} else if (!command || command === "help" || command === "--help" || command === "-h") {
  console.log(HELP)
} else if (command === "--version" || command === "-v") {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
  console.log(pkg.version)
} else {
  console.error(`Unknown command "${command}".\n`)
  console.log(HELP)
  process.exit(1)
}
