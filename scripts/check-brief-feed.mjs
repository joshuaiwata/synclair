#!/usr/bin/env node
/**
 * SELF-TEST for the session brief's change feed (scripts/lib/brief-cursor.mjs).
 *
 * The feed's failure modes are all about *when it stays quiet*, and quiet bugs
 * don't announce themselves:
 *
 *   - a first run that dumps 144 catalog items as "new" teaches everyone to
 *     ignore the brief permanently;
 *   - a cursor advanced on a run nobody read marks news as delivered when it
 *     never was, and the news is gone for good;
 *   - reporting STATE instead of TRANSITIONS repeats the standing condition the
 *     rest of the brief already prints.
 *
 * Hermetic: fixture JSON in a temp dir, no network, no git, no real clone.
 *
 *   node scripts/check-brief-feed.mjs [--verbose]
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { advanceCursor, changesSince, fingerprint } from "./lib/brief-cursor.mjs"

const verbose = process.argv.includes("--verbose")
let pass = 0
const failures = []
const ok = (name, cond, detail = "") => {
  if (cond) {
    pass++
    if (verbose) console.log(`  ✓ ${name}`)
  } else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

const hub = mkdtempSync(path.join(os.tmpdir(), "synclair-feed-"))
const write = (rel, obj) => {
  const p = path.join(hub, rel)
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(obj, null, 2))
}
const texts = (events) => events.map((e) => e.text).join(" | ")

try {
  write("data/external-catalog.json", { items: [{ name: "Button", surface: "web" }] })
  write("registry.json", { items: [{ name: "hub-card" }] })
  write("data/pages-map.json", { pages: [{ route: "/home" }] })
  write("data/knowledge/freshness.json", { sources: [{ id: "billing", state: "fresh" }] })
  write("data/contracts.json", { providers: [{ method: "GET", path: "/health" }], links: [] })
  const artifacts = [{ artifact: "pages", state: "fresh" }]

  // ── first run ───────────────────────────────────────────────────────────────
  let fp = fingerprint(hub, artifacts)
  let feed = changesSince(hub, fp)
  ok("a first run reports nothing and flags itself as first", feed.first && feed.events.length === 0)

  advanceCursor(hub, fp)
  ok("the cursor is written under data/.local (gitignored)",
    existsSync(path.join(hub, "data", ".local", "brief-cursor.json")))

  feed = changesSince(hub, fingerprint(hub, artifacts))
  ok("an unchanged second run reports nothing", !feed.first && feed.events.length === 0)

  // ── catalog ─────────────────────────────────────────────────────────────────
  write("data/external-catalog.json", {
    items: [{ name: "Button", surface: "web" }, { name: "NewWidget", surface: "web" }],
  })
  feed = changesSince(hub, fingerprint(hub, artifacts))
  ok("a newly cataloged component is news", /newly cataloged/.test(texts(feed.events)), texts(feed.events))
  ok("and it is named", /NewWidget/.test(texts(feed.events)), texts(feed.events))

  advanceCursor(hub, fingerprint(hub, artifacts))
  ok("consuming the news clears it", changesSince(hub, fingerprint(hub, artifacts)).events.length === 0)

  // ── routes ──────────────────────────────────────────────────────────────────
  write("data/pages-map.json", { pages: [{ route: "/home" }, { route: "/reports" }] })
  feed = changesSince(hub, fingerprint(hub, artifacts))
  ok("a new route is news", /new route/.test(texts(feed.events)) && /\/reports/.test(texts(feed.events)), texts(feed.events))
  advanceCursor(hub, fingerprint(hub, artifacts))

  // ── page routes outrank API-handler noise ───────────────────────────────────
  write("data/pages-map.json", { pages: [
    { route: "/home" }, { route: "/reports" }, { route: "/billing/pending" },
    ...Array.from({ length: 20 }, (_, i) => ({ route: `/api/messaging/v${i}` })),
  ]})
  feed = changesSince(hub, fingerprint(hub, artifacts))
  const routeEv = feed.events.find((e) => e.kind === "pages")
  ok("a built screen leads the route line, API handlers ride as a count",
    /\/billing\/pending/.test(routeEv?.text ?? "") && /\+20 API handler/.test(routeEv?.text ?? ""),
    routeEv?.text)
  ok("the screen is not buried in an ellipsis of handlers",
    !/api\/messaging/.test(routeEv?.text ?? ""), routeEv?.text)
  advanceCursor(hub, fingerprint(hub, artifacts))

  // ── endpoints: a backend build is news too ──────────────────────────────────
  write("data/contracts.json", {
    providers: [
      { method: "GET", path: "/health" },
      { method: "GET", path: "/invoices/outstanding" },
    ],
    links: [],
  })
  feed = changesSince(hub, fingerprint(hub, artifacts))
  ok("a new endpoint is news",
    /new endpoint/.test(texts(feed.events)) && /\/invoices\/outstanding/.test(texts(feed.events)),
    texts(feed.events))
  advanceCursor(hub, fingerprint(hub, artifacts))
  ok("and it clears once seen", changesSince(hub, fingerprint(hub, artifacts)).events.length === 0)

  // ── knowledge transitions, not states ───────────────────────────────────────
  write("data/knowledge/freshness.json", { sources: [{ id: "billing", state: "stale" }] })
  feed = changesSince(hub, fingerprint(hub, artifacts))
  ok("a spec going stale is news", /drifted/.test(texts(feed.events)), texts(feed.events))
  advanceCursor(hub, fingerprint(hub, artifacts))

  feed = changesSince(hub, fingerprint(hub, artifacts))
  ok("a spec STAYING stale is not news (the standing signal already says it)",
    feed.events.length === 0, texts(feed.events))

  // ── artifacts, including recovery ───────────────────────────────────────────
  feed = changesSince(hub, fingerprint(hub, [{ artifact: "pages", state: "stale" }]))
  ok("an artifact drifting is news", /drifted/.test(texts(feed.events)), texts(feed.events))
  advanceCursor(hub, fingerprint(hub, [{ artifact: "pages", state: "stale" }]))

  feed = changesSince(hub, fingerprint(hub, [{ artifact: "pages", state: "fresh" }]))
  ok("recovery is reported too, so the feed is not only bad news",
    /back in sync/.test(texts(feed.events)), texts(feed.events))
  advanceCursor(hub, fingerprint(hub, [{ artifact: "pages", state: "fresh" }]))

  // ── removals ────────────────────────────────────────────────────────────────
  write("data/external-catalog.json", { items: [{ name: "Button", surface: "web" }] })
  feed = changesSince(hub, fingerprint(hub, [{ artifact: "pages", state: "fresh" }]))
  ok("a component leaving the catalog is news",
    /no longer in the catalog/.test(texts(feed.events)), texts(feed.events))

  // ── robustness ──────────────────────────────────────────────────────────────
  const blank = mkdtempSync(path.join(os.tmpdir(), "synclair-feed-blank-"))
  ok("a clone with no artifacts fingerprints without throwing",
    Object.keys(fingerprint(blank, []).items).length === 0)
  ok("and its first run is silent", changesSince(blank, fingerprint(blank, [])).first === true)
  rmSync(blank, { recursive: true, force: true })

  writeFileSync(path.join(hub, "data", ".local", "brief-cursor.json"), "{ corrupt")
  ok("a corrupt cursor is treated as a first run, not a crash",
    changesSince(hub, fingerprint(hub, [])).first === true)
} finally {
  rmSync(hub, { recursive: true, force: true })
}

if (failures.length) {
  console.log(`check:brief-feed — ${failures.length} failure(s):`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`check:brief-feed: ${pass} checks passed (change feed, cursor, transitions).`)
