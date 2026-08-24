#!/usr/bin/env node
/**
 * SELF-TEST for check-pages.mjs's skip logic.
 *
 * The check soft-skips when the host repo isn't checked out (normal in CI) —
 * but the skip condition once held VACUOUSLY for every single-`repo` map
 * (`missing.length === repoList.length` was 0 === 0 with an empty `repos`
 * list), so the check examined nothing on exactly the maps an intake writes.
 * Found by the C5 intake drill: a freshly mapped host, sitting on disk, and
 * "target repo not found". A check that examines nothing passes fastest of
 * all — this pins the three states apart.
 *
 * Hermetic: fixture hub + host in a temp dir; runs the real script.
 *
 *   node scripts/check-pages-selftest.mjs
 */

import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const parent = mkdtempSync(path.join(os.tmpdir(), "check-pages-selftest."))
let failures = []

// The real script runs IN PLACE (it imports the artifact modules relative to
// its own location, which a bare fixture hub can't satisfy); only the hub —
// the cwd, where the map lives — is the fixture.
const run = (hub) => {
  try {
    return execFileSync(process.execPath, [path.join(here, "check-pages.mjs")], {
      cwd: hub,
      stdio: ["ignore", "pipe", "pipe"],
    }).toString()
  } catch (err) {
    return `${err.stdout ?? ""}${err.stderr ?? ""}EXIT:${err.status}`
  }
}

const makeHub = (name, map, withHost) => {
  const hub = path.join(parent, name)
  mkdirSync(path.join(hub, "data"), { recursive: true })
  writeFileSync(path.join(hub, "data/pages-map.json"), JSON.stringify(map))
  if (withHost) {
    mkdirSync(path.join(parent, name + "-host", "app"), { recursive: true })
    writeFileSync(path.join(parent, name + "-host", "app", "page.tsx"), "export default () => null\n")
  }
  return hub
}

const page = {
  id: "home",
  route: "/",
  title: "Home",
  file: "app/page.tsx",
  sourceFiles: ["app/page.tsx"],
  items: [],
}

// 1. Single-`repo` map with the host PRESENT: must NOT skip (the regression).
{
  const hub = makeHub("present", { repo: { name: "h", root: "../present-host" }, pages: [page] }, true)
  const out = run(hub)
  if (/target repo not found/.test(out)) {
    failures.push(`host present but check skipped:\n${out}`)
  }
}

// 2. Single-`repo` map with the host ABSENT: must skip gracefully, exit 0.
{
  const hub = makeHub("absent", { repo: { name: "h", root: "../no-such-host" }, pages: [page] }, false)
  const out = run(hub)
  if (!/target repo not found/.test(out) || /EXIT:/.test(out)) {
    failures.push(`host absent should soft-skip with exit 0:\n${out}`)
  }
}

rmSync(parent, { recursive: true, force: true })

if (failures.length) {
  console.error("check-pages-selftest FAILED:")
  for (const f of failures) console.error("  " + f.split("\n").join("\n  "))
  process.exit(1)
}
console.log("check-pages-selftest: skip logic honest — runs when the host exists, soft-skips when it doesn't.")
