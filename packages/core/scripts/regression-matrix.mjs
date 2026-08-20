#!/usr/bin/env node
/**
 * REGRESSION MATRIX — does every fix still hold?
 *
 * A fix is a claim that a defect cannot come back. The only way to test that is
 * to put the defect back and watch something catch it. This re-injects each
 * defect closed in this repo's recent hardening work, one at a time, into the
 * REAL data files, runs the guard that should notice, and reverts.
 *
 * Two kinds of check, because the defects came in two kinds:
 *
 *   INJECT     the defect lives in data — write it, run the guard, expect a
 *              named failure, restore, and verify the file is byte-identical.
 *   BEHAVIOUR  the defect lived in code, so there is nothing to inject. Assert
 *              the corrected behaviour directly instead.
 *
 * Every file it touches is backed up first and compared byte-for-byte after. If
 * a restore ever fails it says so loudly rather than leaving a dirty tree.
 *
 *   node scripts/regression-matrix.mjs [out.json]
 */

import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HUB = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUT = process.argv[2] ?? "/tmp/regression-matrix.json"
const MAP = path.join(HUB, "data/system-map.json")
const CONTRACTS = path.join(HUB, ".synclair/cache/contracts.json")

const run = (script, args = []) => {
  try {
    return execFileSync(process.execPath, [path.join(HUB, "scripts", script), ...args], {
      cwd: HUB, encoding: "utf8", timeout: 120000, maxBuffer: 16e6,
    })
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`
  }
}

const rows = []
const backups = new Map()
const backup = (f) => backups.set(f, readFileSync(f, "utf8"))
const restore = () => {
  for (const [f, text] of backups) writeFileSync(f, text)
}
const intact = () => [...backups].every(([f, text]) => readFileSync(f, "utf8") === text)

const editJson = (file, fn) => {
  const j = JSON.parse(readFileSync(file, "utf8"))
  fn(j)
  writeFileSync(file, `${JSON.stringify(j, null, 2)}\n`)
}

/** Put a defect back, run the guard, expect its output to name the problem. */
const inject = (defect, guard, expect, mutate) => {
  mutate()
  const out = guard()
  const caught = expect.test(out)
  restore()
  rows.push({
    kind: "inject",
    defect,
    caught,
    evidence: caught
      ? (out.split("\n").find((l) => expect.test(l)) ?? "").trim().slice(0, 160)
      : "guard did not report it",
  })
}

/** No injection possible — assert the corrected behaviour instead. */
const behaviour = async (defect, fn) => {
  try {
    const evidence = await fn()
    rows.push({ kind: "behaviour", defect, caught: true, evidence: String(evidence).slice(0, 160) })
  } catch (e) {
    rows.push({ kind: "behaviour", defect, caught: false, evidence: e.message.slice(0, 160) })
  }
}

backup(MAP)
backup(CONTRACTS)

const audit = () => run("audit-mcp.mjs", ["/dev/null"])
const scan = () => run("scan-system.mjs")

// ───────────────────────────────────────────────────────── data-level defects

inject(
  "An endpoint sourced to a file that does not exist",
  audit,
  /every cited file exists/,
  () => editJson(MAP, (m) => m.api.push({
    method: "POST", path: "/ghost", summary: "injected",
    source: "apps/file-api/src/files/files.controller.ts", surface: "shared",
  }))
)

inject(
  "An RPC wire name no kernel constant declares",
  audit,
  /declared constant/,
  () => editJson(MAP, (m) => {
    const e = m.api.find((a) => a.method === "RPC")
    e.path = e.path.replace(/^[^ |]+/, "core.totally-invented")
  })
)

inject(
  "An HTTP entry whose source declares no such verb",
  audit,
  /declares that verb/,
  () => editJson(MAP, (m) => {
    const e = m.api.find((a) => a.method === "GET")
    e.source = "apps/file-api/src/files/files.service.ts"
  })
)

inject(
  "A live message-pattern handler dropped from the map",
  audit,
  /undocumented/,
  () => editJson(MAP, (m) => {
    m.api = m.api.filter((a) => !String(a.source).includes("files.transport.handler"))
  })
)

inject(
  "A freshness anchor claiming a hash the sources no longer produce",
  audit,
  /matches the files on disk/,
  () => editJson(MAP, (m) => {
    m.provenance.sourceHash = "0".repeat(64)
  })
)

inject(
  "A contract link on the degenerate root path",
  audit,
  /degenerate root path/,
  () => editJson(CONTRACTS, (j) => j.links.push({
    method: "GET", path: "/", consumer: "apps/prototype/src/shell/navItems.ts",
    consumerApp: "prototype", providers: ["apps/claim-api/src/app.controller.ts"],
    providerApp: "claim-api", scope: "cross-app", matchType: "exact",
  }))
)

inject(
  "A contract provider that does not declare the linked verb",
  audit,
  /declares that endpoint/,
  () => editJson(CONTRACTS, (j) => {
    j.links[0].providers = ["apps/file-api/src/files/files.service.ts"]
  })
)

inject(
  "A contract consumer file that is not in the repo",
  audit,
  /contains its URL|traceable to their consumer/,
  () => editJson(CONTRACTS, (j) => {
    j.links[0].consumer = "apps/prototype/src/does-not-exist.tsx"
  })
)

inject(
  "An endpoint present in code and absent from the map",
  scan,
  /exist in the code but not in the map/,
  () => editJson(MAP, (m) => {
    m.api = m.api.filter((a) => !String(a.source).includes("geo.transport.handler"))
  })
)

// ────────────────────────────────────────────────────── code-level behaviours

const mod = await import(path.join(HUB, "scripts", "mcp-tools.mjs"))
const call = async (name, args) => {
  const r = await mod.callTool(name, args)
  const text = typeof r === "string" ? r : r?.content?.[0]?.text
  return JSON.parse(text)
}
const assert = (c, m) => {
  if (!c) throw new Error(m)
}
const hits = (r) => Object.values(r.groups ?? {}).reduce((n, g) => n + (g.total ?? 0), 0)

await behaviour("Multi-word queries treated as one literal string", async () => {
  const dead = []
  for (const q of ["file upload", "roster contact", "presigned upload session", "custom field"]) {
    if (hits(await call("search_all", { query: q })) === 0) dead.push(q)
  }
  assert(dead.length === 0, `zero results for: ${dead.join(", ")}`)
  return "4 multi-word queries all return results"
})

await behaviour("Endpoint scan blind to @MessagePattern", async () => {
  const out = run("scan-system.mjs", ["--json"])
  const derived = JSON.parse(out).derived.api
  const rpc = derived.filter((e) => e.method === "RPC")
  assert(rpc.length > 0, "no RPC endpoints derived at all")
  assert(rpc.every((e) => !e.unresolved), `${rpc.filter((e) => e.unresolved).length} unresolved wire names`)
  return `${rpc.length} RPC endpoints derived, all wire names resolved`
})

await behaviour("Hosted responses disclosing the server filesystem", async () => {
  const prev = process.env.SYNCLAIR_CORPUS_REF
  process.env.SYNCLAIR_CORPUS_REF = "design@regression"
  try {
    const r = await call("get_overview", {})
    assert(!r._meta?.hubRoot, "hubRoot present in a hosted response")
    assert(r._meta?.corpus === "design@regression", "corpus stamp missing")
  } finally {
    if (prev === undefined) delete process.env.SYNCLAIR_CORPUS_REF
    else process.env.SYNCLAIR_CORPUS_REF = prev
  }
  const local = await call("get_overview", {})
  assert(local._meta?.hubRoot, "hubRoot lost locally — the fix overreached")
  return "hidden when hosted, present locally"
})

await behaviour("A projection table indexed without Object.hasOwn", async () => {
  for (const f of ["__proto__", "constructor", "valueOf", "hasOwnProperty"]) {
    const r = await call("search_library", { query: "a", fields: f })
    assert(!r.error, `fields=${f} produced an error`)
    assert(r.fields === "compact", `fields=${f} resolved to ${r.fields}`)
  }
  return "4 prototype keys all fall back to compact"
})

await behaviour("A new endpoint being absent rather than undescribed", async () => {
  const before = JSON.parse(readFileSync(MAP, "utf8")).api.length
  const text = readFileSync(MAP, "utf8")
  editJson(MAP, (m) => {
    m.api = m.api.filter((a) => !String(a.source).includes("geo.transport.handler"))
  })
  run("scan-system.mjs", ["--write"])
  const after = JSON.parse(readFileSync(MAP, "utf8"))
  const re = after.api.filter((a) => String(a.source).includes("geo.transport.handler"))
  writeFileSync(MAP, text)
  assert(re.length > 0, "the write did not re-index the removed endpoints")
  assert(re.every((e) => e.summary === ""), "re-indexed rows were given invented prose")
  return `${before} rows · removed handler re-indexed as ${re.length} row(s) with blank summaries`
})

await behaviour("A check that examines nothing reported as a pass", async () => {
  const out = audit()
  const m = /(\d[\d,]*) records examined/.exec(out)
  assert(m, "the audit does not report a record count")
  assert(!/VACUOUS/.test(out), "a check is currently examining nothing")
  return `${m[1]} records examined, no vacuous checks`
})

// ───────────────────────────────────────────────────────────────────── report

restore()
const clean = intact()
const caught = rows.filter((r) => r.caught).length
writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), caught, total: rows.length, filesRestored: clean, rows }, null, 2)
)

for (const r of rows) {
  console.log(`${r.caught ? "HELD  " : "BROKEN"} [${r.kind}] ${r.defect}`)
  if (r.evidence) console.log(`         ${r.evidence}`)
}
console.log(`\n${caught}/${rows.length} fixes still hold`)
console.log(clean ? "  all touched files restored byte-identical" : "  WARNING: a file was not restored")
console.log(`results → ${OUT}`)
process.exit(caught === rows.length && clean ? 0 : 1)
