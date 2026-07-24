#!/usr/bin/env node
/**
 * PR catalog gate (CI) — diff-aware companion to check-host-coverage.mjs, and
 * the automated half of the "keep the catalog in sync with the host code" story
 * (the manual half is the component-cataloger / existing-project-intake skills).
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
 *
 * Topology-agnostic: it derives the Synclair app root from its own location and
 * the repo root from git (or $GITHUB_WORKSPACE in CI), so it works whether
 * Synclair is the whole repo (standalone/watcher) or a subdirectory of the host
 * repo (embedded/co-located). It NO-OPS when there is no host catalog yet
 * (fresh clone / new-project mode): no hosts → no gaps → "in sync".
 *
 * Usage: node scripts/ci-pr-catalog-check.mjs <changed-files.txt>
 *   (paths in the file are repo-root-relative, e.g. `git diff --name-only`)
 * Writes a markdown comment body to /tmp/synclair-catalog-comment.md and, when
 * $GITHUB_OUTPUT is set, `has_gaps` + `gap_files` outputs for the catalog job.
 * Always exits 0 — the gate informs; the catalog job (if enabled) acts.
 */
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
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
// Hosts that resolve OUTSIDE the repo (watcher-mode siblings) are dropped — the
// CI in this repo can't see their files, so there is nothing to gate.
const hostPrefixes = hosts
  .map((h) => path.relative(repoRoot, path.resolve(synclairRoot, h.root)).split(path.sep).join("/"))
  .filter((p) => p && !p.startsWith(".."));

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
  uncataloged.push({ hostRel, exports: exportNames });
}

// 2. Cataloged entries whose source this PR touches AND whose stored hash no
// longer matches — a PR that already refreshed the entry (code + catalog in
// the same branch) is in sync, not stale.
const changedSet = new Set(changed.map(norm));
const staled = items.filter((it) => {
  const prefix = hostPrefixes[0] ?? "";
  if (!changedSet.has(norm(path.join(prefix, it.hostPath ?? "")))) return false;
  const abs = path.join(repoRoot, prefix, it.hostPath ?? "");
  if (!existsSync(abs)) return true; // source deleted but still cataloged
  const hash = createHash("sha256").update(readFileSync(abs)).digest("hex");
  return hash !== it.sourceHash;
});

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
  const prefix = hostPrefixes[0] ?? "";
  return changedSet.has(norm(path.join(prefix, it.hostPath ?? "")));
});

// --- report ------------------------------------------------------------------
const hasGaps = uncataloged.length > 0 || staled.length > 0 || unrenderedFromPr.length > 0;
const lines = ["## Synclair catalog gate", ""];
if (!hasGaps) {
  lines.push("✅ **Catalog in sync with this PR** — no new component files, no cataloged sources touched.");
} else {
  if (uncataloged.length > 0) {
    lines.push(`**This PR introduces ${uncataloged.length} uncataloged component file(s):**`);
    for (const c of uncataloged) lines.push(`- \`${c.hostRel}\` (${c.exports.slice(0, 4).join(", ")})`);
    lines.push("");
  }
  if (staled.length > 0) {
    lines.push(`**This PR touches ${staled.length} cataloged source(s)** — their entries go stale on merge:`);
    for (const it of staled) lines.push(`- \`${it.name}\` (\`${it.hostPath}\`)`);
    lines.push("");
  }
  if (unrenderedFromPr.length > 0) {
    lines.push(`**Documented but not rendered (from this PR):**`);
    for (const it of unrenderedFromPr) lines.push(`- \`${it.name}\` — no preview scene or screenshot`);
    lines.push("");
  }
  lines.push("_The catalog job on this workflow runs the cataloger agent on this branch and pushes the catalog + preview commit here — no action needed. (If it was skipped, add the `ANTHROPIC_API_KEY` repo secret to enable it, or catalog manually with the `component-cataloger` skill.)_");
}
if (unrendered.length > unrenderedFromPr.length) {
  lines.push("", `<sub>Pre-existing backlog (not this PR): ${unrendered.length - unrenderedFromPr.length} entr(y/ies) documented-but-not-rendered repo-wide — see \`npm run check:coverage\`.</sub>`);
}

const body = lines.join("\n");
console.log(body);
writeFileSync("/tmp/synclair-catalog-comment.md", body);

if (process.env.GITHUB_OUTPUT) {
  const withPrefix = (p) => (hostPrefixes[0] ? path.join(hostPrefixes[0], p) : p);
  const gapFiles = [
    ...uncataloged.map((c) => withPrefix(c.hostRel)),
    ...staled.map((it) => withPrefix(it.hostPath)),
  ];
  appendFileSync(process.env.GITHUB_OUTPUT, `has_gaps=${hasGaps}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `gap_files=${[...new Set(gapFiles)].join(",")}\n`);
  // Whether this repo even has a host catalog — the workflow guard uses this to
  // stay dormant in new-project / blank clones (and in the foundation itself).
  appendFileSync(process.env.GITHUB_OUTPUT, `has_catalog=${hostPrefixes.length > 0}\n`);
}
