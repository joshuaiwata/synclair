#!/usr/bin/env node
/**
 * call-home — the CLI face of the opt-in foundation freshness check
 * (lib/system/mother.ts; the hub surface is /synclair/environment › Synclair).
 *
 * Usage:
 *   npm run call-home                       status: is the foundation behind the mother repo?
 *   npm run call-home -- --enable           opt this clone in
 *   npm run call-home -- --disable          opt out (the default state)
 *   npm run call-home -- --anchor <sha>     record the foundation baseline by hand
 *   npm run call-home -- --anchor latest    anchor to the mother's current main
 *
 * The baseline is normally stamped by `scripts/synclair-sync.sh pull`; --anchor
 * exists for clones that synced another way (subtree pulls, hand-carried diffs).
 * Nothing is sent home but the baseline sha in the compare URL, and only when
 * callHome is on (or when this command is invoked explicitly).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const MOTHER_REPO = "joshuaiwata/synclair";
const MOTHER_PATH = path.join(process.cwd(), "data", "mother.json");

// The mother repo is private (for now): env token first, then the gh CLI's
// active account, then anonymous (works once the repo is public).
function githubToken() {
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN)
    return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  try {
    return execFileSync("gh", ["auth", "token"], { timeout: 3000 }).toString().trim() || null;
  } catch {
    return null;
  }
}

const args = process.argv.slice(2);

function readRecord() {
  try {
    const raw = JSON.parse(readFileSync(MOTHER_PATH, "utf8"));
    return {
      callHome: raw.callHome === true,
      commit: typeof raw.commit === "string" ? raw.commit : "",
      syncedAt: typeof raw.syncedAt === "string" ? raw.syncedAt : "",
    };
  } catch {
    return { callHome: false, commit: "", syncedAt: "" };
  }
}

function writeRecord(record) {
  writeFileSync(MOTHER_PATH, JSON.stringify(record, null, 2) + "\n");
}

async function gh(url) {
  const token = githubToken();
  const res = await fetch(`https://api.github.com/repos/${MOTHER_REPO}${url}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) {
    throw new Error(
      `GitHub API ${res.status} for ${url}${
        res.status === 404 && !token
          ? " — the mother repo is private; sign in with `gh auth login` or set GITHUB_TOKEN"
          : ""
      }`
    );
  }
  return res.json();
}

const record = readRecord();

if (args.includes("--enable") || args.includes("--disable")) {
  record.callHome = args.includes("--enable");
  writeRecord(record);
  console.log(
    record.callHome
      ? "call-home: ON — the hub's Environment page (and this command) will check the mother repo."
      : "call-home: OFF — Synclair never phones anywhere (the default)."
  );
  if (record.callHome && !record.commit) {
    console.log(
      "No baseline recorded yet — anchor one: npm run call-home -- --anchor <mother sha>  (or `latest`)"
    );
  }
  process.exit(0);
}

const anchorIdx = args.indexOf("--anchor");
if (anchorIdx !== -1) {
  let sha = args[anchorIdx + 1];
  if (!sha) {
    console.error("--anchor needs a mother-repo sha, or `latest`.");
    process.exit(1);
  }
  if (sha === "latest") {
    sha = (await gh("/commits/main")).sha;
  }
  record.commit = sha;
  record.syncedAt = new Date().toISOString();
  writeRecord(record);
  console.log(`Baseline anchored: foundation @ ${sha.slice(0, 7)} (${record.syncedAt})`);
  process.exit(0);
}

// ── status (default) ─────────────────────────────────────────────────────────
if (!existsSync(MOTHER_PATH)) {
  console.log("No data/mother.json — this looks like the mother repo itself; nothing to call.");
  process.exit(0);
}
if (!record.commit) {
  console.log(
    `call-home is ${record.callHome ? "ON" : "OFF (explicit check)"} but no baseline is recorded.`
  );
  console.log("Anchor one first: npm run call-home -- --anchor <mother sha>  (or `latest`)");
  process.exit(0);
}

try {
  const cmp = await gh(`/compare/${record.commit}...main`);
  const behind = cmp.ahead_by ?? 0;
  console.log(
    `foundation baseline: ${record.commit.slice(0, 7)}${record.syncedAt ? ` (synced ${record.syncedAt.slice(0, 10)})` : ""}`
  );
  if (behind === 0) {
    console.log("✓ up to date with the mother repo.");
  } else {
    console.log(`✗ ${behind} foundation update(s) available:`);
    for (const c of (cmp.commits ?? []).slice().reverse()) {
      console.log(`   ${c.sha.slice(0, 7)}  ${c.commit.message.split("\n")[0]}`);
    }
    console.log(`\nDiff: ${cmp.html_url}`);
    console.log("Pull deliberately with the synclair-sync skill (seed never syncs).");
  }
  if (!record.callHome) {
    console.log("\n(one-off check — the hub won't check on its own; opt in with --enable)");
  }
} catch (e) {
  console.error(`Could not reach the mother repo: ${e.message}`);
  process.exit(1);
}
