#!/usr/bin/env node
/**
 * Foundation-hygiene scan of the HOST codebase — finds where host code steps
 * outside its own design foundation: inline styles, raw hex / color functions,
 * Tailwind arbitrary values, !important, and native elements used where a
 * design-system primitive exists. Writes .synclair/cache/host-hygiene.json (schema +
 * rendering: lib/system/host-hygiene.ts → /synclair/hygiene).
 *
 * ADVISORY by design: always exits 0 — this is a read on someone else's repo,
 * a conversation starter, never a build gate.
 *
 * Usage:
 *   npm run scan:hygiene                      # hosts from data/external-catalog.json
 *   node scripts/scan-host-hygiene.mjs --host ../acme-app --name acme-app
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// One owner per artifact (B3): the write validates in the TS artifact module;
// tsx's loader registers here so plain `node` keeps working everywhere.
import { register as registerTsx } from "tsx/esm/api";
registerTsx();


const root = process.cwd();
const MAX_FILE_BYTES = 300 * 1024;
const FINDINGS_CAP_PER_RULE = 200;
const SNIPPET_MAX = 160;

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", "coverage",
  "public", "__tests__", "__mocks__", "e2e", ".storybook", ".turbo",
  ".vercel", "synclair",
]);
const SKIP_FILE = /\.(test|spec|stories|docs|d)\.(t|j)sx?$/;

// --- resolve hosts -----------------------------------------------------------
function resolveHosts() {
  const args = process.argv.slice(2);
  const hostFlag = args.indexOf("--host");
  if (hostFlag !== -1) {
    const hostPath = args[hostFlag + 1];
    if (!hostPath) {
      console.error("--host requires a path");
      process.exit(1);
    }
    const nameFlag = args.indexOf("--name");
    return [{ name: nameFlag !== -1 ? args[nameFlag + 1] : path.basename(hostPath), root: hostPath }];
  }
  const catalogPath = path.join(root, "data", "external-catalog.json");
  if (!existsSync(catalogPath)) return [];
  try {
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    const hosts = Array.isArray(catalog.hosts) ? catalog.hosts : catalog.host ? [catalog.host] : [];
    return hosts.filter((h) => h && typeof h.root === "string");
  } catch {
    return [];
  }
}

const hosts = resolveHosts();
if (hosts.length === 0) {
  console.log("Hygiene: no hosts declared (data/external-catalog.json) and no --host given — nothing to scan.");
  process.exit(0);
}

// --- rules -------------------------------------------------------------------
// Each rule: id + a per-line test. `uiDir` marks lines inside the host's own
// primitive directory (components/ui), where raw values are the IMPLEMENTATION
// of the system, not a bypass of it — those files are skipped for most rules.
const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const LINKISH = /href=|http|mailto|import |from ["']/;
// Tailwind's built-in LITERAL color utilities (white/black + the numbered
// palette) — these bypass the project's semantic token scale exactly like a raw
// hex does, but are invisible to the raw-hex rule because they're class names.
// `transparent`/`current`/`inherit` are intentionally allowed (legit utilities).
const TW_PREFIX = "text|bg|border|ring|fill|stroke|divide|outline|decoration|accent|caret|from|via|to|placeholder|shadow";
const TW_HUE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const RAW_COLOR_UTILITY = new RegExp(
  `\\b(?:${TW_PREFIX})-(?:white|black|(?:${TW_HUE})-(?:50|100|200|300|400|500|600|700|800|900|950))\\b`,
);

function makeRules(hostRootAbs) {
  // native-element only fires for primitives the host actually has.
  const uiDirs = ["components/ui", "src/components/ui", "app/components/ui"];
  const primitiveExists = (el) =>
    uiDirs.some((d) => existsSync(path.join(hostRootAbs, d, `${el}.tsx`)));
  const nativeEls = ["button", "input", "select", "textarea"].filter(primitiveExists);
  const nativeRe = nativeEls.length
    ? new RegExp(`<(${nativeEls.join("|")})[\\s>]`)
    : null;

  return [
    { id: "inline-style", skipUiDir: false, test: (line) => /style=\{\{/.test(line) },
    {
      id: "raw-hex-color",
      skipUiDir: true,
      test: (line) => HEX.test(line) && !LINKISH.test(line),
    },
    {
      id: "color-function",
      skipUiDir: true,
      test: (line) => /\b(?:rgba?|hsla?|oklch)\(/.test(line) && !LINKISH.test(line),
    },
    {
      id: "arbitrary-value",
      skipUiDir: true,
      test: (line) => /\w-\[(?:#|\d)/.test(line) && /class(Name)?=/.test(line),
    },
    {
      id: "raw-color-utility",
      skipUiDir: true,
      test: (line) => RAW_COLOR_UTILITY.test(line) && !LINKISH.test(line),
    },
    { id: "important", skipUiDir: false, test: (line) => /!important/.test(line) },
    {
      id: "native-element",
      skipUiDir: true,
      test: (line) => (nativeRe ? nativeRe.test(line) : false),
    },
  ];
}

// --- walk + scan -------------------------------------------------------------
function walk(dir, rootAbs, files) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(abs, rootAbs, files);
    } else if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name) && !SKIP_FILE.test(entry.name)) {
      files.push(path.relative(rootAbs, abs));
    }
  }
}

const allFindings = [];
/** Host-prefixed paths of every file a finding was recorded in — the anchor. */
const flaggedFiles = new Set();
const perRule = new Map(); // id -> { count, files:Set, kept }
const perFile = new Map(); // hostPath -> { count, byRule }
let scannedFiles = 0;
const hostMeta = [];

// A monorepo "shared" host may root at an ancestor of the per-app hosts
// (shared ".." containing "../apps/portal"). Exclude nested host roots from
// the outer host's walk, or every app file is scanned (and counted) twice.
const allHostRootsAbs = hosts
  .map((h) => path.resolve(root, h.root))
  .filter((p) => existsSync(p));
for (const host of hosts) {
  const hostRootAbs = path.resolve(root, host.root);
  if (!existsSync(hostRootAbs)) {
    console.log(`Hygiene: host not found at ${host.root} — skipping.`);
    continue;
  }
  const nestedRoots = allHostRootsAbs.filter(
    (p) => p !== hostRootAbs && p.startsWith(hostRootAbs + path.sep)
  );
  let commit;
  try {
    // stdio: git's own "fatal: not a git repository" goes to stderr and leaked
    // into the scan output on non-git hosts (seen in the C5 intake drill) —
    // the catch already handles the case, so keep stderr quiet.
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: hostRootAbs,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    /* not a git repo */
  }
  hostMeta.push({ name: host.name ?? path.basename(hostRootAbs), root: host.root, commit });

  const rules = makeRules(hostRootAbs);
  const files = [];
  walk(hostRootAbs, hostRootAbs, files);

  for (const rel of files) {
    const abs = path.join(hostRootAbs, rel);
    if (nestedRoots.some((p) => abs.startsWith(p + path.sep))) continue;
    try {
      if (statSync(abs).size > MAX_FILE_BYTES) continue;
    } catch {
      continue;
    }
    scannedFiles += 1;
    // A design-system primitive dir by convention: components/ui, a co-located
    // *-ui set (e.g. <product>-ui), or a top-level primitives/ layer. Raw values
    // here are the IMPLEMENTATION of the system, not a bypass of it.
    const relPosix = rel.split(path.sep).join("/");
    const inUiDir =
      /(^|\/)components\/(ui|[a-z0-9]+-ui)\//.test(relPosix) || /(^|\/)primitives\//.test(relPosix);
    const lines = readFileSync(abs, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > 500) continue; // minified/generated
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
      for (const rule of rules) {
        if (rule.skipUiDir && inUiDir) continue;
        if (!rule.test(line)) continue;
        const stat = perRule.get(rule.id) ?? { count: 0, files: new Set(), kept: 0 };
        stat.count += 1;
        stat.files.add(rel);
        const fileStat = perFile.get(rel) ?? { count: 0, byRule: {} };
        fileStat.count += 1;
        fileStat.byRule[rule.id] = (fileStat.byRule[rule.id] ?? 0) + 1;
        perFile.set(rel, fileStat);
        // Anchor source, collected HERE because this is the only place the host
        // is still known: a finding records `hostPath` relative to its own host
        // and no host id, so the same path in two hosts is indistinguishable
        // afterwards. Prefixing now keeps the anchor unambiguous.
        flaggedFiles.add(`${String(host.root).replace(/\/+$/, "")}/${relPosix}`);
        if (stat.kept < FINDINGS_CAP_PER_RULE) {
          stat.kept += 1;
          allFindings.push({
            rule: rule.id,
            hostPath: rel.split(path.sep).join("/"),
            line: i + 1,
            snippet: trimmed.slice(0, SNIPPET_MAX),
          });
        }
        perRule.set(rule.id, stat);
      }
    }
  }
}

if (hostMeta.length === 0) {
  console.log("Hygiene: no host repos present on this machine — nothing scanned, nothing written.");
  process.exit(0);
}

// --- report ------------------------------------------------------------------
const RULE_ORDER = [
  "inline-style", "raw-hex-color", "color-function",
  "arbitrary-value", "raw-color-utility", "important", "native-element",
];
const rules = RULE_ORDER.filter((id) => perRule.has(id)).map((id) => {
  const s = perRule.get(id);
  return { rule: id, count: s.count, files: s.files.size, truncated: Math.max(0, s.count - s.kept) };
});
const totals = {
  findings: rules.reduce((n, r) => n + r.count, 0),
  files: perFile.size,
  scannedFiles,
};
const topFiles = [...perFile.entries()]
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 10)
  .map(([hostPath, s]) => ({
    hostPath: hostPath.split(path.sep).join("/"),
    count: s.count,
    byRule: s.byRule,
  }));

/**
 * ANCHOR the report to the files it found something in.
 *
 * Not every file scanned. This walk covers hundreds across several hosts, and an
 * anchor over all of them marks the report stale on any edit anywhere in the
 * repo — a warning that fires constantly is one people learn to scroll past, and
 * it would be wrong besides: a clean file changing does not make findings about
 * OTHER files untrue.
 *
 * The files WITH findings are the ones the report actually describes, so they
 * are exactly what should invalidate it. Change one and the report may no longer
 * be right about it; change something else and the report still stands.
 *
 * Paths are recorded relative to THIS repo (`repo.root: "."`) rather than to a
 * host, because the findings span several hosts and an anchor has one base. A
 * per-host base would silently skip every file from the other hosts and leave a
 * hash that looks complete but covers a fraction.
 */
function sourceAnchor() {
  const sourceFiles = [...flaggedFiles].sort();
  if (!sourceFiles.length) return {};
  const hash = createHash("sha256");
  let any = false;
  for (const r of sourceFiles) {
    const abs = path.join(root, r);
    if (!existsSync(abs)) continue;
    hash.update(r);
    hash.update("\n");
    hash.update(readFileSync(abs));
    hash.update("\0");
    any = true;
  }
  return any ? { sourceFiles, sourceHash: hash.digest("hex") } : {};
}

const report = {
  scannedAt: new Date().toISOString(),
  // `repo.root: "."` tells check:freshness to resolve sourceFiles against this
  // repo, which is the only base that reaches every host in a multi-host scan.
  repo: { root: "." },
  hosts: hostMeta,
  totals,
  rules,
  topFiles,
  findings: allFindings,
  provenance: {
    generatedAt: new Date().toISOString(),
    generator: "scan:hygiene",
    confidence: "high",
    // Names the scan in the freshness report; hosts may sit at different
    // commits, so this is the first host's, not a claim about all of them.
    ...(hostMeta[0]?.commit ? { commit: hostMeta[0].commit } : {}),
    ...sourceAnchor(),
  },
};
const { writeHostHygieneArtifact } = await import("../lib/artifacts/host-hygiene.ts");
writeHostHygieneArtifact(report);

console.log(
  `Hygiene: ${totals.findings} finding${totals.findings === 1 ? "" : "s"} across ${totals.files}/${scannedFiles} scanned files → .synclair/cache/host-hygiene.json`
);
for (const r of rules) console.log(`  ${r.rule}: ${r.count} in ${r.files} file${r.files === 1 ? "" : "s"}`);
console.log("View at /synclair/hygiene.");
