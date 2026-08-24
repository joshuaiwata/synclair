#!/usr/bin/env node
/**
 * INSTALL a post-commit hook that MARKS the hub's digests stale — and nothing more.
 *
 * The obvious version of this regenerates on commit. Synclair can't: several
 * artifacts still need an agent to write their prose (that's what Phase 3 is
 * chipping away at), and firing an agent run on every commit would be both
 * expensive and astonishing. Even once scanners cover everything, rebuilding
 * during someone's commit is the wrong moment.
 *
 * So the hook only *reports*. It runs `check:freshness`, says nothing at all
 * when everything is current, and prints one line when something drifted. The
 * expensive part stays a deliberate act.
 *
 * Properties that matter for a hook nobody asked for:
 *
 *   MARKER-DELIMITED — an existing post-commit hook (linters, formatters,
 *   other tools) is preserved; our block is appended between markers and
 *   replaced in place on re-install.
 *   SILENT WHEN CLEAN — a hook that prints on every commit gets uninstalled.
 *   NEVER FAILS A COMMIT — the commit already happened; exiting non-zero from
 *   post-commit only produces noise. Every path exits 0.
 *
 *   node scripts/install-hooks.mjs            install / update
 *   node scripts/install-hooks.mjs --print    show what would be written
 *   node scripts/install-hooks.mjs --remove   take it back out
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HUB_ROOT = process.cwd() // the hub root is the CALLER'S cwd (the CLI guarantees it) — never derived from import.meta.url, which points into the core package
const START = "# >>> synclair freshness >>>"
const END = "# <<< synclair freshness <<<"

const args = process.argv.slice(2)

function gitDir() {
  try {
    const out = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: HUB_ROOT,
      encoding: "utf8",
    }).trim()
    return path.resolve(HUB_ROOT, out)
  } catch {
    return null
  }
}

const gd = gitDir()
if (!gd) {
  console.error("Not a git repository (or git unavailable) — nothing to install into.")
  process.exit(1)
}

const hooksDir = path.join(gd, "hooks")
const hookPath = path.join(hooksDir, "post-commit")

/**
 * The hook body. Uses the hub's absolute path so it works regardless of where
 * the commit was made from — in embedded topology the git root is the PRODUCT
 * repo, not the hub, so a relative path would break.
 */
/**
 * `--refresh` — actually re-index on commit, instead of only reporting.
 *
 * The default stays report-only, and the reasoning at the top of this file is
 * still right about PROSE: no hook should fire a model. But it was written when
 * the scanners could not write anything at all, and that is no longer true.
 * `scan:system --write` is deterministic, additive, offline, and finishes in
 * about a quarter of a second — it appends the mechanical row for an endpoint
 * it can see and never touches authored text. That is safe on a commit in a way
 * an agent run never will be.
 *
 * Opt-in rather than default because it writes files in the developer's working
 * tree, right after they committed — a real surprise if you did not ask for it.
 * The refreshed digests are left UNSTAGED on purpose: the hook's job is to make
 * them current, and whether they ride along in the next commit is the
 * developer's call, not a hook's.
 *
 *   npm run install:hooks              report drift only (default)
 *   npm run install:hooks -- --refresh re-index the deterministic digests too
 */
const refresh = args.includes("--refresh")

const refreshLines = refresh
  ? [
      `# Re-index the deterministic digests. No model, no network, ~0.3s. Leaves`,
      `# the refreshed files unstaged — making them current is the hook's job;`,
      `# committing them is yours.`,
      `if [ -f "${path.join(HUB_ROOT, "scripts", "scan-system.mjs")}" ]; then`,
      `  ( cd "${HUB_ROOT}" && node scripts/scan-system.mjs --write >/dev/null 2>&1`,
      `    node scripts/scan-contracts.mjs --write >/dev/null 2>&1 ) || true`,
      `fi`,
    ]
  : []

const block = [
  START,
  refresh
    ? `# Re-indexes the deterministic Synclair digests after a commit, then reports`
    : `# Reports drifted Synclair digests after a commit. Never regenerates (that`,
  refresh
    ? `# anything left drifting. Never runs a model, never fails the commit.`
    : `# needs an agent) and never fails the commit. Managed by scripts/install-hooks.mjs.`,
  ...refreshLines,
  `if [ -f "${path.join(HUB_ROOT, "scripts", "check-freshness.mjs")}" ]; then`,
  `  _sc_out=$(cd "${HUB_ROOT}" && node scripts/check-freshness.mjs --json 2>/dev/null \\`,
  `    | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{`,
  `      const a=JSON.parse(d).artifacts.filter(x=>x.state==="stale");`,
  `      if(a.length)console.log("synclair: "+a.map(x=>x.artifact).join(", ")+" drifted — cd synclair && npm run refresh");`,
  `    }catch{}})' 2>/dev/null)`,
  `  [ -n "$_sc_out" ] && echo "$_sc_out"`,
  `fi`,
  `exit 0`,
  END,
].join("\n")

if (args.includes("--print")) {
  console.log(`target: ${hookPath}\n`)
  console.log(block)
  process.exit(0)
}

const existing = existsSync(hookPath) ? readFileSync(hookPath, "utf8") : null
const s = existing?.indexOf(START) ?? -1
const e = existing?.indexOf(END) ?? -1

if (args.includes("--remove")) {
  if (!existing || s === -1 || e === -1) {
    console.log("No synclair block in post-commit — nothing to remove.")
    process.exit(0)
  }
  const cleaned = (existing.slice(0, s) + existing.slice(e + END.length)).replace(/\n{3,}/g, "\n\n")
  writeFileSync(hookPath, cleaned)
  console.log(`Removed the synclair block from ${hookPath} (other hook content kept).`)
  process.exit(0)
}

mkdirSync(hooksDir, { recursive: true })

let next
if (existing === null) {
  next = `#!/bin/sh\n\n${block}\n`
} else if (s !== -1 && e !== -1 && e > s) {
  next = existing.slice(0, s) + block + existing.slice(e + END.length)
} else if (s !== -1 || e !== -1) {
  console.error(
    "post-commit has only one of the two synclair markers — refusing to guess.\n"
    + "Remove the stray marker and re-run."
  )
  process.exit(1)
} else {
  // Someone else's hook already lives here; append, never replace.
  next = `${existing.replace(/\s*$/, "")}\n\n${block}\n`
}

writeFileSync(hookPath, next)
chmodSync(hookPath, 0o755)

/**
 * Register the merge driver `.gitattributes` names.
 *
 * Git will not run a driver it was only told about in a tracked file — that
 * would let any clone execute code on merge — so every developer configures it
 * once, locally. Doing it here means "I set Synclair up" is one command rather
 * than one command plus a line in a README nobody reads, and an unregistered
 * driver degrades to a normal conflict rather than breaking anything.
 */
let driver = "not registered"
try {
  execFileSync("git", [
    "config", "merge.synclair-digest.name",
    "Synclair derived digests — union both sides, re-anchor on the next scan",
  ])
  execFileSync("git", [
    "config", "merge.synclair-digest.driver",
    `node ${path.join(HUB_ROOT, "scripts", "merge-digest.mjs")} %O %A %B %P`,
  ])
  driver = "registered"
} catch {
  // Not fatal: without it, a digest conflict is an ordinary conflict.
}

console.log(
  `post-commit hook ${s === -1 ? "installed" : "updated"} → ${hookPath}\n`
  + (refresh
    ? `  Re-indexes the deterministic digests after each commit (~0.3s, no model),\n`
      + `  leaves them unstaged, then reports anything still drifting.\n`
    : `  Reports drifted digests after a commit. Silent when everything is current.\n`
      + `  It never regenerates and never fails a commit.\n`)
  + `  Merge driver for data/*.json: ${driver}.\n`
  + `  Remove with: node scripts/install-hooks.mjs --remove`
)
