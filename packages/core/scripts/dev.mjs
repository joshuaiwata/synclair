#!/usr/bin/env node
/**
 * DEV — the one process (north-star Phase 1: freshness is nobody's job).
 *
 * Wraps `next dev` and keeps the derived layer alive around it:
 *
 *   · boot: if the cache is missing, rebuild it (`scripts/index.mjs`)
 *   · watch: host + hub source changes → debounced full re-index (the cache
 *     is cheap to rebuild whole; incremental bookkeeping isn't worth its bugs)
 *   · keepalive: the PlantUML container is started when Docker has it and it
 *     is down — the reader's "run this command" hint becomes a no-op state
 *
 * The wrapper is TRANSPARENT: stdio is inherited, args pass through
 * (`npm run dev -- -p 4100` works unchanged), signals forward, and the exit
 * code is next's. If any watcher piece fails it logs one line and the dev
 * server keeps running — the hub must never be down because its indexer is.
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, readFileSync, watch } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = process.cwd()
const CACHE = path.join(ROOT, ".synclair", "cache")
const log = (msg) => console.log(`[synclair-dev] ${msg}`)

// ---------------------------------------------------------------- next dev
const nextBin = path.join(ROOT, "node_modules", ".bin", "next")
const child = spawn(nextBin, ["dev", ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: "inherit",
})
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig))
}
child.on("exit", (code, signal) => process.exit(signal ? 0 : (code ?? 0)))

// Everything below is best-effort scenery. One failure = one line, never a crash.
const safely = (label, fn) => {
  try {
    fn()
  } catch (err) {
    log(`${label} unavailable (${err.message ?? err}) — dev server unaffected`)
  }
}

// ------------------------------------------------------------------ index
let indexing = false
let queued = false
function reindex(reason) {
  if (indexing) {
    queued = true
    return
  }
  indexing = true
  const started = Date.now()
  const run = spawn(process.execPath, [path.join(SCRIPTS_DIR, "index.mjs")], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "pipe"],
  })
  let err = ""
  run.stderr.on("data", (d) => (err += d))
  run.on("exit", (code) => {
    indexing = false
    log(
      code === 0
        ? `re-indexed in ${((Date.now() - started) / 1000).toFixed(1)}s (${reason})`
        : `index failed (${reason}) — ${err.split("\n").slice(-2).join(" ")}`
    )
    if (queued) {
      queued = false
      reindex("queued change")
    }
  })
}

safely("initial index", () => {
  if (!existsSync(path.join(CACHE, "digest-freshness.json"))) reindex("cold cache")
})

// The committed-map drift checker retired with the prose/derived split: the
// maps' derived halves live in the cache and the reindex above refreshes them
// on every change — there is no committed file left to drift. Judgment
// staleness (routes without summaries) is the pages-map/codebase-map skills'
// business and surfaces on the freshness board, not here.

// ------------------------------------------------------------------ watch
// Inputs that feed the derived layer: the hub's own sources + each declared
// host root. Recursive fs.watch, with an event-path filter doing the excludes
// (recursive watchers can't skip subtrees natively).
const IGNORE = /(^|[\\/])(node_modules|\.git|\.next|\.synclair|dist|build|out|coverage|\.turbo)([\\/]|$)/
const RELEVANT = /\.(ts|tsx|js|jsx|mjs|css|md|mdx|json|prisma)$/

let timer = null
const onEvent = (base) => (_evt, file) => {
  if (!file) return
  const rel = String(file)
  if (IGNORE.test(rel) || !RELEVANT.test(rel)) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => reindex(`${path.basename(base)}: ${rel}`), 2500)
}

safely("watcher", () => {
  const roots = new Set([path.join(ROOT, "lib"), path.join(ROOT, ".claude", "skills")])
  try {
    const catalog = JSON.parse(readFileSync(path.join(ROOT, "data", "external-catalog.json"), "utf8"))
    for (const h of catalog.hosts ?? []) {
      const abs = path.resolve(ROOT, h.root)
      if (existsSync(abs)) roots.add(abs)
    }
  } catch {
    /* no hosts declared — hub-only watch */
  }
  // Drop roots nested inside another watched root (a "shared" host at the
  // repo root already covers its per-app children).
  const flat = [...roots].filter((r) => ![...roots].some((o) => o !== r && r.startsWith(o + path.sep)))
  for (const r of flat) {
    watch(r, { recursive: true }, onEvent(r))
  }
  log(`watching ${flat.length} root(s) for re-index`)
})

// -------------------------------------------------------------- plantuml
function ensurePlantuml() {
  try {
    const up = execFileSync("docker", ["ps", "--format", "{{.Names}}"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .includes("synclair-plantuml")
    if (up) return
    const exists = execFileSync("docker", ["ps", "-a", "--format", "{{.Names}}"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .includes("synclair-plantuml")
    if (exists) {
      execFileSync("docker", ["start", "synclair-plantuml"], { stdio: "ignore" })
      log("started the PlantUML container")
    }
  } catch {
    /* docker absent or daemon down — the reader's fallback hint still applies */
  }
}
safely("plantuml keepalive", () => {
  ensurePlantuml()
  setInterval(ensurePlantuml, 5 * 60 * 1000).unref()
})
