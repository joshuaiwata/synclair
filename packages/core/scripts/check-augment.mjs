#!/usr/bin/env node
/**
 * SELF-TEST for the edit-time push hook (scripts/agent-augment.mjs).
 *
 * This fires on EVERY edit an agent makes, so its failure modes are inverted
 * from a normal script's: printing when it shouldn't is worse than crashing
 * (noise gets the whole mechanism uninstalled), and crashing is worse than
 * silence (a hook that breaks edits gets uninstalled faster).
 *
 * Hermetic: builds an embedded-shaped repo in tmp, invokes the hook as the
 * agent harness would — payload on stdin — and asserts on bytes out.
 *
 *   node scripts/check-augment.mjs [--verbose]
 */

import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, cpSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SELF = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const verbose = process.argv.includes("--verbose")
let pass = 0
const failures = []
const ok = (n, c, d = "") => {
  if (c) {
    pass++
    if (verbose) console.log(`  ✓ ${n}`)
  } else failures.push(`${n}${d ? ` — ${d}` : ""}`)
}

const root = mkdtempSync(path.join(os.tmpdir(), "synclair-augment-"))
const hub = path.join(root, "synclair")
const write = (rel, body) => {
  const p = path.join(root, rel)
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, typeof body === "string" ? body : JSON.stringify(body, null, 2))
}

function run(payload) {
  try {
    return execFileSync(process.execPath, [path.join(hub, "scripts", "agent-augment.mjs")], {
      input: typeof payload === "string" ? payload : JSON.stringify(payload),
      encoding: "utf8",
      timeout: 10_000,
      // The bare fixture copy has no package layout to detect, so the script
      // falls back to its caller's cwd — which must be the fixture's HUB.
      cwd: hub, // the fixture var hub IS the fixture synclair dir
    })
  } catch (e) {
    return `EXIT:${e.status} ${e.stdout ?? ""}${e.stderr ?? ""}`
  }
}

try {
  // An embedded clone: hub inside the product repo.
  mkdirSync(path.join(hub, "scripts", "lib"), { recursive: true })
  cpSync(path.join(SELF, "scripts", "agent-augment.mjs"), path.join(hub, "scripts", "agent-augment.mjs"))
  // The bare copy still needs the shared hub-root helper it imports; with no
  // package layout around it, that helper falls back to cwd — which the spawn
  // sets to the fixture hub.
  cpSync(path.join(SELF, "scripts", "lib", "hub-root.mjs"), path.join(hub, "scripts", "lib", "hub-root.mjs"))
  write("synclair/data/setup.json", { mode: "embedded" })
  write("apps/web/src/theme.ts", "export const x = 1\n")
  write("apps/web/src/other.ts", "export const y = 2\n")
  write(".prds/Billing_PRD.md", "# Billing\n\nbody\n")

  write("synclair/.synclair/cache/rulings.json", {
    rulings: [
      { statement: "controls never share the container background", governs: ["apps/web/src/theme.ts"], state: "current" },
      { statement: "a retired rule", governs: ["apps/web/src/gone.ts"], state: "gone" },
    ],
  })
  /**
   * A BARREL repo, which is the shape that broke this in the field.
   *
   * The closure walker stops at a re-export, so every page below records only
   * `src/components/ui/index.ts` in `sourceFiles` — never the component file
   * itself. Path matching alone therefore scores zero on exactly the files the
   * reach signal exists for. The earlier fixture only ever listed a component
   * directly, so all fifteen checks passed while the signal was dead.
   */
  write("apps/web/src/components/ui/table.tsx", "export const Table = 1\n")
  write("apps/web/src/components/ui/primitives.tsx", "export const Button = 1\nexport const Card = 2\n")
  write("packages/ui/src/button.tsx", "export const Button = 3\n")

  const barrel = ["src/components/ui/index.ts"]
  const uses = (...names) => names.map((name) => ({ name, surface: "web" }))
  write("synclair/data/pages-map.json", {
    repo: { root: "../apps/web" },
    pages: [
      ...Array.from({ length: 6 }, (_, i) => ({ route: `/p${i}`, sourceFiles: ["src/theme.ts"] })),
      // 13 screens compose Table — none of them name its file.
      ...Array.from({ length: 13 }, (_, i) => ({ route: `/t${i}`, sourceFiles: barrel, items: uses("Table") })),
      /**
       * One file exporting two catalogued items, across overlapping pages:
       * Button on 7, Card on 6, but only 10 DISTINCT screens. A signal that
       * summed per-item counts would claim 13 — the file's reach is the union.
       */
      ...Array.from({ length: 10 }, (_, i) => ({
        route: `/u${i}`,
        sourceFiles: barrel,
        items: uses(...(i < 7 ? ["Button"] : []), ...(i >= 4 ? ["Card"] : [])),
      })),
    ],
  })
  write("synclair/data/external-catalog.json", {
    hosts: [
      { surface: "web", root: "../apps/web" },
      { surface: "shared", root: "../packages/ui" },
    ],
    items: [
      { name: "Table", surface: "web", hostPath: "src/components/ui/table.tsx" },
      { name: "Button", surface: "web", hostPath: "src/components/ui/primitives.tsx" },
      { name: "Card", surface: "web", hostPath: "src/components/ui/primitives.tsx" },
      // The same NAME in a second surface — the trap a bare name join falls into.
      { name: "Button", surface: "shared", hostPath: "src/button.tsx" },
    ],
  })
  write("synclair/.synclair/cache/knowledge/freshness.json", {
    sources: [{ id: "billing", localPath: ".prds/Billing_PRD.md", state: "stale", sections: { changed: ["Pricing", "Refunds"] } }],
  })

  const edit = (rel) => ({ tool_name: "Edit", tool_input: { file_path: path.join(root, rel) } })

  // ── fires when it should ───────────────────────────────────────────────────
  let out = run(edit("apps/web/src/theme.ts"))
  ok("a governed file gets its ruling", /ruling governs this file/.test(out), out)
  ok("and the ruling is quoted, not pointed at", /container background/.test(out), out)
  ok("wide reach is reported alongside", /6 screens/.test(out), out)
  ok("never more than two lines", out.trim().split("\n").length <= 2, out)

  out = run(edit(".prds/Billing_PRD.md"))
  ok("editing a registered spec warns about the digest", /registered spec/.test(out), out)
  ok("and counts the drifted sections", /2 section/.test(out), out)

  // ── reach survives a barrel ────────────────────────────────────────────────
  out = run(edit("apps/web/src/components/ui/table.tsx"))
  ok("reach is found through a re-export, not just a direct path", /13 screens/.test(out), out)

  out = run(edit("apps/web/src/components/ui/primitives.tsx"))
  ok("a multi-export file counts every item it exports", /screens/.test(out), out)
  ok("and counts screens ONCE, not once per item", /10 screens/.test(out), out)

  // ── silent when it must be ─────────────────────────────────────────────────
  ok("an ungoverned file is silent", run(edit("apps/web/src/other.ts")) === "")
  ok("a Read is silent — not a decision point",
    run({ tool_name: "Read", tool_input: { file_path: path.join(root, "apps/web/src/theme.ts") } }) === "")
  ok("a Grep is silent", run({ tool_name: "Grep", tool_input: { pattern: "x" } }) === "")
  ok("a gone ruling never fires", !/retired rule/.test(run(edit("apps/web/src/gone.ts"))))
  ok("a same-named component in another surface never inherits its reach",
    run(edit("packages/ui/src/button.tsx")) === "")
  ok("a file outside the product repo is silent",
    run({ tool_name: "Edit", tool_input: { file_path: "/etc/hosts" } }) === "")

  // ── never breaks an edit ───────────────────────────────────────────────────
  ok("garbage stdin exits 0, silent", run("{ not json").trim() === "")
  ok("empty stdin exits 0, silent", run("").trim() === "")
  ok("missing file_path exits 0, silent", run({ tool_name: "Edit", tool_input: {} }) === "")
  write("synclair/.synclair/cache/rulings.json", "{ corrupt")
  ok("a corrupt register is silent, not a crash", !/EXIT/.test(run(edit("apps/web/src/theme.ts"))))
} finally {
  rmSync(root, { recursive: true, force: true })
}

if (failures.length) {
  console.log(`check:augment — ${failures.length} failure(s):`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`check:augment: ${pass} checks passed (edit-time push — fires, quotes, and shuts up).`)
