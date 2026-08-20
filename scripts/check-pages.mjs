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
const repoList = Array.isArray(map.repos) ? map.repos : [];
if ((!map.repo && repoList.length === 0) || pages.length === 0) {
  console.log("Pages map: blank seed (no repo / no pages) — nothing to check. Generate it with the pages-map skill.");
  process.exit(0);
}

// Resolve the target repo root: null = this repo (cwd); a path = host repo,
// relative to this repo. A host not checked out here soft-skips entirely.
//
// MULTI-APP: each entry in `repos` maps one frontend from its OWN root, so a
// page's files are resolved against the root of ITS surface. `repo` remains the
// fallback, which is what every single-surface map resolves through.
function resolveRoot(rel) {
  return typeof rel === "string" && rel ? path.resolve(root, rel) : root;
}
const rootBySurface = new Map();
for (const r of repoList) {
  if (r && typeof r.surface === "string") rootBySurface.set(r.surface, resolveRoot(r.root));
}
const defaultRoot = map.repo ? resolveRoot(map.repo.root) : resolveRoot(repoList[0]?.root);

// Every root the map points at must exist, or that surface soft-skips. A host
// checked out on one machine and not another is normal (CI), not a failure.
const missing = [...rootBySurface.entries()].filter(([, abs]) => !existsSync(abs));
// The vacuous-truth trap: a single-`repo` map has an EMPTY repos list, so
// `missing.length === repoList.length` was 0 === 0 and this check soft-skipped
// on every single-surface host map — even with the host right there. Found by
// the C5 intake drill; the skip must require actual missing surfaces.
const allSurfacesMissing = repoList.length > 0 && missing.length === repoList.length;
if (!existsSync(defaultRoot) || allSurfacesMissing) {
  console.log(
    `Pages map: target repo not found (resolved ${defaultRoot}) — skipping. ` +
      "Expected where the host isn't checked out (e.g. CI)."
  );
  process.exit(0);
}
for (const [surface, abs] of missing) {
  console.log(`Pages map: surface "${surface}" not checked out at ${abs} — its pages are skipped.`);
}

function rootForPage(page) {
  const hit = page && typeof page.surface === "string" ? rootBySurface.get(page.surface) : undefined;
  return hit ?? defaultRoot;
}

function hashPageSource(files, repoRoot) {
  const hash = createHash("sha256");
  let any = false;
  for (const rel of files) {
    const abs = path.join(repoRoot, rel);
    hash.update(rel);
    hash.update("\n");
    // A missing file used to be skipped outright, on BOTH the --reanchor and the
    // check side — so deleting a screen a page composes changed nothing, and the
    // page stayed "fresh" while citing a file that no longer existed. Hashing a
    // marker instead makes the deletion the thing it is: a change to the sources.
    hash.update(existsSync(abs) ? readFileSync(abs) : "\0<absent>");
    hash.update("\0");
    // Still anchor only on a real read: a host that is not checked out here must
    // stay "unanchored", not turn every page stale at once.
    if (existsSync(abs)) any = true;
  }
  return any ? hash.digest("hex") : null;
}

// ---- --reanchor: fill in each page's sourceHash, then stop ----------------

if (reanchor) {
  let anchored = 0;
  let skipped = 0;
  for (const p of pages) {
    const files = Array.isArray(p.sourceFiles) ? p.sourceFiles.filter((f) => typeof f === "string") : [];
    const hash = files.length ? hashPageSource(files, rootForPage(p)) : null;
    if (hash === null) {
      skipped += 1;
      continue;
    }
    p.sourceHash = hash;
    anchored += 1;
  }
  // Anchor the router-source hash too (non-next routers' new/removed proxy).
  const routerSources = Array.isArray(map.routerSources)
    ? map.routerSources.filter((f) => typeof f === "string")
    : [];
  const routerHash = routerSources.length ? hashPageSource(routerSources, defaultRoot) : null;
  if (routerHash) map.routerSourcesHash = routerHash;
  else delete map.routerSourcesHash;
  writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n");
  console.log(
    `Pages map anchored: ${anchored} page(s) hashed → data/pages-map.json` +
      (routerHash ? ` + router source (${routerSources.length} file(s))` : "") +
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
  const current = hashPageSource(files, rootForPage(p));
  if (current === null) continue; // files gone → REMOVED handles it below
  if (current !== p.sourceHash) changed.push(p.route ?? p.id ?? "<unnamed>");
}

// ---- NEW / REMOVED: enumerate the Next.js app-router route set ------------

const routerKind = typeof map.routerKind === "string" ? map.routerKind : "next-app";

// MULTI-APP: diff each surface against ITS OWN app dir. Enumerating one root
// and comparing it to every page would report the other app's whole route set
// as REMOVED — the map would look catastrophically wrong the moment a second
// frontend was added.
const dropFor = (r) => (Array.isArray(r?.dropSegments) ? r.dropSegments.filter((s) => typeof s === "string") : []);
const surfaceTargets = repoList.length
  ? repoList.map((r) => ({ surface: r.surface ?? null, root: resolveRoot(r.root), drop: dropFor(r) }))
  : [{ surface: null, root: defaultRoot, drop: dropFor(map.repo) }];

const appDirFor = (r) => ["app", "src/app"].map((d) => path.join(r, d)).find((d) => existsSync(d));
const anyAppDir = surfaceTargets.some((t) => existsSync(t.root) && appDirFor(t.root));

let added = [];
let removed = [];
let enumerated = false;
let routerChanged = false;

if ((routerKind === "next-app" || !map.routerKind) && anyAppDir) {
  enumerated = true;
  for (const target of surfaceTargets) {
    if (!existsSync(target.root)) continue;
    const appDir = appDirFor(target.root);
    if (!appDir) continue;

    const current = new Set();
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name))
          current.add(fileToRoute(path.relative(appDir, full), target.drop));
      }
    };
    walk(appDir);

    // Only diff renderable page nodes — API/layout nodes aren't page.* files.
    // Pages carrying no surface belong to the default target.
    const mapped = new Set(
      pages
        .filter((p) => (p.surface ?? null) === target.surface)
        .filter((p) => p.kind !== "api" && p.kind !== "layout" && typeof p.route === "string")
        .map((p) => p.route)
    );
    const label = (r) => (target.surface ? `${r}  (${target.surface})` : r);
    added.push(...[...current].filter((r) => !mapped.has(r)).map(label));
    removed.push(...[...mapped].filter((r) => !current.has(r)).map(label));
  }
  added.sort();
  removed.sort();
} else {
  // Non-filesystem routers (react-router, a config table) can't be enumerated
  // statically. Instead, hash the router source file(s) the page-mapper
  // recorded: if the router DEFINITION moved, routes were likely added/removed
  // → tell the reader to re-run pages-map. A reliable proxy for new/removed.
  const routerSources = Array.isArray(map.routerSources)
    ? map.routerSources.filter((f) => typeof f === "string")
    : [];
  const routerHash = routerSources.length ? hashPageSource(routerSources, defaultRoot) : null;
  if (routerSources.length === 0) {
    console.log(
      `Pages map: router "${routerKind}" — no filesystem route enumeration and no routerSources ` +
        "recorded, so NEW/REMOVED can't be detected; reporting CHANGED only. " +
        "(Have the page-mapper set repo router source files to enable router-drift detection.)"
    );
  } else if (routerHash === null) {
    console.log(
      `Pages map: router "${routerKind}" — routerSources not readable here; reporting CHANGED only.`
    );
  } else if (map.routerSourcesHash && routerHash !== map.routerSourcesHash) {
    routerChanged = true;
  }
}

/** app-relative page file → served route: strip `page.*`, drop (route groups), keep [dynamic]. */
/**
 * `dropSegments` are directory segments the ROUTER consumes that never appear
 * in a URL — an i18n wrapper is the usual case: a `[locale]` dir whose prefix
 * is omitted for the default locale, so `/[locale]/account` is served at
 * `/account`. Without declaring them, every such route reports as BOTH new
 * (enumerated with the segment) and removed (mapped without it).
 * Route groups `(x)` are dropped unconditionally — those are never URL segments.
 */
function fileToRoute(relFromApp, dropSegments = []) {
  const withoutPage = relFromApp.replace(/(^|\/)page\.(tsx|ts|jsx|js)$/, "");
  const segs = withoutPage
    .split("/")
    .filter(Boolean)
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")))
    .filter((s) => !dropSegments.includes(s));
  return segs.length === 0 ? "/" : "/" + segs.join("/");
}

// ---- Report ---------------------------------------------------------------

const drifted = added.length + removed.length + changed.length + (routerChanged ? 1 : 0);

if (drifted === 0 && unanchored.length === 0) {
  const scope = enumerated
    ? `${pages.length} route(s)`
    : `${pages.length} route(s), changed-only${map.routerSourcesHash ? " + router source" : ""}`;
  console.log(`Pages map fresh: ${scope}, none drifted.`);
  process.exit(0);
}

if (routerChanged) {
  console.log(
    "Router changed — the route definition moved since the sitemap was generated; " +
      "routes may have been added or removed. Re-run the pages-map skill to re-enumerate."
  );
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
