#!/usr/bin/env node
/**
 * INDEX — rebuild the derived cache, whole, in one idempotent command.
 *
 * Phase 1 of docs/north-star.md: derived artifacts left git for
 * `.synclair/cache/` (gitignored). This is the ONE command that rebuilds
 * everything in it that can be derived deterministically — pure Node over the
 * repo, no model, no network, no tokens. Safe on a hook, in CI, or in a loop.
 *
 *   npm run index
 *
 * What it rebuilds:
 *   knowledge/discovery.json   uncovered document-shaped files
 *   contracts.json             frontend→API call links
 *   host-hygiene.json          host foundation-drift findings
 *   rulings.json               design rulings register
 *   digest-freshness.json      the freshness board's artifact states
 *
 * NOT here, deliberately:
 *   knowledge/freshness.json + redistill-queue + prd-sources — network probes
 *   (`npm run check:knowledge`, gh auth); their readers degrade on absence and
 *   an absent probe is honest ("unknown"), a stale one is not.
 *   agent-cost.json — a measured benchmark, run on demand.
 *   system-map / pages-map / external-catalog — MIXED artifacts carrying
 *   written judgment; they stay committed until Phase 2's artifact modules
 *   can split their derived rows from their prose.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = process.cwd()

// tsx may live in the package's own node_modules or hoisted at the hub root.
const resolveTsx = () => {
  const candidates = [
    path.join(SCRIPTS_DIR, "..", "node_modules", ".bin", "tsx"),
    path.join(ROOT, "node_modules", ".bin", "tsx"),
  ]
  for (const c of candidates) if (existsSync(c)) return c
  return "tsx"
}
const CACHE = path.join(ROOT, ".synclair", "cache")

const run = (script, args = []) => {
  try {
    return {
      ok: true,
      out: execFileSync(
        ...(script.endsWith(".ts")
          ? [resolveTsx(), [path.join(SCRIPTS_DIR, script), ...args]]
          : [process.execPath, [path.join(SCRIPTS_DIR, script), ...args]]),
        {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "pipe"],
      }).toString(),
    }
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ""}${err.stderr ?? ""}` }
  }
}

mkdirSync(CACHE, { recursive: true })

const steps = [
  { label: "doc discovery", script: "check-discovery.ts", args: [] },
  { label: "contract links", script: "scan-contracts.mjs", args: ["--write"] },
  { label: "host hygiene", script: "scan-host-hygiene.mjs", args: [] },
  { label: "rulings register", script: "check-rulings.mjs", args: ["--write"] },
]

let failed = 0
for (const s of steps) {
  const res = run(s.script, s.args)
  console.log(`  ${res.ok ? "✓" : "✗"} ${s.label}`)
  if (!res.ok) {
    failed += 1
    console.log(res.out.split("\n").slice(-6).join("\n"))
  }
}

// The freshness board last: it grades the artifacts the steps above just wrote.
const fresh = run("check-freshness.mjs", ["--json"])
if (fresh.ok) {
  const body = fresh.out.endsWith("\n") ? fresh.out : fresh.out + "\n"
  writeFileSync(path.join(CACHE, "digest-freshness.json"), body)
  console.log("  ✓ freshness board")
} else {
  failed += 1
  console.log("  ✗ freshness board")
}

console.log(failed === 0 ? "\nindex: cache rebuilt." : `\nindex: ${failed} step(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
