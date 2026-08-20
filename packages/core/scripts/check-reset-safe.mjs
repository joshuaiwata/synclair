#!/usr/bin/env node
/**
 * Reset-safety check — the blank clone must still BUILD.
 *
 * `scripts/synclair-reset.sh` deletes every file in components/host-previews
 * except registry.tsx (rewritten with neutral fallbacks), because those modules
 * import @host/… paths that exist beside exactly one repo. So foundation code
 * that imports a host-previews module directly — anything other than the
 * registry — compiles fine here and breaks the fresh clone's build days later
 * (found by the first scripted fresh-clone sim: handoff-article importing
 * _proto-tab-frame). Same rule for @host/… imports anywhere outside
 * components/host-previews.
 *
 * The full proof is scripts/sim-fresh-clone.sh (an actual blank build+boot);
 * this is the same class caught statically, at author time, in milliseconds.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = process.cwd()
const SCAN_DIRS = ["app", "components", "lib", "hooks"]
const EXEMPT = path.join("components", "host-previews") // clone-local by design

const failures = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const rel = path.relative(root, full)
    if (rel.startsWith(EXEMPT)) continue
    const st = statSync(full)
    if (st.isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(name)) checkFile(full, rel)
  }
}

function checkFile(full, rel) {
  const src = readFileSync(full, "utf8")
  for (const [lineNo, line] of src.split("\n").entries()) {
    const spec = line.match(/from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/)
    if (!spec) continue
    const target = spec[1] ?? spec[2]
    if (!target) continue
    const inHostPreviews =
      /(^|\/)components\/host-previews\//.test(target) ||
      target.startsWith("./host-previews/") // relative from components/
    if (inHostPreviews && !/host-previews\/registry$/.test(target)) {
      failures.push(
        `${rel}:${lineNo + 1} imports "${target}" — synclair-reset deletes every host-previews file except registry.tsx, so a blank clone cannot build this. Import the capability from "@/components/host-previews/registry" instead (add a neutral fallback to the blank registry in synclair-reset.sh if the registry doesn't export it yet).`
      )
    }
    if (target.startsWith("@host/")) {
      failures.push(
        `${rel}:${lineNo + 1} imports "${target}" — @host/… paths exist beside exactly one repo and never survive a reset. Only components/host-previews/ may import them; put the host-facing piece there and expose it through the registry.`
      )
    }
  }
}

for (const dir of SCAN_DIRS) {
  try {
    statSync(path.join(root, dir))
  } catch {
    continue
  }
  walk(path.join(root, dir))
}

// The other half of reset safety: every SEED file must be covered by the
// reset script, or a fresh clone ships the previous project's data. Found by
// the C5 intake drill — lib/system/seed/token-systems.ts (1,200 lines of one
// project's brand) survived a reset because the seed inventory grew after the
// reset script was written. Name-in-script is the contract; a new seed file
// that reset shouldn't touch still gets named, in a comment, deliberately.
const seedDir = path.join(root, "lib", "system", "seed")
const resetSrc = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "synclair-reset.sh"), "utf8")
for (const name of readdirSync(seedDir)) {
  if (!/\.(ts|tsx)$/.test(name)) continue
  if (!resetSrc.includes(name.replace(/\.(ts|tsx)$/, ""))) {
    failures.push(
      `lib/system/seed/${name} is not mentioned by scripts/synclair-reset.sh — a fresh clone would ship this project's data. Add a blanking heredoc for it (or name it in a comment if reset genuinely must not touch it).`
    )
  }
}

// Embedded-mode armor: the hub MUST ship its own middleware.ts. With
// turbopack.root pointed at the host repo, Next otherwise adopts the HOST'S
// root middleware — its auth guards wrap the hub and host-only deps kill the
// build (found intaking a host whose root middleware imports its auth stack).
let middlewareSrc = ""
try {
  middlewareSrc = readFileSync(path.join(root, "middleware.ts"), "utf8")
} catch {
  /* missing — flagged below */
}
if (!middlewareSrc.includes("Deliberate no-op")) {
  failures.push(
    "middleware.ts must remain the hub's deliberate no-op — deleting or repurposing it lets Next adopt the HOST repo's root middleware in embedded mode (see the file's header)."
  )
}

if (failures.length) {
  console.error(`check:reset-safe — ${failures.length} import(s) a blank clone cannot resolve:\n`)
  for (const f of failures) console.error(`  ${f}\n`)
  process.exit(1)
}
console.log("check:reset-safe — foundation imports survive a reset (host-previews only via registry).")
