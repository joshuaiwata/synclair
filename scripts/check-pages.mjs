#!/usr/bin/env node
/**
 * Pages-map drift check — keeps the sitemap (data/pages-map.json) honest as
 * people add, change, and merge routes. Three signals:
 *   • NEW      — a route exists in the app but not in the map
 *   • REMOVED  — the map has a route the app no longer serves
 *   • CHANGED  — a mapped route's source files moved since it was digested
 *                (sha256 of `sourceFiles` vs the stored `sourceHash`)
 *
 * CHANGED is router-agnostic (it just re-hashes each node's recorded files).
 * NEW/REMOVED needs route enumeration — implemented for the Next.js app router
 * (this repo and Next hosts); for other router kinds it's skipped with a note,
 * and only CHANGED is reported.
 *
 * Deliberately NON-FATAL by default (a refactor must never fail CI on drift):
 *   node scripts/check-pages.mjs            report new / removed / changed
 *   node scripts/check-pages.mjs --strict   exit 1 when anything drifted (CI gate)
 *   node scripts/check-pages.mjs --queue     append drift to data/pages/queue.json
 *                                            for the pages-map skill to drain
 *   node scripts/check-pages.mjs --reanchor  (re)compute sourceHash for every page
 *                                            from its sourceFiles and write it back
 *                                            — the pages-map skill runs this after
 *                                            the agent's JSON is written, so hashes
 *                                            are always the loader's own algorithm
 *
 * Soft-skips (exit 0) when there's nothing to check: no map, blank seed, or the
 * target repo (host mode) isn't checked out on this machine (e.g. CI).
 *
 * Hash algorithm MUST stay in lockstep with lib/system/pages-map.ts
 * (hashPageSource): per file — update(rel), "\n", bytes, "\0".
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const mapPath = path.join(root, "data", "pages-map.json");
const queuePath = path.join(root, "data", "pages", "queue.json");

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const queue = args.includes("--queue");
const reanchor = args.includes("--reanchor");

if (!existsSync(mapPath)) {
  console.log("Pages map: data/pages-map.json not present — nothing to check.");
  process.exit(0);
}

let map;
try {
  map = JSON.parse(readFileSync(mapPath, "utf8"));
} catch (e) {
  console.error(
    `Pages map: data/pages-map.json is not valid JSON (${e.message}). ` +
      "Fix the file by hand or regenerate it via the pages-map skill — schema: lib/system/pages-map.ts."
  );
  process.exit(1);
}

const pages = Array.isArray(map.pages) ? map.pages : [];
if (!map.repo || pages.length === 0) {
  console.log("Pages map: blank seed (no repo / no pages) — nothing to check. Generate it with the pages-map skill.");
  process.exit(0);
}

// Resolve the target repo root: null = this repo (cwd); a path = host repo,
// relative to this repo. A host not checked out here soft-skips entirely.
const repoRoot = typeof map.repo.root === "string" && map.repo.root ? path.resolve(root, map.repo.root) : root;
if (!existsSync(repoRoot)) {
  console.log(
    `Pages map: target repo not found at ${map.repo.root} (resolved ${repoRoot}) — skipping. ` +
      "Expected where the host isn't checked out (e.g. CI)."
  );
  process.exit(0);
}

function hashPageSource(files) {
  const hash = createHash("sha256");
  let any = false;
  for (const rel of files) {
    const abs = path.join(repoRoot, rel);
    if (!existsSync(abs)) continue;
    hash.update(rel);
    hash.update("\n");
    hash.update(readFileSync(abs));
    hash.update("\0");
    any = true;
  }
  return any ? hash.digest("hex") : null;
}

// ---- --reanchor: fill in each page's sourceHash, then stop ----------------

if (reanchor) {
  let anchored = 0;
  let skipped = 0;
  for (const p of pages) {
    const files = Array.isArray(p.sourceFiles) ? p.sourceFiles.filter((f) => typeof f === "string") : [];
    const hash = files.length ? hashPageSource(files) : null;
    if (hash === null) {
      skipped += 1;
      continue;
    }
    p.sourceHash = hash;
    anchored += 1;
  }
  writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n");
  console.log(
    `Pages map anchored: ${anchored} page(s) hashed → data/pages-map.json` +
      (skipped ? ` (${skipped} skipped — no readable sourceFiles).` : ".")
  );
  process.exit(0);
}

// ---- CHANGED: re-hash each mapped page's source files ---------------------

const changed = [];
const unanchored = [];
for (const p of pages) {
  const files = Array.isArray(p.sourceFiles) ? p.sourceFiles.filter((f) => typeof f === "string") : [];
  if (!p.sourceHash || files.length === 0) {
    unanchored.push(p.route ?? p.id ?? "<unnamed>");
    continue;
  }
  const current = hashPageSource(files);
  if (current === null) continue; // files gone → REMOVED handles it below
  if (current !== p.sourceHash) changed.push(p.route ?? p.id ?? "<unnamed>");
}

// ---- NEW / REMOVED: enumerate the Next.js app-router route set ------------

const routerKind = typeof map.routerKind === "string" ? map.routerKind : "next-app";
const appDir = ["app", "src/app"].map((d) => path.join(repoRoot, d)).find((d) => existsSync(d));

let added = [];
let removed = [];
let enumerated = false;

if ((routerKind === "next-app" || !map.routerKind) && appDir) {
  enumerated = true;
  const current = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) current.add(fileToRoute(path.relative(appDir, full)));
    }
  };
  walk(appDir);

  // Only diff renderable page nodes — API/layout nodes aren't page.* files.
  const mapped = new Set(
    pages
      .filter((p) => p.kind !== "api" && p.kind !== "layout" && typeof p.route === "string")
      .map((p) => p.route)
  );
  added = [...current].filter((r) => !mapped.has(r)).sort();
  removed = [...mapped].filter((r) => !current.has(r)).sort();
} else {
  console.log(
    `Pages map: router "${routerKind}" — route enumeration only implemented for next-app, ` +
      "so NEW/REMOVED are skipped; reporting CHANGED only."
  );
}

/** app-relative page file → served route: strip `page.*`, drop (route groups), keep [dynamic]. */
function fileToRoute(relFromApp) {
  const withoutPage = relFromApp.replace(/(^|\/)page\.(tsx|ts|jsx|js)$/, "");
  const segs = withoutPage
    .split("/")
    .filter(Boolean)
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  return segs.length === 0 ? "/" : "/" + segs.join("/");
}

// ---- Report ---------------------------------------------------------------

const drifted = added.length + removed.length + changed.length;

if (drifted === 0 && unanchored.length === 0) {
  const scope = enumerated ? `${pages.length} route(s)` : `${pages.length} route(s), changed-only`;
  console.log(`Pages map fresh: ${scope}, none drifted.`);
  process.exit(0);
}

if (added.length > 0) {
  console.log("New routes — in the app but not in the sitemap:");
  for (const r of added) console.log(`  ✗ ${r} — regenerate the map: run the pages-map skill (refresh mode).`);
}
if (removed.length > 0) {
  console.log("Removed routes — in the sitemap but no longer served:");
  for (const r of removed) console.log(`  ✗ ${r} — drop it: regenerate via the pages-map skill.`);
}
if (changed.length > 0) {
  console.log("Changed routes — source moved since the page was digested:");
  for (const r of changed) console.log(`  ✗ ${r} — refresh its entry via the pages-map skill.`);
}
if (unanchored.length > 0) {
  console.log("Unanchored — no sourceHash to check against:");
  for (const r of unanchored) console.log(`  · ${r} — re-run the pages-map skill so it records source files + hash.`);
}

if (queue && drifted > 0) {
  let q = { requests: [] };
  if (existsSync(queuePath)) {
    try {
      q = JSON.parse(readFileSync(queuePath, "utf8"));
      if (!Array.isArray(q.requests)) q.requests = [];
    } catch {
      q = { requests: [] };
    }
  }
  const existing = new Set(q.requests.map((r) => `${r.reason}:${r.route}`));
  const add = (route, reason) => {
    if (!existing.has(`${reason}:${route}`)) q.requests.push({ route, reason });
  };
  added.forEach((r) => add(r, "new"));
  removed.forEach((r) => add(r, "removed"));
  changed.forEach((r) => add(r, "changed"));
  mkdirSync(path.dirname(queuePath), { recursive: true });
  writeFileSync(queuePath, JSON.stringify(q, null, 2) + "\n");
  console.log(`Queued ${drifted} drifted route(s) → data/pages/queue.json (drain via the pages-map skill).`);
}

process.exit(strict && drifted > 0 ? 1 : 0);
