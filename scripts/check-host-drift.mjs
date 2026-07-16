#!/usr/bin/env node
/**
 * Host-drift check — the machine-enforced freshness rule for the EXTERNAL
 * component catalog (existing-project mode). Each entry in
 * data/external-catalog.json stores a sha256 of the host source it documented;
 * this script re-hashes the live host files and reports anything that moved.
 *
 * Soft by design when there is nothing to check: no catalog, no host, or the
 * host repo not present on this machine (CI) all exit 0 with a note. Actual
 * drift exits 1 — the catalog is claiming to document code it no longer matches.
 *
 * Run via `npm run check:host`. Fix drift by re-running the component-cataloger
 * on the stale entries (existing-project-intake skill, refresh procedure).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const catalogPath = path.join(root, "data", "external-catalog.json");

if (!existsSync(catalogPath)) {
  console.log("Host catalog: data/external-catalog.json not present — nothing to check.");
  process.exit(0);
}

let catalog;
try {
  catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
} catch (e) {
  console.error(
    `Host catalog: data/external-catalog.json is not valid JSON (${e.message}). ` +
      "Fix the file by hand or rewrite it via the existing-project-intake skill — schema: lib/system/external.ts."
  );
  process.exit(1);
}
const items = catalog.items ?? [];

// Multi-surface catalogs carry `hosts[]` (one per surface); older catalogs a
// singular `host`. Normalize to a list — schema: lib/system/external.ts.
const hosts = Array.isArray(catalog.hosts) ? catalog.hosts : catalog.host ? [catalog.host] : [];

if (hosts.length === 0 || items.length === 0) {
  console.log("Host catalog: empty (no hosts or no items) — nothing to check.");
  process.exit(0);
}

for (const host of hosts) {
  if (typeof host.root !== "string" || !host.root) {
    console.error(
      'Host catalog: a host entry is missing "root" (or it is not a string). ' +
        "Set it to the host repo path (relative to this repo) — schema: lib/system/external.ts."
    );
    process.exit(1);
  }
}

// Resolve each host root; a host repo not checked out on this machine (e.g. CI)
// soft-skips ITS items only.
const fallbackSurface = hosts[0].surface;
const hostBySurface = new Map();
for (const host of hosts) hostBySurface.set(host.surface ?? fallbackSurface, host);
const missingRoots = new Set();
for (const host of hosts) {
  const resolved = path.resolve(root, host.root);
  if (!existsSync(resolved)) {
    console.log(
      `Host catalog: host repo not found at ${host.root} (resolved ${resolved}) — skipping its entries. ` +
        "Expected when running where the host isn't checked out (e.g. CI)."
    );
    missingRoots.add(host);
  }
}
if (missingRoots.size === hosts.length) process.exit(0);

const problems = [];
let checked = 0;
for (const item of items) {
  const host = hostBySurface.get(item.surface ?? fallbackSurface) ?? hosts[0];
  if (missingRoots.has(host)) continue;
  const hostRoot = path.resolve(root, host.root);
  if (typeof item.hostPath !== "string" || !item.hostPath || !item.sourceHash) {
    problems.push(
      `"${item.name ?? "<unnamed>"}": entry is incomplete (missing hostPath and/or sourceHash). ` +
        "Re-run the component-cataloger on it — every entry needs both (schema: lib/system/external.ts)."
    );
    continue;
  }
  const file = path.join(hostRoot, item.hostPath);
  const contained = path.relative(hostRoot, file);
  if (contained.startsWith("..") || path.isAbsolute(contained)) {
    problems.push(
      `"${item.name}": hostPath ${item.hostPath} escapes the host root — hostPath must be relative to ${host.root}. Fix the entry.`
    );
    continue;
  }
  if (!existsSync(file)) {
    problems.push(
      `"${item.name}": host source ${item.hostPath} no longer exists. The component was moved or deleted — ` +
        "re-run the component-cataloger on it (or remove the entry) so the catalog stops documenting a ghost."
    );
    continue;
  }
  checked += 1;
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (hash !== item.sourceHash) {
    problems.push(
      `"${item.name}": host source ${item.hostPath} changed since cataloged (${item.catalogedAt ?? "unknown date"}). ` +
        "Re-run the component-cataloger on it to refresh the entry (props/variants/usage may have changed)."
    );
  }
}

if (problems.length > 0) {
  console.error(`Host catalog drift — ${problems.length} stale entr${problems.length === 1 ? "y" : "ies"}:\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(
    "\nThe external catalog documents host code it no longer matches. Refresh via the existing-project-intake skill."
  );
  process.exit(1);
}

// Design-foundation freshness (advisory): the host's STYLING source-of-truth
// (tailwind config, globals.css, theme module) drives the seeded palette/tokens
// in lib/system/seed/. If those files moved since the token dig, Foundations may
// be stale. This is a WARNING, not a failure — a stale palette is "may have
// drifted", not "definitely wrong" — so a host CSS tweak never breaks verify-ui.
const styleDrift = [];
for (const host of hosts) {
  if (missingRoots.has(host) || !Array.isArray(host.styleSources)) continue;
  const hostRoot = path.resolve(root, host.root);
  for (const src of host.styleSources) {
    if (!src || typeof src.path !== "string" || typeof src.hash !== "string") continue;
    const file = path.join(hostRoot, src.path);
    if (!existsSync(file)) {
      styleDrift.push(`${host.name ?? host.root}: styling source ${src.path} no longer exists`);
      continue;
    }
    const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
    if (hash !== src.hash) {
      styleDrift.push(`${host.name ?? host.root}: ${src.path} changed since the token dig`);
    }
  }
}
if (styleDrift.length > 0) {
  console.warn(
    `\n⚠ Design foundation may be stale — the host's styling source moved since the token dig:`
  );
  for (const d of styleDrift) console.warn(`  · ${d}`);
  console.warn(
    "  Re-run the token-archaeologist (existing-project-intake, phase 3) to refresh\n" +
      "  lib/system/seed/brand-ramps.ts + foundation.ts, then update the styleSources hashes."
  );
}

const hostNames = hosts
  .filter((h) => !missingRoots.has(h))
  .map((h) => h.name ?? h.root)
  .join(", ");
console.log(`Host catalog fresh: ${checked} entr${checked === 1 ? "y" : "ies"} match ${hostNames}.`);
