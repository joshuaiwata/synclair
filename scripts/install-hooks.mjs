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

const HUB_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
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
const block = [
  START,
  `# Reports drifted Synclair digests after a commit. Never regenerates (that`,
  `# needs an agent) and never fails the commit. Managed by scripts/install-hooks.mjs.`,
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

console.log(
  `post-commit hook ${s === -1 ? "installed" : "updated"} → ${hookPath}\n`
  + `  Reports drifted digests after a commit. Silent when everything is current.\n`
  + `  It never regenerates and never fails a commit.\n`
  + `  Remove with: node scripts/install-hooks.mjs --remove`
)
