#!/usr/bin/env node
/**
 * The sync gate, run locally — `npm run gate`.
 *
 * Wraps ci-pr-catalog-check.mjs (the SAME scan CI runs, so local and CI never
 * disagree) with the changed-file list CI gets for free from the PR diff.
 *
 * One deliberate difference from CI: this includes UNCOMMITTED and UNTRACKED
 * work. CI only ever sees pushed commits, but the whole point of running this
 * locally is to catch a gap before you commit it — a scan that ignores your
 * working tree would answer "all clear" to a question you haven't asked yet.
 *
 * Base defaults to origin/staging; override with SYNCLAIR_GATE_BASE.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const base = process.env.SYNCLAIR_GATE_BASE || "origin/staging";

const git = (...args) =>
  execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8" }).trim();

let mergeBase;
try {
  mergeBase = git("merge-base", base, "HEAD");
} catch {
  console.error(
    `\n✗ Can't resolve base "${base}".\n` +
      `  Fetch it first:  git fetch parent design\n` +
      `  Or point elsewhere:  SYNCLAIR_GATE_BASE=<ref> npm run gate\n`,
  );
  process.exit(2);
}

// Committed + uncommitted (merge-base vs working tree), plus untracked files —
// a brand-new component is exactly the case worth catching, and it is untracked
// until the moment it is added.
const changed = git("diff", "--name-only", mergeBase);
const untracked = git("ls-files", "--others", "--exclude-standard");
const files = [...new Set([...changed.split("\n"), ...untracked.split("\n")])]
  .filter(Boolean)
  .sort();

if (files.length === 0) {
  console.log(`No changes vs ${base} — nothing to scan.`);
  process.exit(0);
}

const listPath = join(tmpdir(), "synclair-changed.txt");
writeFileSync(listPath, files.join("\n") + "\n");

console.log(`Scanning ${files.length} changed file(s) vs ${base}:\n`);
execFileSync("node", [join(import.meta.dirname, "ci-pr-catalog-check.mjs"), listPath], {
  stdio: "inherit",
});
