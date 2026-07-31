#!/usr/bin/env node
/**
 * Foundation purity check — enforces the seed boundary (foundation-model.md §8)
 * in the direction that keeps clones syncable: **Brain files must contain no
 * project content.** A Brain (hub-skin) file renders the seed; it must never
 * hardcode a project's own values. When it does — e.g. a clone pasting its
 * example tiles straight into `foundations.tsx` — that file diverges from
 * upstream and conflicts on every foundation sync forever. This gate catches
 * the leak at author time and points it back to `lib/system/seed/`.
 *
 * It is self-contained: the project's markers are DERIVED FROM THE SEED itself
 * (the product name in seed/project.ts and the scoped brand CSS-var prefix in
 * seed/foundation.ts), so it needs no network and no upstream diff, and it
 * no-ops on a fresh clone whose seed is still blank. That also makes it
 * promotable verbatim — the same script protects every clone.
 *
 *   node scripts/check-foundation-purity.mjs            report + exit 1 on leak
 *   node scripts/check-foundation-purity.mjs --list     print the sealed set + markers
 *
 * Sealed = pure Brain. Project content belongs in lib/system/seed/ (values,
 * data) — including project example JSX (seed/foundation-tiles.tsx). MIXED
 * files that legitimately hold project identity (app/globals.css, AGENTS.md,
 * next.config.ts, tsconfig.json) are NOT sealed.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const listOnly = args.includes("--list");

/** Explicit pure-Brain files that render the seed and must stay project-free. */
const SEALED_FILES = [
  "components/library/foundations.tsx",
  "components/library/tier-gallery.tsx",
  "components/library/component-doc-view.tsx",
  "components/library/component-card.tsx",
  "components/library/library-explorer.tsx",
  "components/library/card-thumb.tsx",
  "components/viewport-frame.tsx",
  "components/embed-frame.tsx",
  "components/tabs-nav.tsx",
  "components/surface-switcher.tsx",
  "components/hub-page.tsx",
  "components/page-header.tsx",
];
/** Whole Brain dirs to seal, minus the seed/knowledge/reference exclusions. */
const SEALED_DIRS = ["lib/system"];
const DIR_EXCLUDES = [
  "lib/system/seed", // the seed IS where project content lives
  "lib/system/knowledge/sources.ts", // knowledge manifest = seed
  "lib/system/references.ts", // project library = seed
];

function walk(dir, acc) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = path.relative(root, abs);
    if (DIR_EXCLUDES.some((ex) => rel === ex || rel.startsWith(ex + path.sep)))
      continue;
    if (statSync(abs).isDirectory()) walk(abs, acc);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) acc.push(rel);
  }
  return acc;
}

const sealed = new Set(SEALED_FILES);
for (const d of SEALED_DIRS) walk(path.join(root, d), []).forEach((f) => sealed.add(f));

// ---- Derive project markers from the seed (blank seed → no markers) ---------
function readSeed(rel) {
  const p = path.join(root, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

// Product name: seed/project.ts `name: "..."`. Skip the blank-clone placeholder.
const projectSrc = readSeed("lib/system/seed/project.ts");
const nameMatch = projectSrc.match(/name:\s*["'`]([^"'`]+)["'`]/);
const rawName = nameMatch?.[1]?.trim() ?? "";
const PLACEHOLDER_NAMES = new Set(["Your Product", "Product", "", "Acme"]);
const projectName = PLACEHOLDER_NAMES.has(rawName) ? "" : rawName;
const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "");

// Scoped brand CSS-var prefix: the `--x-` prefix that recurs in the seed theme.
const foundationSrc = readSeed("lib/system/seed/foundation.ts");
const prefixCounts = new Map();
for (const m of foundationSrc.matchAll(/["'`](--[a-z][a-z0-9]*-)[a-z0-9-]*["'`]\s*:/g)) {
  prefixCounts.set(m[1], (prefixCounts.get(m[1]) ?? 0) + 1);
}
// A real brand prefix recurs; one-offs are almost always semantic tokens.
const varPrefixes = [...prefixCounts.entries()]
  .filter(([, n]) => n >= 3)
  .map(([p]) => p);

// ---- Build the forbidden-marker matchers ------------------------------------
const markers = [];
if (projectName)
  markers.push({
    label: `product name "${projectName}"`,
    re: new RegExp(`\\b${projectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`),
  });
if (slug && slug.length >= 4 && slug !== projectName.toLowerCase())
  markers.push({ label: `product slug "${slug}"`, re: new RegExp(`\\b${slug}\\b`) });
for (const p of varPrefixes)
  markers.push({ label: `scoped brand var "var(${p}…)"`, re: new RegExp(`var\\(\\s*${p}`) });

if (listOnly) {
  console.log(`Sealed Brain files (${sealed.size}):`);
  [...sealed].sort().forEach((f) => console.log("  " + f));
  console.log(`\nDerived project markers (${markers.length}):`);
  markers.forEach((m) => console.log("  " + m.label));
  if (!markers.length) console.log("  (none — seed is blank; check is a no-op)");
  process.exit(0);
}

if (!markers.length) {
  console.log("Foundation purity: seed is blank — no project markers, nothing to seal.");
  process.exit(0);
}

// ---- Scan --------------------------------------------------------------------
const violations = [];
for (const rel of [...sealed].sort()) {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) continue;
  const lines = readFileSync(abs, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const m of markers) {
      if (m.re.test(line))
        violations.push({ file: rel, line: i + 1, marker: m.label, text: line.trim() });
    }
  });
}

if (!violations.length) {
  console.log(
    `Foundation pure: ${sealed.size} Brain files hold no project content ` +
      `(${markers.length} marker${markers.length === 1 ? "" : "s"} checked).`
  );
  process.exit(0);
}

console.error(
  `Foundation LEAK — ${violations.length} project reference(s) in Brain files.\n` +
    `Brain renders the seed; project content belongs in lib/system/seed/ ` +
    `(project example JSX → seed/foundation-tiles.tsx). Move these, then re-run:\n`
);
for (const v of violations) {
  console.error(`  ✗ ${v.file}:${v.line} — ${v.marker}`);
  console.error(`      ${v.text.slice(0, 100)}`);
}
process.exit(1);
