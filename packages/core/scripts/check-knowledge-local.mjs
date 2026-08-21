#!/usr/bin/env node
/**
 * SELF-TEST for the local-knowledge-source mechanism (scripts/lib/local-source.mjs).
 *
 * The behaviour here is easy to get subtly wrong in ways no other check would
 * catch, because its failure mode is a *quiet wrong answer*: reporting `fresh`
 * for a digest that is already lying. Every case below was a real defect found
 * while building it, against a real 60-section PRD set:
 *
 *   - an SSH host alias (`git@github-work:...`) made local detection silently
 *     no-op on exactly the multi-account machines most likely to need it;
 *   - two commits in the same second made an edit vanish, because the inclusive
 *     `--before` bound picked the newer one;
 *   - YAML frontmatter using `#` group labels turned seven PRDs into "Document
 *     Identity" and inflated every section count.
 *
 * Hermetic: builds its own throwaway git repo in the OS temp dir, with explicit
 * commit timestamps so it can't flake on a fast machine. No network, no fixture
 * repo, nothing outside tmp is touched. Safe in CI and in any clone.
 *
 *   node scripts/check-knowledge-local.mjs
 *   node scripts/check-knowledge-local.mjs --verbose
 */

import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  changedSections,
  discoverDocs,
  frontmatterTitle,
  localPathFor,
  originSlugs,
  probeLocal,
  sections,
  splitFrontmatter,
} from "./lib/local-source.mjs"

const verbose = process.argv.includes("--verbose")
let pass = 0
const failures = []
const ok = (name, cond, detail = "") => {
  if (cond) {
    pass++
    if (verbose) console.log(`  ✓ ${name}`)
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
  }
}

const tmp = mkdtempSync(path.join(os.tmpdir(), "synclair-local-"))
const git = (args, env) =>
  execFileSync("git", args, {
    cwd: tmp,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    env: { ...process.env, ...env },
  }).trim()

/** Commits spaced an hour apart: git timestamps are second-granular and the
 *  staleness bound is deliberately strict, so back-to-back commits would make
 *  the test's own baseline ambiguous. */
const T0 = Date.UTC(2026, 0, 1, 12, 0, 0)
const at = (h) => new Date(T0 + h * 3600_000).toISOString()
function commit(msg, hours) {
  git(["add", "-A"])
  git(
    ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", msg, "--date", at(hours)],
    { GIT_COMMITTER_DATE: at(hours) }
  )
}
const between = (h) => at(h + 0.5)

try {
  git(["init", "-q", "."])
  git(["remote", "add", "origin", "git@github-work:acme/product.git"])
  mkdirSync(path.join(tmp, ".prds"), { recursive: true })

  const REL = ".prds/Billing_PRD.md"
  const doc = (extra = "", tail = "") =>
    `---\ntitle: 'Product Requirements Document: Billing'\n# Ownership\nauthor: 'A'\n---\n\n`
    + `# Overview\n\nBilling covers invoicing and collections for every account type.${extra}\n\n`
    + `# Pricing\n\nSeats are billed monthly in arrears.\n\n`
    + `# Refunds\n\nRefunds are issued to the original payment method within ten days.\n${tail}`

  writeFileSync(path.join(tmp, REL), doc())
  writeFileSync(path.join(tmp, ".prds/README.md"), "# Readme\n\nnot a spec\n")
  commit("seed", 0)

  // ── slug detection ──────────────────────────────────────────────────────────
  const slugs = originSlugs(tmp)
  ok("detects owner/repo through an SSH host alias", slugs.includes("acme/product"), JSON.stringify(slugs))

  ok("explicit path wins", localPathFor({ path: REL }, tmp, slugs) === REL)
  ok(
    "a blob URL naming this repo resolves locally",
    localPathFor({ url: `https://github.com/acme/product/blob/main/${REL}` }, tmp, slugs) === REL
  )
  ok(
    "another repo's blob URL does not",
    localPathFor({ url: "https://github.com/acme/other/blob/main/x.md" }, tmp, slugs) === null
  )
  ok(
    "a tree URL is a directory, not a document",
    localPathFor({ url: "https://github.com/acme/product/tree/main/.prds" }, tmp, slugs) === null
  )

  // ── frontmatter ─────────────────────────────────────────────────────────────
  const raw = doc()
  ok("title comes from frontmatter, not the first `#` label",
    frontmatterTitle(raw) === "Product Requirements Document: Billing", String(frontmatterTitle(raw)))
  const secs = sections(raw)
  ok("frontmatter is one section, not one per label",
    secs.filter((s) => s.heading === "(frontmatter)").length === 1, secs.map((s) => s.heading).join(","))
  ok("frontmatter labels are not promoted to headings", !secs.some((s) => s.heading === "Ownership"))
  ok("real headings are found", ["Overview", "Pricing", "Refunds"].every((h) => secs.some((s) => s.heading === h)))
  ok("delimiters tolerate trailing whitespace",
    splitFrontmatter(raw.replace(/^---$/gm, "---  ")).frontmatter !== null)
  ok("unterminated frontmatter is not frontmatter",
    splitFrontmatter("---\ntitle: x\n\n# A\n").frontmatter === null)
  ok("headings inside fenced code are ignored",
    sections("# A\n\n```\n# nope\n```\n\n## B\n\nx\n").map((s) => s.heading).join(",") === "A,B")

  // ── probe ───────────────────────────────────────────────────────────────────
  const p = probeLocal(tmp, REL)
  ok("probes a tracked file", p.verifiable && !p.unreachable && !!p.modifiedAt && !!p.contentHash)
  ok("a missing file is unreachable, not fresh", probeLocal(tmp, ".prds/Nope.md").unreachable === true)
  ok("a non-git path degrades without throwing", probeLocal(os.tmpdir(), "nope.md").unreachable === true)

  // ── section drift ───────────────────────────────────────────────────────────
  ok("no distilledAt → null", changedSections(tmp, REL, null) === null)
  ok("never guesses before the file existed", changedSections(tmp, REL, "2001-01-01T00:00:00Z") === null)

  const base = between(0)
  writeFileSync(path.join(tmp, REL), doc(" Enterprise plans are invoiced net-30."))
  commit("edit one section", 1)
  let d = changedSections(tmp, REL, base)
  ok("exactly the edited section is reported",
    d && d.changed.length === 1 && d.changed[0] === "Overview", JSON.stringify(d))
  ok("nothing is invented as added or removed", d.added.length === 0 && d.removed.length === 0)
  ok("the untouched sections are counted", d.unchanged >= 3, String(d?.unchanged))

  const base2 = between(1)
  const padded = doc(" Enterprise plans are invoiced net-30.")
    .split("\n").map((l) => l + "  ").join("\n").replace(/\n\n/g, "\n\n\n")
  writeFileSync(path.join(tmp, REL), padded)
  commit("whitespace only", 2)
  d = changedSections(tmp, REL, base2)
  ok("a whitespace-only reflow is NOT stale",
    d && d.changed.length === 0 && d.added.length === 0 && d.removed.length === 0, JSON.stringify(d))

  const base3 = between(2)
  writeFileSync(path.join(tmp, REL), padded + "\n\n# Disputes\n\nRaised within 30 days.\n")
  commit("add a section", 3)
  d = changedSections(tmp, REL, base3)
  ok("a new heading is an addition", d?.added.includes("Disputes"), JSON.stringify(d))
  ok("adding a section changes nothing else", d.changed.length === 0 && d.removed.length === 0, JSON.stringify(d))

  // Same-second commits: the bound must resolve ambiguity toward `stale`, never
  // toward `fresh`. This is the defect that made an edit disappear entirely.
  const base4 = at(4)
  writeFileSync(path.join(tmp, REL), padded + "\n\n# Disputes\n\nRaised within 45 days.\n")
  commit("same-second A", 4)
  d = changedSections(tmp, REL, base4)
  ok("a commit in the same second as the digest resolves to stale, not fresh",
    d === null || d.changed.length + d.added.length + d.removed.length > 0, JSON.stringify(d))

  // ── discovery ───────────────────────────────────────────────────────────────
  const found = discoverDocs(tmp, [])
  ok("finds an unregistered spec", found.some((f) => f.path === REL), JSON.stringify(found.map((f) => f.path)))
  ok("uses the frontmatter title",
    found.find((f) => f.path === REL)?.title === "Product Requirements Document: Billing")
  ok("classifies a PRD by its path", found.find((f) => f.path === REL)?.kind === "prd")
  ok("skips project furniture like README", !found.some((f) => /README/i.test(f.path)))
  ok("a registered path is not reported as undiscovered",
    !discoverDocs(tmp, [REL]).some((f) => f.path === REL))
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

if (failures.length) {
  console.log(`check:knowledge-local — ${failures.length} failure(s):`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`check:knowledge-local: ${pass} checks passed (local source probing, section drift, discovery).`)
