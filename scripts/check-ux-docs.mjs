#!/usr/bin/env node
/**
 * UX-doc staleness check — the commit-anchored half of the ux-doc skill's sync
 * rule. Each registered item's docs are ANCHORED to a sha256 of its source
 * files (data/ux-docs/anchors.json). When source moves after the docs were
 * written, the item is STALE: its documentation is claiming to describe code
 * it may no longer match.
 *
 * Deliberately NON-FATAL by default (drift must never punish a refactor):
 *   node scripts/check-ux-docs.mjs              report fresh/stale/unanchored
 *   node scripts/check-ux-docs.mjs --update     re-anchor every item (run after
 *                                               writing or re-affirming docs)
 *   node scripts/check-ux-docs.mjs --update <name...>   re-anchor specific items
 *   node scripts/check-ux-docs.mjs --queue      also append stale items to
 *                                               data/ux-docs/queue.json for the
 *                                               ux-doc-writer agent to drain
 *   node scripts/check-ux-docs.mjs --strict     exit 1 on stale (CI gates)
 *
 * Hash algorithm must stay in lockstep with lib/system/ux-docs.ts.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const anchorsPath = path.join(root, "data", "ux-docs", "anchors.json");
const queuePath = path.join(root, "data", "ux-docs", "queue.json");

const args = process.argv.slice(2);
const update = args.includes("--update");
const queue = args.includes("--queue");
const strict = args.includes("--strict");
const namedTargets = args.filter((a) => !a.startsWith("--"));

const registry = JSON.parse(readFileSync(path.join(root, "registry.json"), "utf8"));

// Two registered items may share a name across surfaces (a product-surface
// `page-header` vs the hub skin's) — a name-keyed anchor slot would let one
// silently overwrite the other. Duplicated names anchor under
// "<surface>:<name>" instead (lockstep with lib/system/ux-docs.ts).
const nameCounts = new Map();
for (const item of registry.items ?? [])
  nameCounts.set(item.name, (nameCounts.get(item.name) ?? 0) + 1);
const anchorKey = (item) =>
  nameCounts.get(item.name) > 1 && item.meta?.surface
    ? `${item.meta.surface}:${item.name}`
    : item.name;

function hashSourceFiles(files) {
  const hash = createHash("sha256");
  let any = false;
  for (const rel of files) {
    const abs = path.join(root, rel);
    if (!existsSync(abs)) continue;
    hash.update(rel);
    hash.update("\n");
    hash.update(readFileSync(abs));
    hash.update("\0");
    any = true;
  }
  return any ? hash.digest("hex") : null;
}

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`${path.relative(root, file)} is not valid JSON (${e.message}). Fix or delete it.`);
    process.exit(1);
  }
}

const anchorsFile = readJson(anchorsPath, { anchors: [] });
const anchors = new Map(
  (Array.isArray(anchorsFile.anchors) ? anchorsFile.anchors : []).map((a) => [a.name, a])
);

const fresh = [];
const stale = [];
const unanchored = [];

for (const item of registry.items ?? []) {
  const files = (item.files ?? []).map((f) => f.path);
  const current = hashSourceFiles(files);
  if (current === null) continue; // missing files are check:registry's problem

  const key = anchorKey(item);
  if (update && (namedTargets.length === 0 || namedTargets.includes(item.name) || namedTargets.includes(key))) {
    anchors.set(key, {
      name: key,
      sourceHash: current,
      anchoredAt: new Date().toISOString(),
    });
    continue;
  }

  const anchor = anchors.get(key);
  if (!anchor) unanchored.push(key);
  else if (anchor.sourceHash === current) fresh.push(key);
  else stale.push(key);
}

// Drop anchors for items no longer in the registry (either key form).
const registered = new Set((registry.items ?? []).flatMap((i) => [i.name, anchorKey(i)]));
for (const name of [...anchors.keys()]) {
  if (!registered.has(name)) anchors.delete(name);
}

if (update) {
  mkdirSync(path.dirname(anchorsPath), { recursive: true });
  writeFileSync(
    anchorsPath,
    JSON.stringify(
      { anchors: [...anchors.values()].sort((a, b) => a.name.localeCompare(b.name)) },
      null,
      2
    ) + "\n"
  );
  const scope = namedTargets.length ? namedTargets.join(", ") : "all items";
  console.log(`UX docs anchored: ${scope} → data/ux-docs/anchors.json`);
  process.exit(0);
}

if (stale.length === 0 && unanchored.length === 0) {
  console.log(`UX docs fresh: ${fresh.length} anchored item(s), none drifted.`);
  process.exit(0);
}

if (stale.length > 0) {
  console.log(`UX docs stale — source changed since the docs were anchored:`);
  for (const n of stale)
    console.log(`  ✗ ${n} — review its .docs.tsx (ux-doc skill), then: npm run check:ux-docs -- --update ${n}`);
}
if (unanchored.length > 0) {
  console.log(`UX docs unanchored — never anchored to their source:`);
  for (const n of unanchored)
    console.log(`  · ${n} — after docs are written/verified: npm run check:ux-docs -- --update ${n}`);
}

if (queue && stale.length > 0) {
  const q = readJson(queuePath, { requests: [] });
  const existing = new Set((q.requests ?? []).map((r) => r.name));
  for (const name of stale) {
    if (!existing.has(name)) {
      q.requests.push({ name, reason: "source-drift", queuedAt: new Date().toISOString() });
    }
  }
  mkdirSync(path.dirname(queuePath), { recursive: true });
  writeFileSync(queuePath, JSON.stringify(q, null, 2) + "\n");
  console.log(`Queued ${stale.length} stale item(s) → data/ux-docs/queue.json (drain via the ux-doc skill).`);
}

process.exit(strict && stale.length > 0 ? 1 : 0);
