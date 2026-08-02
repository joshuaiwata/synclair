#!/usr/bin/env node
/**
 * check:knowledge — the source-side freshness check for the knowledge manifest.
 *
 * Every other drift check in this repo anchors to IN-REPO source (a sha256 of
 * committed files: check:ux-docs, check:pages, check:host). The knowledge layer
 * is the one place that links OUT — PRDs/specs/decks living in GitHub, Drive,
 * Notion, Figma (lib/system/knowledge/sources.ts). Each source carries a
 * `distilledAt` (when its in-repo digest was written) but nothing ever compares
 * that against the SOURCE'S real last-modified. So a PRD edited upstream leaves
 * its digest silently lying. This check closes that hole.
 *
 * It is the generalization of the Figma-only staleness already computed in
 * lib/system/knowledge/distill-status.ts (`file.lastModified > distilledAt`) to
 * every linked source — and the source-side twin of `call-home` (which asks the
 * same "have I fallen behind upstream?" question about the foundation itself).
 *
 * Usage:
 *   npm run check:knowledge              probe + write the cache + print a report
 *   npm run check:knowledge -- --json    machine JSON to stdout (still writes cache)
 *   npm run check:knowledge -- --queue   also enqueue stale sources for re-distill
 *   npm run check:knowledge -- --strict  exit 1 if any source is stale (opt-in gate)
 *   npm run check:knowledge -- --help
 *
 * NON-FATAL by default (exit 0) — freshness drift must never punish a routine
 * run, exactly like check:ux-docs. `--strict` is the opt-in gate for a scheduled
 * job. This check makes NETWORK CALLS and so is deliberately kept OUT of
 * `verify-ui` (which must stay hermetic for CI); it is a scheduled / on-demand
 * check, the engine a future daily "knowledge report" runs.
 *
 * Writes data/knowledge/freshness.json — the cache the hub (and the report)
 * read via lib/system/knowledge/freshness.ts. The classify() logic here and
 * `classifyFreshness()` there must stay in lockstep.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  changedSections,
  discoverDocs,
  localPathFor,
  originSlugs,
  probeLocal,
} from "./lib/local-source.mjs";
import { resolveTarget } from "./lib/topology.mjs";

const root = process.cwd();

/**
 * A local source lives in the PRODUCT repo, which in embedded topology is this
 * clone's parent and in watcher topology a sibling. Resolve it the same way
 * every other host-facing script does rather than assuming `root`.
 */
const HUB_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const hostRepoRoot = resolveTarget(HUB_ROOT).hostRoot ?? HUB_ROOT;
const originRepoSlug = originSlugs(hostRepoRoot);
const SOURCES_TS = path.join(root, "lib", "system", "knowledge", "sources.ts");
const FRESHNESS_PATH = path.join(root, "data", "knowledge", "freshness.json");
const REDISTILL_QUEUE_PATH = path.join(root, "data", "knowledge", "redistill-queue.json");

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const doQueue = args.includes("--queue");
const strict = args.includes("--strict");
const doDiscover = args.includes("--discover");

if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "check:knowledge — is any distilled knowledge source stale vs. its upstream?",
      "",
      "  npm run check:knowledge              probe + write cache + report",
      "  npm run check:knowledge -- --json    machine JSON (still writes cache)",
      "  npm run check:knowledge -- --queue   enqueue stale sources for re-distill",
      "  npm run check:knowledge -- --strict  exit 1 if any source is stale",
    ].join("\n")
  );
  process.exit(0);
}

// ── read the manifest ────────────────────────────────────────────────────────
// sources.ts is TypeScript (the app imports it directly). A plain-node CLI can't,
// so we transpile it with the installed compiler and import the result — reading
// the REAL source of truth, no JSON projection to keep in sync. `import type` is
// erased by the transpile, leaving a pure data module.
async function loadSources() {
  if (!existsSync(SOURCES_TS)) return [];
  const require = createRequire(import.meta.url);
  let ts;
  try {
    ts = require("typescript");
  } catch {
    console.error(
      "check:knowledge needs the `typescript` package to read sources.ts (it's a devDependency; run `npm install`)."
    );
    process.exit(1);
  }
  const src = readFileSync(SOURCES_TS, "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: "ESNext", target: "ES2022" },
  }).outputText;
  const dataUrl = "data:text/javascript;base64," + Buffer.from(js).toString("base64");
  const mod = await import(dataUrl);
  const sources = typeof mod.getKnowledgeSources === "function" ? mod.getKnowledgeSources() : [];
  return Array.isArray(sources) ? sources : [];
}

// ── GitHub identity (mirrors call-home) ──────────────────────────────────────
// Private repos need a token: env first, then the gh CLI's active account, then
// anonymous (works for public repos). Cached across calls.
let cachedToken;
function githubToken() {
  if (cachedToken !== undefined) return cachedToken;
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
    cachedToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    return cachedToken;
  }
  try {
    cachedToken = execFileSync("gh", ["auth", "token"], { timeout: 3000 }).toString().trim() || null;
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

// ── probe adapters ────────────────────────────────────────────────────────────
// Which host can we ask "when were you last modified?" — inferred from the URL,
// so no schema change is needed. `verifiable: false` means we can't probe it from
// a plain CLI (needs an authorized connector) — surfaced honestly, never guessed.
function inferHost(source) {
  if (source.kind === "figma") return "figma";
  let host = "";
  try {
    host = new URL(source.url ?? "").host.toLowerCase();
  } catch {
    return "unknown";
  }
  if (host === "github.com" || host.endsWith(".github.com")) return "github";
  if (host.includes("figma.com")) return "figma";
  if (host.includes("google.com")) return "drive"; // docs.google.com / drive.google.com
  if (host.includes("notion.so") || host.includes("notion.site")) return "notion";
  return "unknown";
}

async function ghApi(pathAndQuery) {
  const token = githubToken();
  const res = await fetch(`https://api.github.com${pathAndQuery}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) {
    const hint =
      res.status === 404 && !token
        ? " (private repo? sign in with `gh auth login` or set GITHUB_TOKEN)"
        : "";
    throw new Error(`GitHub API ${res.status}${hint}`);
  }
  return res.json();
}

/**
 * Last-modified for a GitHub-hosted source. A blob URL
 * (github.com/owner/repo/blob/<ref>/path) → the date of the last commit touching
 * that path; a bare repo URL → the repo's pushed_at.
 * Returns { verifiable, modifiedAt?, detail }.
 */
async function probeGitHub(url) {
  const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(?:blob|tree)\/([^/]+)\/(.+?))?\/?$/);
  if (!m) return { verifiable: false, detail: "unrecognized GitHub URL shape" };
  const [, owner, repoRaw, ref, filePath] = m;
  const repo = repoRaw.replace(/\.git$/, "");
  try {
    if (filePath) {
      const commits = await ghApi(
        `/repos/${owner}/${repo}/commits?path=${encodeURIComponent(filePath)}&per_page=1${
          ref ? `&sha=${encodeURIComponent(ref)}` : ""
        }`
      );
      const date = commits?.[0]?.commit?.committer?.date ?? commits?.[0]?.commit?.author?.date;
      if (!date) return { verifiable: false, detail: "no commits found for that path" };
      return { verifiable: true, modifiedAt: date, detail: `last commit to ${filePath}` };
    }
    const repoInfo = await ghApi(`/repos/${owner}/${repo}`);
    if (!repoInfo?.pushed_at) return { verifiable: false, detail: "repo has no pushed_at" };
    return { verifiable: true, modifiedAt: repoInfo.pushed_at, detail: "repo pushed_at" };
  } catch (e) {
    return { verifiable: false, unreachable: true, detail: e.message };
  }
}

/** Probe one source → a probe result. */
async function probe(source) {
  /**
   * A source that resolves to a file in the product repo is probed LOCALLY, and
   * that takes precedence over its remote host. It is faster, it needs no token,
   * it is correct offline, and it is the only probe that can say WHICH SECTIONS
   * moved rather than just "something did".
   */
  const rel = localPathFor(source, hostRepoRoot, originRepoSlug);
  if (rel) {
    const p = probeLocal(hostRepoRoot, rel);
    return {
      host: "local",
      ...p,
      localPath: rel,
      sections: p.unreachable ? null : changedSections(hostRepoRoot, rel, source.distilledAt),
    };
  }

  const host = inferHost(source);
  switch (host) {
    case "github":
      return { host, ...(await probeGitHub(source.url)) };
    case "figma":
      // Figma freshness is already tracked in-app by distill-status.ts off the
      // live Figma Manifest (data/figma-manifest). Don't re-implement Figma auth
      // here — delegate, and say so.
      return {
        host,
        verifiable: false,
        detail: "tracked in the Figma Manifest (distill-status) — see /synclair/knowledge",
      };
    case "drive":
      return { host, verifiable: false, detail: "needs the Google Drive connector to read modifiedTime" };
    case "notion":
      return { host, verifiable: false, detail: "needs the Notion connector to read last_edited_time" };
    default:
      return { host, verifiable: false, detail: "no probe adapter for this host" };
  }
}

// ── classify (keep in lockstep with lib/system/knowledge/freshness.ts) ────────
// A source is only checkable if it links OUT and has been distilled. States:
//   never        — linked but no digest yet (distill it first; not "stale")
//   unverifiable — can't probe from the CLI (connector-gated host, or delegated)
//   unreachable  — probe attempted but the host couldn't be reached
//   stale        — the upstream moved after the digest was written
//   fresh        — the digest is at or ahead of the upstream
function classify(source, p) {
  if (!source.distilledInto || !source.distilledAt) return "never";
  if (p.unreachable) return "unreachable";
  /**
   * A local source is judged on CONTENT, not on the clock. When we can compare
   * the file against its state at distill time, a document that was reformatted,
   * relicensed, or touched by an unrelated commit is `fresh` — because nothing a
   * digest could describe actually changed. Only the timestamp path (no git
   * history to compare against) falls back to the date rule below.
   */
  if (p.sections) {
    const moved =
      p.sections.changed.length + p.sections.added.length + p.sections.removed.length;
    return moved > 0 ? "stale" : "fresh";
  }
  if (!p.verifiable || !p.modifiedAt) return "unverifiable";
  return new Date(p.modifiedAt).getTime() > new Date(source.distilledAt).getTime()
    ? "stale"
    : "fresh";
}

// ── run ───────────────────────────────────────────────────────────────────────
const sources = await loadSources();

/**
 * In scope: anything we can actually ask a question of.
 *
 * Sources that link OUT, as before — plus any source that resolves to a FILE in
 * the product repo. The original filter excluded `access: "repo"` on the
 * reasoning that an in-repo entry has no upstream. True of a digest; false of a
 * raw spec committed in the repo, whose upstream is the file, and which is the
 * one source we can verify with no token, no network and no rate limit.
 *
 * A source with neither a local path nor a url/ref still can't be probed.
 */
const scoped = sources.filter(
  (s) => localPathFor(s, hostRepoRoot, originRepoSlug) || (s.access !== "repo" && (s.url || s.ref))
);

const results = [];
for (const s of scoped) {
  const p = await probe(s);
  const state = classify(s, p);
  results.push({
    id: s.id,
    title: s.title,
    kind: s.kind,
    area: s.area,
    host: p.host,
    state,
    url: s.url ?? null,
    distilledInto: s.distilledInto ?? null,
    distilledAt: s.distilledAt ?? null,
    sourceModifiedAt: p.modifiedAt ?? null,
    detail: p.detail ?? null,
    /**
     * Local-only fields, OMITTED rather than written as null.
     *
     * Writing `localPath: null, sections: null` on every remote source would add
     * two lines per entry to a committed cache in every clone — 70-odd lines of
     * diff carrying no information, on clones that have no local sources at all.
     * Absent means "not applicable", which is the same discipline as
     * `unanchored`: say nothing rather than say nothing loudly.
     */
    ...(p.localPath ? { localPath: p.localPath } : {}),
    ...(p.sections ? { sections: p.sections } : {}),
  });
}

/**
 * Documents in the repo that no manifest entry accounts for. Off by default:
 * it is a different question from freshness, and a check that silently grew a
 * second job would surprise anyone who scripted the first one.
 */
const undocumented = doDiscover
  ? discoverDocs(
      hostRepoRoot,
      sources.map((s) => localPathFor(s, hostRepoRoot, originRepoSlug)).filter(Boolean)
    )
  : [];

const report = { checkedAt: new Date().toISOString(), sources: results };
if (doDiscover) report.undocumented = undocumented;

mkdirSync(path.dirname(FRESHNESS_PATH), { recursive: true });
writeFileSync(FRESHNESS_PATH, JSON.stringify(report, null, 2) + "\n");

// ── --queue: enqueue stale sources for an agent to re-distill ─────────────────
const staleOnes = results.filter((r) => r.state === "stale");
if (doQueue && staleOnes.length) {
  let queue = { requests: [] };
  try {
    const parsed = JSON.parse(readFileSync(REDISTILL_QUEUE_PATH, "utf8"));
    if (Array.isArray(parsed?.requests)) queue = parsed;
  } catch {
    /* missing / unreadable → fresh queue */
  }
  const have = new Set(queue.requests.map((r) => r.sourceId));
  const now = new Date().toISOString();
  for (const r of staleOnes) {
    if (have.has(r.id)) continue;
    queue.requests.push({
      sourceId: r.id,
      title: r.title,
      /**
       * A local source enqueues the SECTIONS that moved, so whoever drains the
       * queue re-reads two headings instead of the whole document. That is the
       * entire difference between an addendum and an intake.
       */
      reason: r.sections
        ? `sections moved since ${r.distilledAt}: ${[
            ...r.sections.changed.map((h) => `changed “${h}”`),
            ...r.sections.added.map((h) => `added “${h}”`),
            ...r.sections.removed.map((h) => `removed “${h}”`),
          ].join("; ")} (${r.sections.unchanged} untouched, vs ${r.sections.since ?? "?"})`
        : `upstream modified ${r.sourceModifiedAt} > distilled ${r.distilledAt}`,
      requestedAt: now,
    });
  }
  writeFileSync(REDISTILL_QUEUE_PATH, JSON.stringify(queue, null, 2) + "\n");
}

// ── output ────────────────────────────────────────────────────────────────────
if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  if (!scoped.length) {
    console.log(
      sources.length
        ? "check:knowledge — no linked, distilled sources to check (manifest sources are all in-repo digests)."
        : "check:knowledge — the knowledge manifest is empty (lib/system/knowledge/sources.ts). Nothing to check."
    );
  } else {
    const glyph = {
      stale: "✗",
      fresh: "✓",
      never: "·",
      unverifiable: "?",
      unreachable: "!",
    };
    const byState = (st) => results.filter((r) => r.state === st);
    for (const r of results) {
      const when = r.sourceModifiedAt ? ` — upstream ${r.sourceModifiedAt.slice(0, 10)}` : "";
      const dist = r.distilledAt ? `, distilled ${r.distilledAt.slice(0, 10)}` : "";
      console.log(
        `  ${glyph[r.state] ?? "·"} ${r.state.padEnd(12)} ${r.title} [${r.host}]${when}${dist}`
      );
      if (r.state === "unverifiable" || r.state === "unreachable")
        console.log(`      ${r.detail}`);
      /**
       * The point of a local source: say WHICH sections moved. "The billing PRD
       * changed" is a re-read; "§Pricing and §Refunds changed, 51 sections did
       * not" is an addendum. Capped so a wholesale rewrite doesn't print a wall.
       */
      if (r.state === "stale" && r.sections) {
        const { changed, added, removed, unchanged } = r.sections;
        const show = (label, arr) =>
          arr.length ? `${label} ${arr.slice(0, 6).map((h) => `“${h}”`).join(", ")}${arr.length > 6 ? ` +${arr.length - 6} more` : ""}` : null;
        const bits = [show("changed", changed), show("added", added), show("removed", removed)].filter(Boolean);
        console.log(`      ${bits.join(" · ")}  (${unchanged} section(s) untouched)`);
        if (r.localPath) console.log(`      ${r.localPath}`);
      }
    }
    const stale = byState("stale").length;
    const parts = ["fresh", "stale", "never", "unverifiable", "unreachable"]
      .map((st) => `${byState(st).length} ${st}`)
      .join(" · ");
    console.log(`\n${parts}`);

    if (doDiscover) {
      if (undocumented.length === 0) {
        console.log(`\nDiscovery: every document found in the repo is already in the manifest.`);
      } else {
        console.log(
          `\nDiscovery — ${undocumented.length} document(s) in the repo that the manifest doesn't mention:`
        );
        for (const d of undocumented) {
          console.log(
            `  + ${d.path}  [${d.kind}, ${d.sections} section(s)${d.modifiedAt ? `, updated ${d.modifiedAt.slice(0, 10)}` : ""}]`
          );
          console.log(`      title: ${d.title}`);
        }
        console.log(
          `\n  Add the ones that are sources of record to lib/system/knowledge/sources.ts`
          + `\n  with \`path\` set as above; leave \`area\` to whoever knows the product.`
        );
      }
    }
    if (stale) {
      console.log(
        doQueue
          ? `\n${stale} stale source(s) enqueued → data/knowledge/redistill-queue.json (drain via product-spec / figma-distiller).`
          : `\n${stale} stale source(s). Re-distill them (product-spec / figma-distiller), or run with --queue to enqueue.`
      );
    }
  }
}

if (strict && staleOnes.length) process.exit(1);
