#!/usr/bin/env node
/**
 * SELF-TEST for the edge graph (scripts/lib/edges.mjs).
 *
 * Everything risky here is path normalisation. Three artifacts record paths
 * against three different bases, and getting one wrong does not produce a wrong
 * graph — it produces an EMPTY one, which reports "nothing is affected" and
 * looks exactly like a clean change. That already happened once: `usage.files`
 * are product-repo-relative, were resolved against the hub instead, and every
 * component came back used nowhere.
 *
 * Hermetic: writes fixture artifacts into a temp dir laid out as an EMBEDDED
 * clone (hub at <root>/synclair), because that topology is where hub-relative
 * and product-relative paths actually differ. A watcher-mode test would pass
 * with the bug present.
 *
 *   node scripts/check-edges.mjs [--verbose]
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { buildGraph, impactOf } from "./lib/edges.mjs"

const verbose = process.argv.includes("--verbose")
let pass = 0
const failures = []
const ok = (name, cond, detail = "") => {
  if (cond) {
    pass++
    if (verbose) console.log(`  ✓ ${name}`)
  } else failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
}

const root = mkdtempSync(path.join(os.tmpdir(), "synclair-edges-"))
const hub = path.join(root, "synclair")
const write = (rel, obj) => {
  const p = path.join(hub, rel)
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(obj, null, 2))
}

try {
  // Embedded topology: the hub is a subdirectory of the product repo.
  write("data/setup.json", { mode: "embedded" })

  write("registry.json", {
    items: [{ name: "hub-card", type: "registry:component", files: [{ path: "components/hub-card.tsx" }] }],
  })

  write("data/external-catalog.json", {
    hosts: [
      { name: "web", root: "../apps/web", surface: "web" },
      { name: "ui", root: "../packages/ui", surface: "shared" },
    ],
    items: [
      {
        name: "Button", surface: "shared", hostPath: "src/button.tsx",
        usage: { files: ["apps/web/src/pages/home.tsx"] },
      },
      { name: "Card", surface: "web", hostPath: "src/card.tsx" },
      // No host declares surface "mobile": the base is unknown, so no edge may
      // be invented for it.
      { name: "Orphan", surface: "mobile", hostPath: "src/orphan.tsx" },
    ],
  })

  write("data/pages-map.json", {
    repo: { root: "../apps/web" },
    pages: [
      {
        route: "/home", surface: "web",
        file: "src/pages/home.tsx",
        sourceFiles: ["src/pages/home.tsx"],
        items: [{ name: "Card", surface: "web" }],
      },
    ],
  })

  write("data/ux-docs/anchors.json", { anchors: [{ name: "web:Card" }] })
  write(".synclair/cache/knowledge/freshness.json", {
    sources: [{ id: "billing-prd", localPath: ".prds/Billing_PRD.md" }],
  })

  const g = buildGraph(hub)
  ok("hostRoot is the product repo, not the hub", g.hostRoot === root, g.hostRoot)

  const files = [...g.fileToItems.keys()]
  ok("a host component resolves against ITS OWN host root",
    files.includes("packages/ui/src/button.tsx"), JSON.stringify(files))
  ok("a second host resolves against its own root too",
    files.includes("apps/web/src/card.tsx"), JSON.stringify(files))
  ok("usage.files are NOT re-resolved against the hub",
    files.includes("apps/web/src/pages/home.tsx") && !files.some((f) => f.startsWith("synclair/apps")),
    JSON.stringify(files.filter((f) => f.includes("home"))))
  ok("the hub's own registry stays hub-relative",
    files.includes("synclair/components/hub-card.tsx"), JSON.stringify(files))
  ok("an item whose surface has no host gets no invented edge",
    !files.some((f) => f.includes("orphan")), JSON.stringify(files))

  ok("page source files resolve against the pages-map root",
    [...g.fileToPages.keys()].includes("apps/web/src/pages/home.tsx"))

  // ── impact ─────────────────────────────────────────────────────────────────
  let r = impactOf(g, ["apps/web/src/card.tsx"])
  ok("changing a component reaches the screens composing it", r.pages.includes("/home"), JSON.stringify(r))
  ok("and flags its UX doc as suspect", r.docs.length === 1, JSON.stringify(r.docs))

  r = impactOf(g, ["packages/ui/src/button.tsx"])
  ok("a shared component with no mapped surface reports reach UNKNOWN",
    r.reachUnknown.length === 1 && r.pages.length === 0, JSON.stringify(r))

  r = impactOf(g, [".prds/Billing_PRD.md"])
  ok("editing a registered spec reaches its knowledge source",
    r.knowledge.includes("billing-prd"), JSON.stringify(r))

  r = impactOf(g, ["services/api/src/server.ts"])
  ok("an untracked file is reported as unmatched, not silently dropped",
    r.unmatched.length === 1 && r.items.length === 0, JSON.stringify(r))

  r = impactOf(g, ["apps/web/src/pages/home.tsx"])
  ok("a page's own source reaches that page", r.pages.includes("/home"), JSON.stringify(r))

  // ── blank clone ────────────────────────────────────────────────────────────
  const blank = mkdtempSync(path.join(os.tmpdir(), "synclair-blank-"))
  const bg = buildGraph(blank)
  ok("a clone with no artifacts builds an empty graph without throwing",
    bg.counts.items === 0 && bg.counts.pages === 0)
  ok("and reports every file as unmatched rather than as clean",
    impactOf(bg, ["a.tsx"]).unmatched.length === 1)
  rmSync(blank, { recursive: true, force: true })
} finally {
  rmSync(root, { recursive: true, force: true })
}

if (failures.length) {
  console.log(`check:edges — ${failures.length} failure(s):`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`check:edges: ${pass} checks passed (path normalisation, one-hop impact, unknown reach).`)
