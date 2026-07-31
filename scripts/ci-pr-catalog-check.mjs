#!/usr/bin/env node
/**
 * PR sync gate (CI) — diff-aware companion to check-host-coverage.mjs /
 * check-pages.mjs, and the automated half of the "keep the Synclair layer in
 * sync with the host code" story (the manual half is the component-cataloger /
 * page-mapper / knowledge-harvester / existing-project-intake skills).
 *
 * Given the list of files a PR changes, reports only the catalog work THIS PR
 * introduces (never the pre-existing backlog, which stays advisory in the hub):
 *
 *   1. Uncataloged component files the PR adds/edits (candidates by the same
 *      rules as the coverage scan: components|ui dir, PascalCase export).
 *   2. Cataloged entries whose host source the PR touches (they go stale the
 *      moment this merges — the cataloger should refresh them on this branch).
 *   3. Cataloged entries with neither a preview scene nor a screenshot
 *      (documented-but-not-rendered), flagged when PR-related.
 *   4. Host route files (Next app-router page.*) the PR adds that data/
 *      pages-map.json doesn't know, and mapped routes whose source it deletes.
 *   5. Host docs (PRDs/specs/ADRs in doc-ish dirs) the PR adds/edits that the
 *      knowledge manifest (lib/system/knowledge/sources.ts) doesn't reference.
 *
 * Topology-agnostic: it derives the Synclair app root from its own location and
 * the repo root from git (or $GITHUB_WORKSPACE in CI), so it works whether
 * Synclair is the whole repo (standalone/watcher) or a subdirectory of the host
 * repo (embedded/co-located). It NO-OPS when there is no host catalog yet
 * (fresh clone / new-project mode): no hosts → no gaps → "in sync".
 *
 * Usage: node scripts/ci-pr-catalog-check.mjs <changed-files.txt>
 *   (paths in the file are repo-root-relative, e.g. `git diff --name-only`)
 * Writes a markdown comment body to <os.tmpdir()>/synclair-catalog-comment.md
 * and, when $GITHUB_OUTPUT is set, `has_gaps` + `gap_files` + `comment_path`
 * outputs for the catalog job.
 * Always exits 0 — the gate informs; the catalog job (if enabled) acts.
 */
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const synclairRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Repo root = where the PR diff paths are rooted. In CI that's $GITHUB_WORKSPACE;
// locally, ask git; if neither is available, assume Synclair IS the repo.
function detectRepoRoot() {
  if (process.env.GITHUB_WORKSPACE) return path.resolve(process.env.GITHUB_WORKSPACE);
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd: synclairRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return synclairRoot;
  }
}
const repoRoot = detectRepoRoot();

const changedListPath = process.argv[2];
if (!changedListPath) {
  console.error("usage: ci-pr-catalog-check.mjs <changed-files.txt>");
  process.exit(1);
}
const changed = readFileSync(changedListPath, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

const catalogPath = path.join(synclairRoot, "data", "external-catalog.json");
const catalog = existsSync(catalogPath)
  ? JSON.parse(readFileSync(catalogPath, "utf8"))
  : { hosts: [], items: [] };
const hosts = Array.isArray(catalog.hosts) ? catalog.hosts : catalog.host ? [catalog.host] : [];
const items = catalog.items ?? [];

// Repo-root-relative prefix of each host (e.g. synclair/../prototype -> "prototype").
// Hosts that resolve OUTSIDE the repo (watcher-mode siblings) get a null prefix —
// the CI in this repo can't see their files, so there is nothing to gate.
const hostEntries = hosts.map((h) => {
  const rel = path.relative(repoRoot, path.resolve(synclairRoot, h.root)).split(path.sep).join("/");
  return { surface: h.surface, prefix: rel && !rel.startsWith("..") ? rel : null };
});
const hostPrefixes = hostEntries.map((h) => h.prefix).filter(Boolean);

// Per-item host resolution: items carry a `surface`, hosts map surface → root
// (lib/system/external.ts — one host per surface; items without a surface
// belong to the first host). Every per-item path below must resolve against
// ITS host's prefix, never hosts[0]'s — multi-host repos diverge otherwise.
// Returns null when the item's host sits outside this repo (nothing to gate).
const fallbackSurface = hosts[0]?.surface;
function prefixForItem(it) {
  const surface = it.surface ?? fallbackSurface;
  const entry = hostEntries.find((h) => h.surface === surface) ?? hostEntries[0];
  return entry?.prefix ?? null;
}

const norm = (p) => p.replace(/^\.\//, "").split(path.sep).join("/");
const documented = new Set(items.map((it) => norm(it.hostPath ?? "")));

const SKIP_FILE = /\.(test|spec|stories|docs|d)\.tsx?$|\.d\.ts$/;
const EXPORT_PATTERNS = [
  /export\s+default\s+function\s+([A-Z][A-Za-z0-9]*)/g,
  /export\s+(?:async\s+)?function\s+([A-Z][A-Za-z0-9]*)/g,
  /export\s+const\s+([A-Z][A-Za-z0-9]*)\s*(?:=|:)/g,
];
function exportsOf(abs) {
  try {
    const src = readFileSync(abs, "utf8");
    const names = new Set();
    for (const pattern of EXPORT_PATTERNS) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(src)) !== null) names.add(m[1]);
    }
    return [...names];
  } catch {
    return [];
  }
}
// Keep in sync with lib/system/host-scan.ts + check-host-coverage.mjs. Feature-
// organized UI (screens/views/features/shell/blocks/layouts) counts too — the
// catalog gate must not go blind to a whole UI tree kept outside components/.
const UI_DIR_SEGMENTS = new Set([
  "components", "ui", "shell", "screens", "views", "features", "blocks", "layouts",
]);
const isComponentDir = (rel) => rel.split("/").some((seg) => UI_DIR_SEGMENTS.has(seg));

// 1. Uncataloged candidates introduced/edited by this PR.
const uncataloged = [];
for (const file of changed) {
  const prefix = hostPrefixes.find((p) => file.startsWith(p + "/"));
  if (!prefix) continue;
  const hostRel = file.slice(prefix.length + 1);
  if (!/\.(tsx|jsx)$/.test(hostRel) || SKIP_FILE.test(hostRel)) continue;
  if (!isComponentDir(hostRel)) continue;
  if (documented.has(norm(hostRel))) continue;
  const abs = path.join(repoRoot, file);
  if (!existsSync(abs)) continue; // deleted in this PR
  const exportNames = exportsOf(abs);
  if (exportNames.length === 0) continue;
  uncataloged.push({ hostRel, file: norm(file), exports: exportNames });
}

// 2. Cataloged entries whose source this PR touches AND whose stored hash no
// longer matches — a PR that already refreshed the entry (code + catalog in
// the same branch) is in sync, not stale. Each entry resolves against ITS OWN
// host's prefix (surface → host), so a same-named file changed under a
// DIFFERENT host can never stale it or feed the wrong bytes into the hash.
const changedSet = new Set(changed.map(norm));
const staled = [];
for (const it of items) {
  const rel = norm(it.hostPath ?? "");
  const prefix = prefixForItem(it);
  if (!rel || !prefix) continue;
  const file = norm(path.join(prefix, rel));
  if (!changedSet.has(file)) continue;
  const abs = path.join(repoRoot, file);
  if (!existsSync(abs)) {
    staled.push({ it, file }); // source deleted but still cataloged
    continue;
  }
  const hash = createHash("sha256").update(readFileSync(abs)).digest("hex");
  if (hash !== it.sourceHash) staled.push({ it, file });
}

// 3. Documented but not rendered (preview registry parse, comment-aware).
const previewKeys = new Set();
const registryPath = path.join(synclairRoot, "components", "host-previews", "registry.tsx");
if (existsSync(registryPath)) {
  for (const line of readFileSync(registryPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    const m = /hostPreviews\[\s*["'`]([^"'`]+)["'`]\s*\]\s*=/.exec(trimmed);
    if (m) previewKeys.add(m[1]);
  }
}
const unrendered = items.filter((it) => {
  const hasPreview =
    previewKeys.has(it.name) || (it.surface && previewKeys.has(`${it.surface}:${it.name}`));
  const hasScreenshot = (it.examples ?? []).some((ex) => ex.image);
  return !hasPreview && !hasScreenshot;
});
const unrenderedFromPr = unrendered.filter((it) => {
  const prefix = prefixForItem(it); // its own host, not any host
  return prefix && changedSet.has(norm(path.join(prefix, it.hostPath ?? "")));
});

// 4. Route files this PR adds that the pages map doesn't know (Next app-router
// convention — the page-mapper agent's enumeration rule), plus mapped routes
// whose source file this PR deletes. Dormant when there's no pages map yet.
const pagesMapPath = path.join(synclairRoot, "data", "pages-map.json");
const unmappedPages = [];
const removedPages = [];
{
  let pagesMap = null;
  try {
    if (existsSync(pagesMapPath)) pagesMap = JSON.parse(readFileSync(pagesMapPath, "utf8"));
  } catch {
    pagesMap = null; // unreadable map — the pages check stays quiet
  }
  const pages = Array.isArray(pagesMap?.pages) ? pagesMap.pages : [];
  let pagesPrefix = hostPrefixes[0] ?? "";
  if (pagesMap?.repo?.root) {
    const rel = path
      .relative(repoRoot, path.resolve(synclairRoot, pagesMap.repo.root))
      .split(path.sep)
      .join("/");
    if (rel && !rel.startsWith("..")) pagesPrefix = rel;
  }
  if (pages.length > 0 && pagesPrefix) {
    const mappedFiles = new Set(pages.map((p) => norm(p.file ?? "")));
    const PAGE_FILE = /(^|\/)app\/(.+\/)?page\.(tsx|ts|jsx|js)$/;
    for (const file of changed) {
      if (!file.startsWith(pagesPrefix + "/")) continue;
      const hostRel = file.slice(pagesPrefix.length + 1);
      if (!PAGE_FILE.test(hostRel)) continue;
      if (mappedFiles.has(norm(hostRel))) continue;
      if (!existsSync(path.join(repoRoot, file))) continue; // deleted in this PR
      const segs = hostRel.replace(/^(src\/)?app\//, "").split("/");
      segs.pop(); // page.*
      const route = "/" + segs.filter((s) => !(s.startsWith("(") && s.endsWith(")"))).join("/");
      unmappedPages.push({ hostRel, file: norm(file), route: route === "//" ? "/" : route });
    }
    for (const p of pages) {
      const f = norm(`${pagesPrefix}/${p.file ?? ""}`);
      if (changedSet.has(f) && !existsSync(path.join(repoRoot, f)))
        removedPages.push(p.route ?? p.id ?? "<unnamed>");
    }
  }
}

// 5. Docs this PR adds/edits in doc-ish host dirs that the knowledge manifest
// never references (by host-relative path or basename). Boilerplate and agent
// context files are skipped — they're not knowledge sources.
const sourcesPath = path.join(synclairRoot, "lib", "system", "knowledge", "sources.ts");
const sourcesText = existsSync(sourcesPath) ? readFileSync(sourcesPath, "utf8") : "";
const DOC_DIR_SEGMENTS = new Set([
  "docs", "_docs", "doc", "adr", "adrs", "decisions", "specs", "spec",
  "prd", "prds", "product", "rfc", "rfcs", "wiki", "handbook",
]);
const SKIP_DOC = /^(readme|changelog|contributing|license|code_of_conduct|security|claude|agents)\b/i;
const unregisteredDocs = [];
for (const file of changed) {
  const prefix = hostPrefixes.find((p) => file.startsWith(p + "/"));
  if (!prefix) continue;
  const hostRel = file.slice(prefix.length + 1);
  if (!/\.(md|mdx)$/i.test(hostRel)) continue;
  const segs = hostRel.split("/");
  const base = segs[segs.length - 1];
  if (SKIP_DOC.test(base)) continue;
  if (!segs.slice(0, -1).some((s) => DOC_DIR_SEGMENTS.has(s.toLowerCase()))) continue;
  if (!existsSync(path.join(repoRoot, file))) continue;
  if (sourcesText.includes(hostRel) || sourcesText.includes(base)) continue;
  unregisteredDocs.push({ hostRel, file: norm(file) });
}

// --- report ------------------------------------------------------------------
const hasGaps =
  uncataloged.length > 0 ||
  staled.length > 0 ||
  unrenderedFromPr.length > 0 ||
  unmappedPages.length > 0 ||
  removedPages.length > 0 ||
  unregisteredDocs.length > 0;
const lines = ["## Synclair sync gate", ""];
if (!hasGaps) {
  lines.push("✅ **Synclair layer in sync with this PR** — no uncataloged components, no unmapped routes, no unregistered docs, no cataloged sources touched.");
} else {
  if (uncataloged.length > 0) {
    lines.push(`**This PR introduces ${uncataloged.length} uncataloged component file(s):**`);
    for (const c of uncataloged) lines.push(`- \`${c.hostRel}\` (${c.exports.slice(0, 4).join(", ")})`);
    lines.push("");
  }
  if (staled.length > 0) {
    lines.push(`**This PR touches ${staled.length} cataloged source(s)** — their entries go stale on merge:`);
    for (const { it } of staled) lines.push(`- \`${it.name}\` (\`${it.hostPath}\`)`);
    lines.push("");
  }
  if (unrenderedFromPr.length > 0) {
    lines.push(`**Documented but not rendered (from this PR):**`);
    for (const it of unrenderedFromPr) lines.push(`- \`${it.name}\` — no preview scene or screenshot`);
    lines.push("");
  }
  if (unmappedPages.length > 0) {
    lines.push(`**This PR adds ${unmappedPages.length} route(s) missing from the pages map:**`);
    for (const p of unmappedPages) lines.push(`- \`${p.route}\` (\`${p.hostRel}\`)`);
    lines.push("");
  }
  if (removedPages.length > 0) {
    lines.push(`**This PR deletes the source of ${removedPages.length} mapped route(s)** — drop them from \`data/pages-map.json\`:`);
    for (const r of removedPages) lines.push(`- \`${r}\``);
    lines.push("");
  }
  if (unregisteredDocs.length > 0) {
    lines.push(`**This PR touches ${unregisteredDocs.length} doc(s) the knowledge manifest doesn't reference:**`);
    for (const d of unregisteredDocs) lines.push(`- \`${d.hostRel}\``);
    lines.push("");
  }
  lines.push("_The sync job on this workflow runs the sync agent on this branch and pushes the catalog / pages-map / knowledge commit here — no action needed. (If it was skipped, add the `ANTHROPIC_API_KEY` repo secret to enable it, or fix manually: `component-cataloger` skill for components, `page-mapper` for routes, `knowledge-harvester` for docs.)_");
}
if (unrendered.length > unrenderedFromPr.length) {
  lines.push("", `<sub>Pre-existing backlog (not this PR): ${unrendered.length - unrenderedFromPr.length} entr(y/ies) documented-but-not-rendered repo-wide — see \`npm run check:coverage\`.</sub>`);
}

const body = lines.join("\n");
console.log(body);
const commentPath = path.join(os.tmpdir(), "synclair-catalog-comment.md");
writeFileSync(commentPath, body);

if (process.env.GITHUB_OUTPUT) {
  const gapFiles = [
    ...uncataloged.map((c) => c.file),
    ...staled.map((s) => s.file),
  ];
  appendFileSync(process.env.GITHUB_OUTPUT, `has_gaps=${hasGaps}\n`);
  // Where the comment body was written — the workflow's comment step reads
  // this instead of assuming the runner's tmpdir is /tmp.
  appendFileSync(process.env.GITHUB_OUTPUT, `comment_path=${commentPath}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `gap_files=${[...new Set(gapFiles)].join(",")}\n`);
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `page_gaps=${[...new Set(unmappedPages.map((p) => p.file))].join(",")}\n`,
  );
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `knowledge_gaps=${[...new Set(unregisteredDocs.map((d) => d.file))].join(",")}\n`,
  );
  // Whether this repo even has a host catalog — the workflow guard uses this to
  // stay dormant in new-project / blank clones (and in the foundation itself).
  appendFileSync(process.env.GITHUB_OUTPUT, `has_catalog=${hostPrefixes.length > 0}\n`);
}
