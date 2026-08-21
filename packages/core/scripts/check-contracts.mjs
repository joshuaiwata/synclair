#!/usr/bin/env node
/**
 * SELF-TEST for the contracts seam (scripts/lib/contracts.mjs).
 *
 * The dangerous output here is not a missed link — it is a CONFIDENT WRONG ONE.
 * "These 75 endpoints are unused" invites someone to delete a live endpoint, and
 * that is exactly what the first version produced on a real 80-endpoint
 * monorepo: it scanned only `fetch` with literal URLs, found 19 calls, and
 * reported 94% of the API as dead. The API was fine; the scanner was blind.
 *
 * So most of these cases are about REFUSING to answer.
 *
 * Hermetic: fixture source files in a temp dir. No network, no git, no clone.
 *
 *   node scripts/check-contracts.mjs [--verbose]
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  appOf,
  extractConsumers,
  extractProviders,
  matchContracts,
  normalisePath,
  orphanConfidence,
} from "./lib/contracts.mjs"

const verbose = process.argv.includes("--verbose")
let pass = 0
const failures = []
const ok = (name, cond, detail = "") => {
  if (cond) {
    pass++
    if (verbose) console.log(`  ✓ ${name}`)
  } else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

const root = mkdtempSync(path.join(os.tmpdir(), "synclair-contracts-"))
const file = (rel, body) => {
  const p = path.join(root, rel)
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, body)
}

try {
  // ── path normalisation ─────────────────────────────────────────────────────
  ok(
    "params normalise across syntaxes",
    normalisePath("/users/:id") === normalisePath("/users/${userId}") &&
      normalisePath("/users/:id") === normalisePath("/users/[id]"),
    [
      normalisePath("/users/:id"),
      normalisePath("/users/${userId}"),
      normalisePath("/users/[id]"),
    ].join(" ")
  )
  ok(
    "query strings and trailing slashes are dropped",
    normalisePath("/a/b/?x=1") === "/a/b"
  )
  ok("a bare path gains a leading slash", normalisePath("health") === "/health")

  // ── providers ──────────────────────────────────────────────────────────────
  file(
    "apps/api/src/claim.controller.ts",
    `
    @Controller('claim')
    export class ClaimController {
      @Post('submit') submit() {}
      @Get(':id') one() {}
    }
  `
  )
  file(
    "apps/api/src/health.controller.ts",
    `
    @Controller()
    export class HealthController { @Get('health') health() {} }
  `
  )
  file("apps/web/app/api/ping/route.ts", `export async function GET() {}`)
  file(
    "apps/web/app/(marketing)/api/lead/route.ts",
    `export const POST = async () => {}`
  )
  // A route that exists only in a test is a fixture, not a contract.
  file(
    "apps/api/src/claim.controller.spec.ts",
    `
    @Controller('fake') class F { @Get('nope') n() {} }
  `
  )

  const providers = [
    ...extractProviders(root, "apps/api"),
    ...extractProviders(root, "apps/web"),
  ]
  const has = (m, p) => providers.some((x) => x.method === m && x.path === p)
  ok(
    "a controller prefix is stitched onto the method path",
    has("POST", "/claim/submit"),
    JSON.stringify(providers.map((p) => `${p.method} ${p.path}`))
  )
  ok("a param route normalises", has("GET", "/claim/:p"))
  ok(
    "an empty @Controller() prefix still yields the method path",
    has("GET", "/health")
  )
  ok("a Next route handler is found", has("GET", "/api/ping"))
  ok(
    "a Next route GROUP is not a URL segment",
    has("POST", "/api/lead"),
    JSON.stringify(providers.filter((p) => p.path.includes("lead")))
  )
  ok(
    "routes defined only in a test file are ignored",
    !providers.some((p) => p.path.includes("nope"))
  )

  // ── consumers ──────────────────────────────────────────────────────────────
  file(
    "apps/web/src/api.ts",
    `
    const a = await fetch('/claim/submit', { method: 'POST' });
    const b = await api.get('/health');
    const c = await http.post('/claim/submit', body);
    const d = await fetch(someUrl, { method: 'GET' });
    const e = await fetch('https://api.stripe.com/v1/charges');
    const f = list.get('not-a-path');
    const g = await write('/api/areas', { method: 'PATCH', body });
  `
  )
  const { consumers, opaque } = extractConsumers(root, "apps/web")
  const hasC = (m, p) => consumers.some((x) => x.method === m && x.path === p)
  ok("a literal fetch with a method is read", hasC("POST", "/claim/submit"))
  ok(
    "a client-wrapper call is read",
    hasC("GET", "/health"),
    JSON.stringify(consumers.map((c) => `${c.method} ${c.path}`))
  )
  ok(
    "a map lookup is NOT mistaken for an HTTP call",
    !consumers.some((c) => /not-a-path/.test(c.rawUrl ?? ""))
  )
  ok(
    "a third-party host is flagged external",
    consumers.some((c) => c.external && /stripe/.test(c.rawUrl))
  )
  ok(
    "an unresolvable URL is counted, not invented",
    opaque >= 1,
    `opaque=${opaque}`
  )
  // The miss that reported 35 live endpoints as dead on a real repo.
  ok(
    "a bare local helper with a literal path is read",
    hasC("PATCH", "/api/areas"),
    JSON.stringify(consumers.map((c) => `${c.method} ${c.path}`))
  )

  file(
    "apps/web/storybook-static/assets/generated.js",
    `fetch('/generated-only')`
  )
  const generated = extractConsumers(root, "apps/web")
  ok(
    "generated Storybook bundles are excluded from the contract seam",
    !generated.consumers.some((c) => c.path === "/generated-only")
  )

  // ── matching ───────────────────────────────────────────────────────────────
  const { links, unmatched } = matchContracts(providers, consumers)
  ok(
    "a cross-app call links to its provider",
    links.some(
      (l) =>
        l.path === "/claim/submit" &&
        l.providerApp === "api" &&
        l.consumerApp === "web"
    ),
    JSON.stringify(links)
  )
  ok(
    "an external call is excluded with a reason",
    unmatched.some((u) => u.reason === "external_host")
  )
  const reasons = new Set(unmatched.map((u) => u.reason))
  ok(
    "every unmatched call carries a reason",
    [...reasons].every(Boolean) && unmatched.length > 0
  )

  /**
   * A screen calling its OWN app's API is the commonest seam there is — a
   * single-app Next repo produced 42 calls and zero links when this was
   * filtered out as "internal".
   */
  const intra = matchContracts(
    [{ method: "GET", path: "/x", source: "apps/web/app/api/x/route.ts" }],
    [{ method: "GET", path: "/x", source: "apps/web/src/page.tsx" }]
  )
  ok(
    "a screen calling its own API IS a link",
    intra.links.length === 1,
    JSON.stringify(intra)
  )
  ok(
    "and it is labelled intra-app, not cross-app",
    intra.links[0]?.scope === "intra-app"
  )

  const sameFile = matchContracts(
    [{ method: "GET", path: "/x", source: "apps/api/src/a.ts" }],
    [{ method: "GET", path: "/x", source: "apps/api/src/a.ts" }]
  )
  ok(
    "a file calling itself is not a seam",
    sameFile.links.length === 0 &&
      sameFile.unmatched[0]?.reason === "internal_only"
  )

  const verb = matchContracts(
    [{ method: "GET", path: "/x", source: "apps/api/a.ts" }],
    [{ method: "POST", path: "/x", source: "apps/web/b.ts" }]
  )
  ok(
    "a verb mismatch is its own reason, not a silent drop",
    verb.unmatched[0]?.reason === "method_mismatch"
  )

  ok(
    "appOf reads the workspace directory",
    appOf("apps/example-web/src/x.ts") === "example-web"
  )

  // ── the gate that matters ──────────────────────────────────────────────────
  const blind = orphanConfidence({
    resolved: 19,
    opaque: 2,
    providers: 80,
    orphans: 75,
  })
  ok(
    "94% orphan rate is REFUSED, not reported",
    blind.trustworthy === false,
    JSON.stringify(blind)
  )

  /**
   * The threshold that mattered: a real repo landed at 56% orphans and every one
   * was called through a helper the scanner didn't read. 0.6 let it through.
   */
  const justUnderOld = orphanConfidence({
    resolved: 42,
    opaque: 1,
    providers: 62,
    orphans: 35,
  })
  ok(
    "56% is refused too — the old 0.6 threshold let real fiction through",
    justUnderOld.trustworthy === false,
    JSON.stringify(justUnderOld)
  )
  ok(
    "and it explains why in terms of the scanner, not the API",
    /invisible to this scanner/.test(blind.why ?? ""),
    blind.why
  )

  const thin = orphanConfidence({
    resolved: 2,
    opaque: 0,
    providers: 80,
    orphans: 40,
  })
  ok("too few resolved calls is refused", thin.trustworthy === false)

  const murky = orphanConfidence({
    resolved: 5,
    opaque: 20,
    providers: 8,
    orphans: 2,
  })
  ok(
    "mostly-unresolvable calls are refused",
    murky.trustworthy === false,
    JSON.stringify(murky)
  )

  const good = orphanConfidence({
    resolved: 40,
    opaque: 2,
    providers: 20,
    orphans: 3,
  })
  ok(
    "a well-covered scan IS allowed to report unused endpoints",
    good.trustworthy === true,
    JSON.stringify(good)
  )

  const tiny = orphanConfidence({
    resolved: 0,
    opaque: 0,
    providers: 0,
    orphans: 0,
  })
  ok("an empty repo doesn't throw or claim anything", tiny.trustworthy === true)
} finally {
  rmSync(root, { recursive: true, force: true })
}

if (failures.length) {
  console.log(`check:contracts — ${failures.length} failure(s):`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log(
  `check:contracts: ${pass} checks passed (providers, consumers, matching, the unused-endpoint gate).`
)
