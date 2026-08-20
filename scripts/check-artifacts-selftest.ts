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

rmSync(tmp, { recursive: true, force: true })

if (failures.length) {
  console.error("check-artifacts-selftest FAILED:")
  for (const f of failures) console.error("  ✗ " + f)
  process.exit(1)
}
console.log(`check-artifacts-selftest: ${pass} checks — writers fail loudly, readers degrade to null.`)
