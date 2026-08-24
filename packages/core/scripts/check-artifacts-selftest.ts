#!/usr/bin/env -S npx tsx
/**
 * SELF-TEST for the artifact-module contracts (lib/artifacts/* — battery B2/B3).
 *
 * The whole point of one-owner-per-artifact is WHERE failures land: a writer
 * producing a bad shape must fail in its own run (write validates), and a
 * reader facing garbage must degrade to null, never crash a render. This
 * pins both directions, hermetically, for every migrated artifact module.
 *
 *   npm run check:artifacts-selftest
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { z } from "zod"

import { readArtifact, writeArtifact } from "../lib/artifacts/shared"
import { discoverySchema } from "../lib/artifacts/discovery"
import { freshnessReportSchema, redistillQueueSchema } from "../lib/artifacts/knowledge-freshness"
import { pagesMapWriteSchema } from "../lib/artifacts/pages-map"
import { systemMapWriteSchema } from "../lib/artifacts/system-map"

const tmp = mkdtempSync(path.join(os.tmpdir(), "artifacts-selftest."))
let pass = 0
const failures: string[] = []
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) pass++
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

const schema = z.object({ n: z.number(), tag: z.string() })
const file = path.join(tmp, "nested", "artifact.json")

// 1. Absent file → null (the fresh-clone contract).
ok("absent file reads as null", readArtifact(file, schema) === null)

// 2. Valid write round-trips, creating parent dirs.
writeArtifact(file, schema, { n: 1, tag: "a" })
ok("valid write round-trips", readArtifact(file, schema)?.tag === "a")

// 3. INVALID write throws in the writer's run and leaves the file untouched.
let threw = false
try {
  writeArtifact(file, schema, { n: "not-a-number", tag: "b" })
} catch {
  threw = true
}
ok("invalid write throws", threw)
ok("failed write leaves prior contents", readFileSync(file, "utf8").includes('"a"'))

// 4. Garbage on disk reads as null (with a warn), never a crash.
writeFileSync(file, "{ not json")
ok("garbage reads as null", readArtifact(file, schema) === null)
writeFileSync(file, JSON.stringify({ wrong: "shape" }))
ok("off-schema reads as null", readArtifact(file, schema) === null)

// 5. Per-artifact schemas accept their real shape and refuse a near-miss.
const realDiscovery = {
  checkedAt: "2026-08-20T00:00:00.000Z",
  treesWalked: 2,
  covered: 5,
  uncovered: [{ path: "docs/x.md", dir: "docs", mtime: "2026-08-19" }],
}
ok("discovery schema accepts the real shape", discoverySchema.safeParse(realDiscovery).success)
ok(
  "discovery schema refuses a near-miss",
  !discoverySchema.safeParse({ ...realDiscovery, uncovered: [{ path: 1 }] }).success
)

const realFreshness = {
  checkedAt: "2026-08-20T00:00:00.000Z",
  sources: [
    {
      id: "x", title: "X", kind: "prd", area: "a", host: "github", state: "stale",
      url: "https://example.com", distilledInto: null, distilledAt: null,
      sourceModifiedAt: null, detail: null,
    },
  ],
}
ok("freshness schema accepts the real shape", freshnessReportSchema.safeParse(realFreshness).success)
ok(
  "freshness schema refuses an invented state",
  !freshnessReportSchema.safeParse({
    ...realFreshness,
    sources: [{ ...realFreshness.sources[0], state: "kinda-fresh" }],
  }).success
)
ok(
  "queue schema accepts + refuses",
  redistillQueueSchema.safeParse({ requests: [] }).success &&
    !redistillQueueSchema.safeParse({ requests: [{ sourceId: 1 }] }).success
)

ok(
  "pages-map write contract: route required",
  pagesMapWriteSchema.safeParse({ repo: { root: ".." }, pages: [{ route: "/x" }] }).success &&
    !pagesMapWriteSchema.safeParse({ repo: { root: ".." }, pages: [{ title: "no route" }] }).success
)
ok(
  "pages-map write contract: a pages array required",
  !pagesMapWriteSchema.safeParse({ repo: { root: ".." } }).success
)
ok(
  "system-map write contract: api rows carry method/path/source",
  systemMapWriteSchema.safeParse({
    repo: null, areas: [], api: [{ method: "GET", path: "/x", source: "a.ts" }],
    data: [], jobs: [], integrations: [],
  }).success &&
    !systemMapWriteSchema.safeParse({
      repo: null, areas: [], api: [{ method: "GET", path: "/x" }],
      data: [], jobs: [], integrations: [],
    }).success
)

// 6. THE PROSE/DERIVED SPLIT (Phase-2 leftover). The maps' one-owner modules
// split on write (judgment → committed data/, facts → gitignored cache) and
// merge on read. This is the tripwire for the whole arrangement: prose must
// never land in the cache, churn (stamps, skeletons, composition) must never
// land in git, and the merged read must reconstruct the full map — including
// from a LEGACY mixed committed file that predates the split.
{
  const hub = path.join(tmp, "hub")
  const prevCwd = process.cwd()
  const fresh = async () => {
    rmSync(hub, { recursive: true, force: true })
    const { mkdirSync } = await import("node:fs")
    mkdirSync(hub, { recursive: true })
    process.chdir(hub)
  }
  const readRaw = (rel: string) => JSON.parse(readFileSync(path.join(hub, rel), "utf8"))

  const { writePagesMap, readPagesMapFile } = await import("../lib/artifacts/pages-map")
  const { writeSystemMap, readSystemMapFile } = await import("../lib/artifacts/system-map")

  type LooseRow = Record<string, unknown>
  interface MapView {
    pages?: LooseRow[]
    areas?: LooseRow[]
    api?: LooseRow[]
    repo?: LooseRow | null
  }
  const view = (r: { state: string } & Record<string, unknown>): MapView | null =>
    r.state === "ok" ? (r.value as MapView) : null

  // Pages: a SELF map (repo.root null) — composition is derived → cache.
  await fresh()
  writePagesMap({
    repo: { name: "hub", root: null, commit: "abc123", digestedAt: "2026-08-21T00:00:00Z" },
    routerKind: "next-app",
    pages: [
      {
        id: "x", route: "/x", file: "app/x/page.tsx", kind: "page",
        title: "X", summary: "The X screen.", sourceHash: "h1",
        items: [{ name: "button" }], sourceFiles: ["app/x/page.tsx"],
        previewUrl: "/x", previewable: true,
      },
      { id: "y", route: "/y", file: "app/y/page.tsx", kind: "page", items: [], sourceFiles: ["app/y/page.tsx"] },
    ],
    provenance: { generatedAt: "2026-08-21", generator: "scan:pages" },
  })
  const proseFile = readRaw("data/pages-map.json")
  const cacheFile = readRaw(".synclair/cache/pages-map.json")
  ok(
    "pages split: committed side holds prose only",
    proseFile.pages.length === 1 &&
      proseFile.pages[0].title === "X" &&
      proseFile.pages[0].file === undefined &&
      proseFile.pages[0].items === undefined &&
      proseFile.provenance === undefined &&
      proseFile.repo.commit === undefined &&
      proseFile.repo.digestedAt === undefined
  )
  ok(
    "pages split: cache holds the derived rows + stamps",
    cacheFile.pages.length === 2 &&
      cacheFile.pages[0].file === "app/x/page.tsx" &&
      cacheFile.pages[0].title === undefined &&
      cacheFile.provenance?.generator === "scan:pages" &&
      cacheFile.repo?.commit === "abc123"
  )
  const mp = view(readPagesMapFile())
  const mpx = mp?.pages?.find((p) => p.route === "/x")
  ok(
    "pages merge: full map reconstructs",
    mp?.pages?.length === 2 &&
      mpx?.title === "X" &&
      mpx?.file === "app/x/page.tsx" &&
      mp?.repo?.commit === "abc123" &&
      mp?.repo?.name === "hub"
  )

  // A HOST map keeps agent-resolved composition committed.
  await fresh()
  writePagesMap({
    repo: { name: "host", root: "..", commit: "def456" },
    pages: [{ route: "/r", title: "R", items: [{ name: "card" }], sourceFiles: ["app/r.tsx"] }],
  })
  ok(
    "pages split: host-map composition stays committed",
    readRaw("data/pages-map.json").pages[0].items?.[0]?.name === "card"
  )

  // LEGACY mixed committed file (no cache): reads whole, unchanged.
  await fresh()
  const { mkdirSync } = await import("node:fs")
  mkdirSync(path.join(hub, "data"), { recursive: true })
  writeFileSync(
    path.join(hub, "data", "pages-map.json"),
    JSON.stringify({ repo: { root: null }, pages: [{ route: "/old", title: "Old", file: "app/old.tsx" }] })
  )
  const lv = view(readPagesMapFile())
  ok(
    "pages merge: legacy mixed file reads whole",
    lv?.pages?.[0]?.title === "Old" && lv?.pages?.[0]?.file === "app/old.tsx"
  )

  // System: authored rows stay committed; skeletons (empty summary) → cache;
  // an authored GROUPED row suppresses its inventory skeletons on merge.
  await fresh()
  writeSystemMap({
    repo: { name: "hub", root: "..", commit: "abc", digestedAt: "2026-08-21" },
    areas: [
      { name: "auth", path: "src/auth", summary: "Signs people in." },
      { name: "billing", path: "src/billing", summary: "" },
    ],
    api: [
      { method: "RPC", path: "get_a | get_b", source: "a.ts", summary: "The A/B reads." },
      { method: "GET", path: "/bare", source: "b.ts", summary: "" },
    ],
    data: [], jobs: [], integrations: [],
    provenance: { generatedAt: "2026-08-21", generator: "scan:system" },
  })
  const sysProse = readRaw("data/system-map.json")
  const sysCache = readRaw(".synclair/cache/system-map.json")
  ok(
    "system split: authored rows committed, skeletons cached",
    sysProse.areas.length === 1 &&
      sysProse.api.length === 1 &&
      sysProse.provenance === undefined &&
      sysProse.repo.commit === undefined &&
      sysCache.areas.length === 1 &&
      sysCache.api.length === 1 &&
      sysCache.provenance?.generator === "scan:system"
  )
  const ms = view(readSystemMapFile())
  ok(
    "system merge: full map reconstructs with stamps",
    ms?.areas?.length === 2 && ms?.api?.length === 2 && ms?.repo?.commit === "abc" && ms?.repo?.name === "hub"
  )
  // The grouped-row suppression: an inventory row covered by an authored group
  // must not reappear as a duplicate.
  writeFileSync(
    path.join(hub, ".synclair", "cache", "system-map.json"),
    JSON.stringify({
      areas: [], api: [{ method: "RPC", path: "get_b", source: "a.ts", summary: "" }],
      data: [], jobs: [], integrations: [],
    })
  )
  const dv = view(readSystemMapFile())
  ok(
    "system merge: authored group suppresses its skeletons",
    dv?.api?.length === 1 && dv?.api?.[0]?.path === "get_a | get_b"
  )

  process.chdir(prevCwd)
}

// 7. THE CWD RULE, exercised end to end (PR #74's rule, script edition). Every
// core script takes the hub root from the CALLER'S cwd — never from
// import.meta.url, which points into the package. This spawns a real scanner
// from a bare temp hub and asserts its output lands THERE, not beside the
// script. The regression it pins: after the split, a dozen scripts kept the
// old derivation and quietly read/wrote inside packages/core (found as a stray
// cache file committed into the package, and an MCP registration pointing at
// a path that no longer existed).
{
  const { execFileSync } = await import("node:child_process")
  const { mkdirSync, existsSync, statSync } = await import("node:fs")
  const { fileURLToPath } = await import("node:url")
  const hub2 = path.join(tmp, "cwd-hub")
  mkdirSync(hub2, { recursive: true })
  const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
  // A stray from the pre-fix era may already sit beside the script on a dev
  // machine — the assertion is that the SPAWN doesn't create or touch one.
  const strayPath = path.join(scriptsDir, "..", ".synclair", "cache", "rulings.json")
  const strayBefore = existsSync(strayPath) ? statSync(strayPath).mtimeMs : null
  try {
    execFileSync(process.execPath, [path.join(scriptsDir, "check-rulings.mjs"), "--write"], {
      cwd: hub2,
      stdio: "ignore",
      timeout: 30000,
    })
  } catch {
    /* findings may exit non-zero — the assertion is WHERE the file landed */
  }
  ok(
    "cwd rule: a spawned scanner writes under the caller's cwd",
    existsSync(path.join(hub2, ".synclair", "cache", "rulings.json"))
  )
  const strayAfter = existsSync(strayPath) ? statSync(strayPath).mtimeMs : null
  ok("cwd rule: nothing lands beside the script", strayAfter === strayBefore)
}

rmSync(tmp, { recursive: true, force: true })

if (failures.length) {
  console.error("check-artifacts-selftest FAILED:")
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`check-artifacts-selftest: ${pass} checks — writers fail loudly, readers degrade to null.`)
