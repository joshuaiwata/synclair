#!/usr/bin/env node
/**
 * Deterministic per-page composition resolver — hardens `items` (and
 * `sourceFiles`) in data/pages-map.json so the sitemap's "Composes" list is
 * accurate by construction instead of by an agent's judgment.
 *
 * For each page it walks the route's OWN import graph from the entry `file`,
 * following relative (co-located route code) and local, non-catalog component
 * modules, and records every `@/components/*` import it meets. Each import is
 * resolved against the catalog — registry.json (registered components/blocks/
 * templates) plus the native shadcn primitives in components/ui/ — so the list
 * is exactly what the page composes: registered items and native primitives
 * (catalogued: true, link into the library) plus any local component the page
 * uses that ISN'T in the library yet (catalogued: false — a coverage signal).
 *
 * The walk STOPS at catalog items (a block's internals are the block's doc, not
 * the page's) but recurses THROUGH local view modules (page-doc-view, a
 * co-located table) so their composition counts as the page's. sourceFiles is
 * rewritten to the route-local closure it discovered, so per-page freshness
 * (check:pages) covers everything that actually shapes the page.
 *
 *   node scripts/resolve-page-items.mjs           resolve + write data/pages-map.json
 *   node scripts/resolve-page-items.mjs --check    report, exit 1 if any page would change (CI)
 *
 * Run by the pages-map skill after the page-mapper returns routes; then
 * check:pages --reanchor stamps the fresh hashes.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const mapPath = path.join(root, "data", "pages-map.json");
const check = process.argv.slice(2).includes("--check");

if (!existsSync(mapPath)) {
  console.log("Pages map: data/pages-map.json not present — nothing to resolve.");
  process.exit(0);
}
const map = JSON.parse(readFileSync(mapPath, "utf8"));
const pages = Array.isArray(map.pages) ? map.pages : [];
if (!map.repo || pages.length === 0) {
  console.log("Pages map: blank seed — nothing to resolve.");
  process.exit(0);
}

// HOST MODE GUARD: this resolver understands Next.js app-router + the hub's OWN
// catalog (registry.json + native components/ui, `@/components/*` imports). A
// host (root != null) uses its own router + import conventions and is cataloged
// in data/external-catalog.json, which this script does NOT read — so running it
// there would resolve every page to zero items and BLANK the agent's work. Host
// composition is resolved by the page-mapper agent (it reads the host source and
// matches external-catalog). Skip, loudly, without touching the file.
if (typeof map.repo.root === "string" && map.repo.root) {
  console.log(
    `Pages map: host mode (repo.root "${map.repo.root}") — items are resolved by the page-mapper ` +
      "against data/external-catalog.json, not this Next+own-catalog resolver. Skipping (no changes)."
  );
  process.exit(0);
}

const repoRoot = root;
if (!existsSync(repoRoot)) {
  console.log(`Pages map: target repo not found at ${map.repo.root} — skipping.`);
  process.exit(0);
}

// ---- Catalog index: source-file path -> { name, tier } --------------------

const KIND_BY_TYPE = {
  "registry:component": "component",
  "registry:block": "block",
  "registry:page": "template",
};
const norm = (p) => p.replace(/\\/g, "/").replace(/^\.\//, "");

const catalogByPath = new Map();
try {
  const registry = JSON.parse(readFileSync(path.join(repoRoot, "registry.json"), "utf8"));
  for (const it of registry.items ?? []) {
    const tier = KIND_BY_TYPE[it.type] ?? "component";
    for (const f of it.files ?? []) {
      if (f?.path) catalogByPath.set(norm(f.path), { name: it.name, tier });
    }
  }
} catch {
  // No registry (host may not have one) — natives + local resolution still work.
}
// Native shadcn primitives = every components/ui/*.tsx basename.
const uiDir = path.join(repoRoot, "components", "ui");
if (existsSync(uiDir)) {
  for (const f of readdirSync(uiDir)) {
    if (f.endsWith(".tsx") && !f.endsWith(".docs.tsx")) {
      const rel = `components/ui/${f.replace(/\.tsx$/, "")}.tsx`;
      if (!catalogByPath.has(rel)) catalogByPath.set(rel, { name: f.replace(/\.tsx$/, ""), tier: "component" });
    }
  }
}

// ---- Import resolution ----------------------------------------------------

const IMPORT_RE = /(?:from|import)\s*["']([^"']+)["']/g;
const EXTS = [".tsx", ".ts"];

/** Resolve an import specifier (from `fromRel`) to a repo-relative source file, or null. */
function resolveSpecifier(spec, fromRel) {
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../"))
    base = norm(path.join(path.dirname(fromRel), spec));
  else return null; // bare package
  const candidates = [
    ...EXTS.map((e) => base + e),
    ...EXTS.map((e) => `${base}/index${e}`),
  ];
  for (const c of candidates) {
    if (existsSync(path.join(repoRoot, c)) && !c.endsWith(".docs.tsx")) return norm(c);
  }
  return null;
}

const basename = (rel) => rel.split("/").pop().replace(/\.tsx?$/, "");

/**
 * Walk a route's own code from its entry file, collecting composed catalog +
 * local items and the route-local file closure.
 */
function resolvePage(entryRel) {
  const items = new Map(); // name -> { name, tier, catalogued, files:Set }
  const sourceFiles = new Set();
  const visited = new Set();
  const queue = [entryRel];
  visited.add(entryRel);

  const record = (name, tier, catalogued, importerRel) => {
    let it = items.get(name);
    if (!it) items.set(name, (it = { name, tier, catalogued, files: new Set() }));
    it.files.add(importerRel);
  };

  while (queue.length > 0) {
    const file = queue.pop();
    let src;
    try {
      src = readFileSync(path.join(repoRoot, file), "utf8");
    } catch {
      continue;
    }
    sourceFiles.add(file); // this file is route-local code that shapes the page
    // "Route-own" = the page.tsx and co-located app/ code the author wrote. A
    // local component the author reached for HERE is a coverage signal; one
    // pulled in deep inside another local module is that module's infra, not the
    // page's — so we recurse through it but don't flag it.
    const routeOwn = file.startsWith("app/")
    for (const m of src.matchAll(IMPORT_RE)) {
      const resolved = resolveSpecifier(m[1], file);
      if (!resolved) continue;
      const hit = catalogByPath.get(resolved)
      if (hit) {
        // A catalog item, from anywhere in the route's code — record and STOP
        // (a block's internals are the block's doc, not the page's).
        record(hit.name, hit.tier, true, file)
      } else if (resolved.startsWith("components/")) {
        // A local component not in the library. Flag it only when the route's
        // own code imports it directly; always recurse to reach catalog usage.
        if (routeOwn) record(basename(resolved), "component", false, resolved)
        if (!visited.has(resolved)) {
          visited.add(resolved)
          queue.push(resolved)
        }
      } else if (resolved.startsWith("app/")) {
        // Co-located route code — recurse, but it isn't itself a composed item.
        if (!visited.has(resolved)) {
          visited.add(resolved)
          queue.push(resolved)
        }
      }
    }
  }

  const TIER_ORDER = { template: 0, block: 1, component: 2 };
  const list = [...items.values()]
    .map((it) => ({
      name: it.name,
      tier: it.tier,
      catalogued: it.catalogued,
      count: it.files.size,
    }))
    // catalogued first within a tier, then by name — the library items lead.
    .sort(
      (a, b) =>
        TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
        Number(b.catalogued) - Number(a.catalogued) ||
        a.name.localeCompare(b.name)
    );
  return { items: list, sourceFiles: [...sourceFiles].sort() };
}

// ---- Apply ----------------------------------------------------------------

let changedPages = 0;
const diffs = [];
for (const p of pages) {
  if (!p.file || p.kind === "api") continue;
  const { items, sourceFiles } = resolvePage(norm(p.file));
  if (items.length === 0 && !existsSync(path.join(repoRoot, norm(p.file)))) continue;
  const before = JSON.stringify({ items: p.items ?? [], sourceFiles: p.sourceFiles ?? [] });
  // Preserve any surface tags the agent set (multi-surface projects).
  const surfaceByName = new Map((p.items ?? []).map((i) => [i.name, i.surface]));
  const items2 = items.map((i) =>
    surfaceByName.get(i.name) ? { ...i, surface: surfaceByName.get(i.name) } : i
  );
  const after = JSON.stringify({ items: items2, sourceFiles });
  if (before !== after) {
    changedPages += 1;
    diffs.push(`${p.route}: ${(p.items ?? []).length} → ${items2.length} items`);
  }
  p.items = items2;
  p.sourceFiles = sourceFiles;
}

if (check) {
  if (changedPages > 0) {
    console.error(`Page items stale — ${changedPages} page(s) would change:`);
    for (const d of diffs) console.error(`  ✗ ${d}`);
    console.error("\nRe-resolve: npm run resolve:pages (then check:pages --reanchor).");
    process.exit(1);
  }
  console.log(`Page items fresh: all ${pages.length} pages resolve to their current composition.`);
  process.exit(0);
}

writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n");
console.log(
  `Resolved composition for ${pages.length} pages → data/pages-map.json` +
    (changedPages ? ` (${changedPages} changed).` : " (no change).")
);
for (const d of diffs) console.log(`  · ${d}`);
