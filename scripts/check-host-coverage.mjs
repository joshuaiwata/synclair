#!/usr/bin/env node
/**
 * Host-coverage check — the anti-fiction sweep for the external catalog
 * (companion mode). Walks the LIVE host repo and diffs reality against the
 * catalog in both directions:
 *
 *   1. UNCATALOGED — component files in the app the catalog doesn't document
 *      (candidates from a mechanical scan; triage, don't blindly catalog).
 *   2. UNUSED-CATALOGED — catalog entries nothing renders. The "40 listed, 23
 *      used" fictional-archive failure, made visible instead of silent. Counted
 *      LIVE against the host source (JSX tag occurrences, web surfaces — same
 *      rule as lib/system/host-usage.ts); the cataloger's intake-time snapshot
 *      is the fallback for non-web surfaces. For a SHARED library, adoption is
 *      measured across the CONSUMING surfaces (standalone ones excluded), not
 *      the package's own source, and an unused entry is reported as "not yet
 *      adopted by any surface" — an expected state for shared UI, not fiction.
 *   3. DOCUMENTED-NOT-RENDERED — cataloged entries with neither a live preview
 *      scene (components/host-previews/registry.tsx) nor a screenshot example:
 *      their gallery cards degrade to a bare `<name />` code placeholder.
 *      Cataloging alone doesn't make an item render — the preview scene is a
 *      separate step (port-host-component, Path A) that nothing else flags.
 *
 * ADVISORY: always exits 0 with counts. Coverage gaps are triage work, not
 * corruption (that's check:host). Same scan the hub runs live (lib/system/host-scan.ts).
 *
 * Usage:
 *   npm run check:coverage                    # hosts from data/external-catalog.json
 *   node scripts/check-host-coverage.mjs --host ../acme-app   # ad-hoc scan, no catalog needed
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { exportsOf, MAX_FILE_BYTES, norm, walkAll, walkComponents } from "./lib/host-walk.mjs";

const root = process.cwd();

// Walk/skip rules + export detection are shared with the other host scripts:
// scripts/lib/host-walk.mjs (kept in step with lib/system/host-scan.ts).

// Local (non-exported) PascalCase component definitions in a file — the
// inline-invention blind spot. A screen that defines several of these has
// grown DS-worthy primitives in place; because they're never exported, the
// export-based coverage scan and the import-graph resolver are both blind to
// them. PascalCase in a .tsx (functions/arrow-consts, hooks are camelCase)
// reads as a component; requiring a function-shaped RHS avoids PascalCase
// constant/config false positives.
function localComponentsOf(abs) {
  try {
    if (statSync(abs).size > MAX_FILE_BYTES) return [];
    const src = readFileSync(abs, "utf8");
    const names = new Set();
    const fn = /(^|\n)[ \t]*(export[ \t]+)?(?:async[ \t]+)?function[ \t]+([A-Z][A-Za-z0-9]*)[ \t]*[(<]/g;
    const arrow =
      /(^|\n)[ \t]*(export[ \t]+)?const[ \t]+([A-Z][A-Za-z0-9]*)[ \t]*(?::[^=]+)?=[ \t]*(?:async[ \t]+)?(?:\([^)]*\)|[A-Za-z0-9_$]+)[ \t]*(?::[^=>]+)?=>|(^|\n)[ \t]*(export[ \t]+)?const[ \t]+([A-Z][A-Za-z0-9]*)[ \t]*=[ \t]*(?:forwardRef|memo|function)\b/g;
    let m;
    while ((m = fn.exec(src)) !== null) if (!m[2]) names.add(m[3]);
    while ((m = arrow.exec(src)) !== null) {
      const isExport = m[2] || m[5];
      const name = m[3] || m[6];
      if (!isExport && name) names.add(name);
    }
    return [...names];
  } catch {
    return [];
  }
}

// --- resolve hosts + items ---------------------------------------------------
const args = process.argv.slice(2);
const hostFlag = args.indexOf("--host");
let hosts;
let items = [];
if (hostFlag !== -1) {
  const hostPath = args[hostFlag + 1];
  if (!hostPath) {
    console.error("--host requires a path");
    process.exit(1);
  }
  hosts = [{ name: path.basename(hostPath), root: hostPath }];
} else {
  const catalogPath = path.join(root, "data", "external-catalog.json");
  if (!existsSync(catalogPath)) {
    console.log("Coverage: data/external-catalog.json not present — nothing to check.");
    process.exit(0);
  }
  let catalog;
  try {
    catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  } catch (e) {
    console.error(`Coverage: catalog is not valid JSON (${e.message}).`);
    process.exit(1);
  }
  hosts = Array.isArray(catalog.hosts) ? catalog.hosts : catalog.host ? [catalog.host] : [];
  items = catalog.items ?? [];
  if (hosts.length === 0) {
    console.log("Coverage: no hosts declared — nothing to check.");
    process.exit(0);
  }
}

// --- preview registry (documented-not-rendered) ------------------------------
// Which catalog names have a registered live preview scene. A regex over the
// registration lines is enough here — this is advisory tooling, and the
// registry's shape (`hostPreviews["name"] = …` / `hostPreviews["surface:name"]`)
// is part of its documented contract.
const previewKeys = new Set();
const registryPath = path.join(root, "components", "host-previews", "registry.tsx");
const registryPresent = existsSync(registryPath);
if (registryPresent) {
  const registrySrc = readFileSync(registryPath, "utf8");
  for (const line of registrySrc.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue; // commented-out ≠ registered
    const m = /hostPreviews\[\s*["'`]([^"'`]+)["'`]\s*\]\s*=/.exec(trimmed);
    if (m) previewKeys.add(m[1]);
  }
}

// --- sweep -------------------------------------------------------------------
const fallbackSurface = hosts[0]?.surface;

// Surface platforms from the seed (same derivation as check-previews.mjs):
// "web-ness" comes from the declared platform, never a magic surface id.
const surfacesSeedPath = path.join(root, "lib/system/seed/surfaces.ts");
const surfacesSeed = existsSync(surfacesSeedPath)
  ? readFileSync(surfacesSeedPath, "utf8")
  : "";
const surfacePlatforms = new Map(
  [...surfacesSeed.matchAll(/id:\s*"([^"]+)"[^}]*?platform:\s*"([^"]+)"/g)].map(
    (m) => [m[1], m[2]]
  )
);
const isWebSurface = (surfaceId) =>
  surfacePlatforms.size === 0 || surfacePlatforms.get(surfaceId) === "web";

// Standalone surfaces ship their own component set and do NOT consume the
// shared library (lib/system/surfaces.ts) — exclude them when measuring shared
// adoption, or their namesake local components (a local <Badge>) read as false
// adopters of the shared one. Parsed from the surfaces seed, as check-previews.
// (`surfacesSeedPath` is already bound above — reuse it, don't redeclare.)
const standaloneSurfaces = new Set(
  existsSync(surfacesSeedPath)
    ? [...readFileSync(surfacesSeedPath, "utf8").matchAll(/id:\s*"([^"]+)"[^}]*standalone:\s*true/g)].map((m) => m[1])
    : []
);

for (const host of hosts) {
  const hostRootAbs = path.resolve(root, host.root);
  if (!existsSync(hostRootAbs)) {
    console.log(`Coverage: host not found at ${host.root} — skipping (expected off-machine, e.g. CI).`);
    continue;
  }
  const hostItems = items.filter(
    (it) => (it.surface ?? fallbackSurface) === (host.surface ?? fallbackSurface)
  );
  const documented = new Set(hostItems.map((it) => norm(it.hostPath ?? "")));

  const files = walkComponents(hostRootAbs);
  const candidates = files
    .map((rel) => ({ rel: norm(rel), exports: exportsOf(path.join(hostRootAbs, rel)) }))
    .filter((c) => c.exports.length > 0);

  const uncataloged = candidates.filter((c) => !documented.has(c.rel));

  // Inline-invention smell: files that define 2+ local (non-exported) components.
  // These primitives were born inside a screen and are invisible to the catalog.
  const inventionSmell = files
    .map((rel) => ({ rel: norm(rel), locals: localComponentsOf(path.join(hostRootAbs, rel)) }))
    .filter((c) => c.locals.length >= 2);

  // Live unused check. For an app surface, "used" = rendered somewhere in that
  // app's own source. For the SHARED library the package's own source is the
  // wrong corpus — its consumers are the app surfaces, not the package itself —
  // so adoption is measured across the CONSUMING surfaces instead (standalone
  // ones excluded). A shared component no surface renders is "not yet adopted".
  const isShared = (host.surface ?? fallbackSurface) === "shared";
  const usageRoots = (
    isShared
      ? hosts
          .filter((h) => {
            const s = h.surface ?? fallbackSurface;
            return s !== "shared" && !standaloneSurfaces.has(s);
          })
          .map((h) => path.resolve(root, h.root))
      : [hostRootAbs]
  ).filter((abs) => existsSync(abs));
  const webCorpus = [];
  if (isWebSurface(host.surface ?? fallbackSurface)) {
    for (const rootAbs of usageRoots) {
      for (const rel of walkAll(rootAbs)) {
        const abs = path.join(rootAbs, rel);
        try {
          if (statSync(abs).size > MAX_FILE_BYTES) continue;
          webCorpus.push(readFileSync(abs, "utf8"));
        } catch {
          /* skip unreadable */
        }
      }
    }
  }
  const jsxTag = (name) =>
    "<" + name.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  const liveFileCount = (name) => {
    if (webCorpus.length === 0) return null;
    const re = new RegExp(`${jsxTag(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[\\s/>])`);
    return webCorpus.filter((text) => re.test(text)).length;
  };
  // Shared adoption is a LIVE measure across consumer surfaces — the cataloger's
  // intake-time snapshot isn't an adoption signal, so don't let it mask a real
  // zero (an empty/absent consumer corpus means "not adopted", not "unknown").
  // App surfaces keep the snapshot fallback for their non-web (e.g. mobile) case.
  const unusedCataloged = hostItems.filter((it) =>
    isShared
      ? (liveFileCount(it.name) ?? 0) === 0
      : (liveFileCount(it.name) ?? it.usage?.fileCount ?? 0) === 0
  );

  /**
   * The headline reports CATALOGED **and** RENDERED, because reading one as the
   * other is the mistake this line exists to prevent. "14 candidates, 14
   * cataloged" was taken as full coverage on a surface where all 14 rendered as
   * bare code placeholders — the rendering gap was real, was listed further down
   * this same report, and still got read as done.
   *
   * Cataloged means documented. Rendered means the browser can back the claim up.
   * A surface is only covered when both numbers match the candidate count.
   */
  const surfaceOfItem = (it) => it.surface ?? host.surface ?? fallbackSurface;
  const isRendered = (it) =>
    previewKeys.has(it.name) ||
    (surfaceOfItem(it) && previewKeys.has(`${surfaceOfItem(it)}:${it.name}`)) ||
    (it.examples ?? []).some((ex) => ex.image);
  const renderedCount = registryPresent ? hostItems.filter(isRendered).length : null;

  console.log(
    `\n${host.name ?? host.root} — ${candidates.length} candidate component files, ` +
      `${hostItems.length} cataloged` +
      (renderedCount === null
        ? ""
        : `, ${renderedCount} rendered${renderedCount < hostItems.length ? ` (${hostItems.length - renderedCount} documented-only)` : ""}`)
  );
  if (uncataloged.length > 0) {
    console.log(`\n  Uncataloged candidates (${uncataloged.length}) — the app has these, the catalog doesn't:`);
    for (const c of uncataloged.slice(0, 40)) {
      console.log(`    · ${c.rel}  (${c.exports.slice(0, 4).join(", ")}${c.exports.length > 4 ? ", …" : ""})`);
    }
    if (uncataloged.length > 40) console.log(`    … and ${uncataloged.length - 40} more`);
    console.log("  Triage: real design-system pieces → re-run the component-cataloger on them; page one-offs → ignore.");
  } else if (hostItems.length > 0) {
    console.log("  Every candidate component file is cataloged.");
  }
  if (unusedCataloged.length > 0 && isShared) {
    console.log(`\n  Shared components not yet adopted by any surface (${unusedCataloged.length}):`);
    for (const it of unusedCataloged) console.log(`    · ${it.name}  (${it.hostPath})`);
    console.log("  Expected for a shared library — available for any surface to adopt, not fiction. Prune only if genuinely abandoned.");
  } else if (unusedCataloged.length > 0) {
    console.log(`\n  ⚠ Cataloged but UNUSED in the host (${unusedCataloged.length}) — fiction risk:`);
    for (const it of unusedCataloged) console.log(`    · ${it.name}  (${it.hostPath})`);
    console.log("  Either dead host code worth flagging to the team, or catalog noise worth pruning.");
  }

  if (inventionSmell.length > 0) {
    console.log(`\n  ⚠ Inline-invented components (${inventionSmell.length} file${inventionSmell.length === 1 ? "" : "s"}) — DS-worthy primitives born inside a screen, invisible to the catalog:`);
    for (const c of inventionSmell.slice(0, 20)) {
      console.log(`    · ${c.rel}  (${c.locals.slice(0, 4).join(", ")}${c.locals.length > 4 ? ", …" : ""})`);
    }
    if (inventionSmell.length > 20) console.log(`    … and ${inventionSmell.length - 20} more`);
    console.log("  Triage: a genuinely reusable one (a Checkbox, a Stepper) → promote to the component set + catalog it; a true one-off → leave it.");
  }

  // Documented but not rendered: no preview scene registered and no screenshot
  // example — these cards show a bare `<name />` placeholder in the galleries.
  if (registryPresent) {
    const surfaceOf = (it) => it.surface ?? host.surface ?? fallbackSurface;
    const hasPreview = (it) =>
      previewKeys.has(it.name) || (surfaceOf(it) && previewKeys.has(`${surfaceOf(it)}:${it.name}`));
    const hasScreenshot = (it) => (it.examples ?? []).some((ex) => ex.image);
    const unrendered = hostItems.filter((it) => !hasPreview(it) && !hasScreenshot(it));
    if (unrendered.length > 0) {
      console.log(`\n  ⚠ Documented but NOT RENDERED (${unrendered.length}) — cards degrade to a code placeholder:`);
      for (const it of unrendered.slice(0, 40)) console.log(`    · ${it.name}  (${it.hostPath})`);
      if (unrendered.length > 40) console.log(`    … and ${unrendered.length - 40} more`);
      console.log("  Port them live via the port-host-component skill (Path A), or add a screenshot example where the compat gate blocks importing.");
    }
  }
}
console.log("\nAdvisory only — exit 0. Freshness of cataloged entries is check:host.");
