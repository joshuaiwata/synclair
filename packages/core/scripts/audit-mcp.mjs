#!/usr/bin/env node
/**
 * ADVERSARIAL AUDIT of the Synclair MCP layer.
 *
 * Not "does it respond" — does it tell the truth, and does it survive input it
 * did not expect. Four suites:
 *
 *   A  robustness   every tool against hostile/degenerate arguments
 *   B  integrity    every file path the hub cites actually exists
 *   C  truth        every endpoint record matches what the code declares
 *   D  retrieval    search behaves like search, not like strcmp
 *
 * Run from the synclair/ directory. Writes results.json beside itself.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"

const HUB = process.cwd()
// The audited repo comes from the MAP'S OWN root, never a hardcoded "..": an
// embedded clone's parent is the host repo, but a standalone clone's parent is
// whatever folder it happens to sit in — resolving blindly against it walked
// every sibling repo on the machine and graded THEIR handlers against this
// hub's map. Absent/blank map → the hub itself.
const REPO = (() => {
  try {
    const m = JSON.parse(readFileSync(path.join(HUB, "data", "system-map.json"), "utf8"))
    if (typeof m?.repo?.root === "string" && m.repo.root) return path.resolve(HUB, m.repo.root)
  } catch {
    /* absent or unreadable → fall through */
  }
  return HUB
})()
// Tripwire (embedded-only ruling): the audited repo is this hub or an ancestor
// of it. Any other root means the audit is about to read foreign ground —
// refuse rather than grade someone else's code against this map.
if (REPO !== HUB && !HUB.startsWith(REPO + path.sep)) {
  console.error(
    `audit:mcp: system-map repo.root resolves outside this hub's ancestry (${REPO}) — ` +
      `an embedded clone's root is itself or an ancestor. Fix data/system-map.json before auditing.`
  )
  process.exit(1)
}
const OUT = process.argv[2] ?? "/tmp/audit-results.json"

const results = []
let suite = ""

/**
 * HOW MANY RECORDS DID THIS CHECK ACTUALLY EXAMINE?
 *
 * The most expensive lesson in this file. Two integrity assertions were reading
 * field names the maps do not write — `sources`/`source` where `pages-map`
 * writes `file`/`sourceFiles` — and a bracket filter meant to skip dynamic route
 * segments was tested against a wrapper object that always contains a bracket.
 * Between them they examined ZERO of 896 sitemap paths and ZERO of 341 hygiene
 * findings, and reported "0 cited paths resolve" as a pass. Twice, in two
 * separate reports, under a heading that read as coverage.
 *
 * A check that examines nothing passes fastest of all. So a test may return a
 * plain string as before, or `{records, detail}` — and a check that declares
 * zero records is reported as a FAILURE, not a pass. The number is the claim;
 * "passed" on its own never was.
 */
const record = (name, started, pass, value) => {
  const obj = value && typeof value === "object" && !Array.isArray(value) ? value : { detail: value }
  const { records, detail } = obj
  const vacuous = pass && records === 0
  results.push({
    suite,
    name,
    pass: pass && !vacuous,
    vacuous,
    records: records ?? null,
    detail: vacuous ? `examined 0 records — this check is asserting nothing` : (detail ?? ""),
    ms: Date.now() - started,
  })
}

const T = (name, fn) => {
  const started = Date.now()
  try {
    record(name, started, true, fn())
  } catch (e) {
    record(name, started, false, e.message)
  }
}
const TA = async (name, fn) => {
  const started = Date.now()
  try {
    record(name, started, true, await fn())
  } catch (e) {
    record(name, started, false, e.message)
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

// The tools import TS artifact modules (B3) — register tsx's loader first so
// the audit keeps running as plain `node scripts/audit-mcp.mjs`.
const { register: registerTsx } = await import("tsx/esm/api")
registerTsx()
const mod = await import(new URL("./mcp-tools.mjs", import.meta.url).href)
const TOOLS = mod.allTools()
const NAMES = Object.keys(TOOLS)

/** Unwrap whatever callTool hands back into a plain object. */
const call = async (name, args) => {
  const r = await mod.callTool(name, args)
  if (typeof r === "string") return JSON.parse(r)
  if (r && Array.isArray(r.content)) return JSON.parse(r.content[0].text)
  return r
}

const readJson = (p) => JSON.parse(readFileSync(path.join(HUB, p), "utf8"))

/** Representative arguments for the tools whose schema requires input. */
const PROBE = { get_component: { name: "status-badge" }, search_all: { query: "account" } }

// ============================================================ A — robustness

suite = "A · robustness"

// Arguments chosen to break things: wrong types, degenerate values, injection-ish
// strings, and the regex metacharacters a naive matcher would compile.
const HOSTILE = [
  ["no args", undefined],
  ["empty object", {}],
  ["null query", { query: null }],
  ["numeric query", { query: 42 }],
  ["array query", { query: ["a", "b"] }],
  ["empty string", { query: "" }],
  ["whitespace only", { query: "   " }],
  ["regex metachars", { query: "*.+?[](){}|^$\\" }],
  ["1k chars", { query: "x".repeat(1000) }],
  ["unicode + emoji", { query: "ロスター 🔌 café" }],
  ["path traversal", { query: "../../etc/passwd" }],
  // Keys that exist on every plain object. A lookup table indexed without
  // `Object.hasOwn` answers these from the PROTOTYPE — `fields: "__proto__"`
  // returned an object and `fields: "valueOf"` a function, both of which were
  // then called as the response mapper. Every tool that indexes a table by a
  // caller-supplied string has this shape, so it is swept for by default.
  ["prototype key __proto__", { query: "__proto__" }],
  ["prototype key constructor", { query: "constructor" }],
  ["prototype key valueOf", { query: "valueOf" }],
  ["prototype key hasOwnProperty", { query: "hasOwnProperty" }],
  ["negative limit", { query: "a", limit: -5 }],
  ["zero limit", { query: "a", limit: 0 }],
  ["huge limit", { query: "a", limit: 1e9 }],
  ["float limit", { query: "a", limit: 2.7 }],
  ["unknown prop", { query: "a", nonsense: true }],
]

/**
 * Aim the sweep at each tool's OWN parameters, read off its schema.
 *
 * Every hostile case above was passed as `{query: …}`, and only three tools take
 * a `query`. For the rest this was sixteen repetitions of "ignores an unknown
 * property" — `get_component` never saw a hostile `name`, `get_page` never saw a
 * hostile `route`, and `search_library` never saw a hostile `fields`, which is
 * where the one real defect was: `fields: "__proto__"` reached the prototype of
 * the projection table and the tool answered "search_library failed".
 */
const paramsOf = (toolName) => Object.keys(TOOLS[toolName].inputSchema?.properties ?? {})

for (const toolName of NAMES) {
  if (toolName === "memories_submit_thought") continue // a write tool; not exercised here
  const params = paramsOf(toolName)
  const cases = [["no args", undefined], ["empty object", {}]]
  for (const p of params) {
    for (const [label, args] of HOSTILE) {
      if (args === undefined) continue
      // Re-key the same hostile value onto the parameter this tool declares.
      const v = "query" in args ? args.query : undefined
      if (v === undefined) continue
      cases.push([`${p}=${label}`, { ...args, [p]: v, ...(p === "query" ? {} : { query: undefined }) }])
    }
  }
  await TA(`${toolName} survives ${cases.length} hostile inputs`, async () => {
    const broke = []
    for (const [label, args] of cases) {
      try {
        const out = await call(toolName, args)
        if (out === undefined || out === null) broke.push(`${label}: empty response`)
        // A tool may legitimately answer "pass a query" — it may not blow up,
        // and it may not answer with something unserialisable.
        JSON.stringify(out)
      } catch (e) {
        broke.push(`${label}: ${e.message}`)
      }
    }
    assert(broke.length === 0, `${broke.length}/${cases.length} failed → ${broke.slice(0, 3).join(" · ")}`)
    return `${cases.length} inputs handled across ${params.length || "no"} declared param(s)`
  })
}

await TA("negative/zero limit never yields negative counts", async () => {
  const bad = []
  for (const limit of [-5, 0, -1e6]) {
    const r = await call("search_library", { query: "a", limit })
    if ((r.returned ?? 0) < 0) bad.push(`returned=${r.returned} at limit=${limit}`)
    if ((r.truncated ?? 0) < 0) bad.push(`truncated=${r.truncated} at limit=${limit}`)
    if ((r.returned ?? 0) > (r.total ?? 0)) bad.push(`returned>total at limit=${limit}`)
  }
  assert(bad.length === 0, bad.join(" · "))
  return "counts stay coherent"
})

await TA("every response fits the 40k client budget", async () => {
  const probes = [
    ["get_overview", {}],
    ["get_system", {}],
    ["get_page", {}],
    ["get_knowledge", {}],
    ["get_foundation", {}],
    ["search_library", { query: "", limit: 1e9, fields: "full" }],
    ["search_all", { query: "a", limit: 1e9 }],
  ]
  const over = []
  for (const [n, a] of probes) {
    const size = JSON.stringify(await call(n, a)).length
    if (size > 40000) over.push(`${n}=${size.toLocaleString()}`)
  }
  assert(over.length === 0, `over budget: ${over.join(", ")}`)
  return "all under 40,000 chars"
})

// ============================================================= B — integrity

suite = "B · integrity"

/**
 * Paths are checked from STRUCTURED FIELDS ONLY, resolved against the root the
 * file itself declares — not scraped out of the raw JSON text.
 *
 * The first version of this suite regex'd the whole document and resolved
 * everything against the repo root. It reported 414 missing files across four
 * maps. Every one was wrong: `pages-map` is rooted at `../apps/prototype`, the
 * catalog and hygiene report carry their own per-host roots, and a path
 * mentioned inside a prose `details` string is commentary, not a citation. A
 * check that cries wolf 414 times is worse than no check — it is the exact
 * failure mode this hub's own drift detector documents.
 */
const collectPaths = (file) => {
  const j = JSON.parse(readFileSync(path.join(HUB, file), "utf8"))
  const abs = (root, p) => path.resolve(HUB, root ?? "..", p)
  const out = []
  const hostRoot = (name) =>
    (j.hosts ?? []).find((h) => h.name === name || h.surface === name)?.root

  if (j.api) for (const e of j.api) if (e.source) out.push(abs(j.repo?.root, e.source))
  if (j.areas) for (const e of j.areas) if (e.path) out.push(abs(j.repo?.root, e.path))
  // `sources` / `source` were the only page fields read here, and pages-map
  // writes neither — it writes `file` and `sourceFiles`. The suite therefore
  // collected ZERO paths from an 81-route map and reported that as a pass. It
  // was green over a page citing two screens that had been deleted.
  // A multi-app pages map carries one root PER SURFACE (`repos[]`), because a
  // second frontend's files are not under the first one's root. Resolving every
  // page against `repo.root` reports the whole second app as missing files —
  // which is a data-integrity failure that isn't one, the loudest kind of wrong.
  const pageRoot = (surface) =>
    (surface && (j.repos ?? []).find((r) => r.surface === surface)?.root) ?? j.repo?.root
  if (j.pages)
    for (const p of j.pages) {
      const root = pageRoot(p.surface)
      if (p.file) out.push(abs(root, p.file))
      for (const s of p.sourceFiles ?? p.sources ?? (p.source ? [p.source] : []))
        out.push(abs(root, typeof s === "string" ? s : s.path))
    }
  if (j.items)
    for (const i of j.items)
      if (i.hostPath) out.push(abs(hostRoot(i.surface ?? i.host) ?? "..", i.hostPath))
  if (j.findings)
    for (const f of j.findings) {
      if (!f.hostPath) continue
      // Findings do not record which host they came from, so a path counts as
      // resolved if ANY declared host root has it.
      const roots = (j.hosts ?? []).map((h) => h.root)
      out.push({ any: roots.map((r) => path.resolve(HUB, r, f.hostPath)) })
    }
  if (j.providers)
    for (const p of j.providers) if (p.source) out.push(abs(j.repo?.root, p.source))
  return out
}

const DATA_FILES = [
  "data/system-map.json",
  "data/pages-map.json",
  ".synclair/cache/contracts.json",
  "data/external-catalog.json",
  ".synclair/cache/host-hygiene.json",
]

for (const f of DATA_FILES) {
  T(`${f} — every cited file exists`, () => {
    if (!existsSync(path.join(HUB, f))) return "absent (skipped)"
    // Paths containing `[` used to be dropped as "dynamic". Two things were
    // wrong with that. A Next dynamic route is a REAL directory — `[...path]` is
    // the folder's actual name, so there was nothing to exempt. And the test ran
    // on the serialised ref, so every `{any: […]}` wrapper matched the bracket
    // too: all 341 hygiene findings were skipped, and the assertion that read
    // "every cited file exists" was checking none of them.
    const refs = collectPaths(f)
    // A blank clone's artifact legitimately cites nothing — that is reset
    // working, not a check examining nothing. Only a POPULATED artifact with
    // zero collected refs is the vacuous trap the records-count exists for.
    if (refs.length === 0) return "artifact cites no files (blank clone) — nothing to resolve"
    const missing = refs.filter((r) =>
      typeof r === "string" ? !existsSync(r) : !r.any.some((p) => existsSync(p))
    )
    const show = missing.slice(0, 4).map((r) => path.relative(REPO, typeof r === "string" ? r : r.any[0]))
    assert(missing.length === 0, `${missing.length}/${refs.length} missing → ${show.join(", ")}`)
    return { records: refs.length, detail: `${refs.length} cited paths resolve` }
  })
}

T("system-map: every api entry carries a source", () => {
  const m = readJson("data/system-map.json")
  const none = m.api.filter((a) => !a.source)
  assert(none.length === 0, `${none.length} entries without source`)
  return `${m.api.length} entries, all sourced`
})

T("system-map: no duplicate endpoint within one service", () => {
  const m = readJson("data/system-map.json")
  // Keyed WITH the source: two services legitimately expose the same path —
  // the same webhook path can exist on two different services, and
  // collapsing those would report a real pair of endpoints as a data error.
  const seen = new Set()
  const dupes = []
  for (const a of m.api) {
    const k = `${a.method} ${a.path} ${a.source}`
    if (seen.has(k)) dupes.push(k)
    seen.add(k)
  }
  assert(dupes.length === 0, `${dupes.length} dupes → ${dupes.slice(0, 3).join(", ")}`)
  return `${m.api.length} entries, no exact duplicates`
})

// ================================================================= C — truth

suite = "C · truth"

/** Every source file under the repo, minus the noise a scan must never read. */
const SKIP = new Set([
  "node_modules", ".git", ".next", ".next-prod", "dist", "build", "out",
  "coverage", ".turbo", ".vercel", "public", "generated", "synclair",
])
function walk(dir, out = [], depth = 0) {
  if (depth > 9) return out
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || SKIP.has(e.name)) continue
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) walk(abs, out, depth + 1)
    else if (e.isFile() && /\.ts$/.test(e.name)) out.push(abs)
  }
  return out
}
const repoFiles = walk(REPO)

/** Wire-name constants, the single source of truth for RPC names. */
const constants = new Map()
for (const abs of repoFiles.filter((f) => /(^|[/-])patterns\.ts$/.test(f) && !/\.(test|spec)\.ts$/.test(f))) {
  const src = readFileSync(abs, "utf8")
  const objRe = /export\s+const\s+(\w+)\s*=\s*\{([\s\S]*?)\n\}/g
  let obj
  while ((obj = objRe.exec(src)) !== null) {
    const memRe = /(\w+)\s*:\s*['"`]([^'"`]+)['"`]/g
    let mem
    while ((mem = memRe.exec(obj[2])) !== null) constants.set(mem[2], abs)
  }
}

T("every mapped RPC wire name is a declared constant", () => {
  const m = readJson("data/system-map.json")
  const rpc = m.api.filter((a) => a.method === "RPC")
  const bogus = []
  for (const e of rpc) {
    for (const nameRaw of String(e.path).split("|")) {
      const n = nameRaw.trim()
      if (!n) continue
      if (!constants.has(n)) bogus.push(n)
    }
  }
  assert(bogus.length === 0, `${bogus.length} invented names → ${bogus.slice(0, 5).join(", ")}`)
  return `${rpc.length} entries, all names declared in kernel`
})

T("every RPC entry's source really declares @MessagePattern", () => {
  const m = readJson("data/system-map.json")
  const bad = m.api
    .filter((a) => a.method === "RPC")
    .filter((a) => {
      const abs = path.join(REPO, a.source)
      return !existsSync(abs) || !readFileSync(abs, "utf8").includes("@MessagePattern")
    })
  assert(bad.length === 0, `${bad.length} → ${bad.map((b) => b.source).slice(0, 3).join(", ")}`)
  return "all RPC sources are real handlers"
})

T("every HTTP entry's source really declares that verb", () => {
  const m = readJson("data/system-map.json")
  // REPO already resolves from the map's own root (with a safe hub fallback) —
  // the "resolve against the map, not a hardcoded ..)" lesson lives up top now.
  const root = REPO
  const bad = []
  for (const a of m.api) {
    if (a.method === "RPC") continue
    const abs = path.join(root, a.source)
    if (!existsSync(abs)) {
      bad.push(`${a.method} ${a.path} (no file)`)
      continue
    }
    const src = readFileSync(abs, "utf8")
    // Next PAGES-router API files are default-export handlers that serve every
    // verb — `export default` IS the declaration there.
    if (/(^|\/)pages\/api\//.test(a.source) && /export\s+default\b/.test(src)) continue
    const verb = a.method[0] + a.method.slice(1).toLowerCase()
    const nest = new RegExp(`@${verb}\\(`).test(src)
    const next = new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${a.method}\\b`).test(src)
    if (!nest && !next) bad.push(`${a.method} ${a.path} → ${a.source}`)
  }
  assert(bad.length === 0, `${bad.length} entries whose source lacks the verb → ${bad.slice(0, 4).join(" · ")}`)
  return "all HTTP sources declare their verb"
})

T("no @MessagePattern handler is entirely undocumented", () => {
  const declared = new Set()
  const m = readJson("data/system-map.json")
  for (const e of m.api.filter((a) => a.method === "RPC")) {
    for (const n of String(e.path).split("|")) declared.add(n.trim())
  }
  const live = new Map()
  for (const abs of repoFiles) {
    if (/\.(test|spec)\.ts$/.test(abs)) continue
    const src = readFileSync(abs, "utf8")
    if (!src.includes("@MessagePattern")) continue
    const re = /@MessagePattern\(\s*(?:['"`]([^'"`]+)['"`]|[\w.]*\.(\w+))\s*\)/g
    let mm
    while ((mm = re.exec(src)) !== null) {
      const lit = mm[1]
      if (lit) live.set(lit, abs)
      else {
        // Resolve CONST -> wire name via the constants table, by member name.
        for (const [wire] of constants) {
          if (wire.toUpperCase().replace(/[.\-]/g, "_") === mm[2]) live.set(wire, abs)
        }
      }
    }
  }
  const undocumented = [...live.keys()].filter((n) => !declared.has(n) && !/ping$/.test(n))
  assert(
    undocumented.length === 0,
    `${undocumented.length} live patterns absent from the map → ${undocumented.slice(0, 6).join(", ")}`
  )
  return `${live.size} live patterns, all documented`
})

T("map does not claim endpoints for services that are gone", () => {
  const m = readJson("data/system-map.json")
  const areas = new Set((m.areas ?? []).map((a) => a.path))
  const orphan = m.api.filter((a) => {
    const top = a.source.split("/").slice(0, 2).join("/")
    return top.startsWith("apps/") && !areas.has(top)
  })
  assert(orphan.length === 0, `${orphan.length} endpoints in unlisted areas → ${[...new Set(orphan.map((o) => o.source.split("/").slice(0, 2).join("/")))].join(", ")}`)
  return "every endpoint sits in a mapped area"
})

// ============================================================= D — retrieval

suite = "D · retrieval"

const totalHits = (r) =>
  Object.values(r.groups ?? {}).reduce((n, g) => n + (g.total ?? 0), 0)

/**
 * Probe material is DERIVED FROM THE CLONE'S OWN CORPUS, never hardcoded.
 * The first version shipped this product's vocabulary ("roster contact",
 * "presigned") — green here, guaranteed-red in every other clone, found the
 * first time the audit ran against a freshly intaken open-source host. A
 * blank clone has no material; those probes say so and step aside instead of
 * passing vacuously or failing on scenery.
 */
const corpus = (() => {
  const m = readJson("data/system-map.json")
  const texts = [
    ...(m.api ?? []).map((e) => e.summary),
    ...(m.areas ?? []).map((e) => e.summary),
    ...(m.data ?? []).map((e) => e.summary),
  ].filter((t) => typeof t === "string" && t.length > 0)
  const phraseCount = new Map()
  for (const t of texts) {
    const words = t.toLowerCase().match(/[a-z]{4,}/g) ?? []
    for (let i = 0; i + 1 < words.length; i++) {
      const pair = `${words[i]} ${words[i + 1]}`
      if (t.toLowerCase().includes(pair))
        phraseCount.set(pair, (phraseCount.get(pair) ?? 0) + 1)
    }
  }
  const phrases = [...phraseCount.keys()]
  // The most distinctive phrase: appears in exactly one summary.
  const unique = phrases.filter((ph) => phraseCount.get(ph) === 1)
  const wordCount = new Map()
  for (const t of texts) {
    for (const w of new Set(t.toLowerCase().match(/[a-z]{6,}/g) ?? [])) {
      wordCount.set(w, (wordCount.get(w) ?? 0) + 1)
    }
  }
  const rare = [...wordCount.entries()].filter(([, n]) => n === 1).map(([w]) => w)
  const apiPaths = (m.api ?? []).map((e) => e.path).filter(Boolean)
  return { texts, phrases, unique, rare, apiPaths }
})()

const NO_CORPUS = "no probe material in this clone's system map (blank or unmapped) — retrieval unexercised, honestly"

await TA("multi-word queries AND their terms", async () => {
  if (corpus.phrases.length === 0) return NO_CORPUS
  const cases = corpus.phrases.slice(0, 5)
  const dead = []
  for (const q of cases) {
    const n = totalHits(await call("search_all", { query: q }))
    if (n === 0) dead.push(q)
  }
  assert(dead.length === 0, `zero results for corpus-derived: ${dead.join(" · ")}`)
  return `${cases.length} corpus-derived multi-word queries all return hits`
})

await TA("search is case-insensitive", async () => {
  if (corpus.phrases.length === 0) return NO_CORPUS
  const q = corpus.phrases[0]
  const a = totalHits(await call("search_all", { query: q.toUpperCase() }))
  const b = totalHits(await call("search_all", { query: q }))
  assert(a === b, `"${q.toUpperCase()}"=${a} vs "${q}"=${b}`)
  return `both forms of "${q}" → ${a} hits`
})

await TA("word order does not change the result set", async () => {
  if (corpus.phrases.length === 0) return NO_CORPUS
  const [w1, w2] = corpus.phrases[0].split(" ")
  const a = totalHits(await call("search_all", { query: `${w2} ${w1}` }))
  const b = totalHits(await call("search_all", { query: `${w1} ${w2}` }))
  assert(Math.abs(a - b) <= 1, `"${w2} ${w1}"=${a} vs "${w1} ${w2}"=${b}`)
  return `${a} / ${b} hits`
})

await TA("a phrase match outranks a scattered-word match", async () => {
  if (corpus.unique.length === 0) return NO_CORPUS
  const q = corpus.unique[0]
  const r = await call("search_all", { query: q })
  const groups = Object.values(r.groups ?? {})
  const first = groups.flatMap((g) => g.items ?? [])[0]
  assert(first, `no results to rank for corpus-derived "${q}"`)
  const text = JSON.stringify(first).toLowerCase()
  assert(text.includes(q), `top hit lacks the phrase "${q}"`)
  return `top hit carries "${q}"`
})

await TA("nonsense returns nothing, not everything", async () => {
  const n = totalHits(await call("search_all", { query: "zzzqqq nonexistent term" }))
  assert(n === 0, `matched ${n} records for gibberish`)
  return "0 hits, as it should be"
})

await TA("a single rare term still resolves", async () => {
  if (corpus.rare.length === 0) return NO_CORPUS
  const term = corpus.rare[0]
  const n = totalHits(await call("search_all", { query: term }))
  assert(n > 0, `no hits for corpus-derived rare term "${term}"`)
  return `"${term}" → ${n} hits`
})

await TA("get_system honours its documented two-shape contract", async () => {
  // Unfiltered is deliberately a compact INDEX (`{count, paths}`); `section` or
  // `query` returns full records. Same key, two shapes — which is a real trap
  // for a caller doing `api.map(...)`, so the contract is asserted rather than
  // assumed, including the hint that tells a caller how to get the detail.
  if (corpus.apiPaths.length === 0)
    return "no api surface in this clone's map (blank) — two-shape contract unexercised"
  const digest = await call("get_system", {})
  assert(!Array.isArray(digest.api), "unfiltered api should be a compact index")
  assert(typeof digest.api?.count === "number", "compact index missing `count`")
  assert(Array.isArray(digest.api?.paths), "compact index missing `paths`")
  assert(
    /section|query/.test(digest._meta?.hint ?? ""),
    "digest does not tell the caller how to get detail"
  )

  const section = await call("get_system", { section: "api" })
  assert(Array.isArray(section.api), "section:api should return records")
  assert(section.api.every((e) => e.source), "section records must carry `source`")

  // Query with a fragment of the clone's OWN api surface — a hardcoded term
  // matched nothing outside this product's corpus.
  const probePath = corpus.apiPaths[0] ?? ""
  const fragment = (probePath.match(/[a-z][a-z-]{3,}/gi) ?? []).sort((a, b) => b.length - a.length)[0]
  if (!fragment) return "no api paths in this clone's map — two-shape query unexercised"
  const filtered = await call("get_system", { query: fragment.toLowerCase() })
  assert(Array.isArray(filtered.api), "query should return records")
  assert(filtered.api.length > 0, `corpus-derived query "${fragment}" matched nothing`)
  assert(filtered.api.length <= section.api.length, "query returned more than the section")
  return `index ${digest.api.count} · section ${section.api.length} · filtered ${filtered.api.length} ("${fragment}")`
})

await TA("a get_page miss is a signpost, not a dead end", async () => {
  // Also from the C1 drill: asking for /my-applications (the view lives at
  // /roster) returned a bare {found:false} with nothing to go on.
  // A wordy route, not "/" — the signpost matches on shared path tokens, and
  // the root route has none to share.
  const real = ((await call("get_page", {})).pages ?? [])
    .map((p) => p.route)
    .find((r) => /[a-z0-9]{4,}/i.test(r ?? ""))
  if (!real) return "no pages mapped in this clone (blank) — signpost unexercised"
  const miss = (await call("get_page", { route: `${real}-not-a-real-suffix` })).pages?.[0]
  assert(miss && miss.found === false, "near-miss route unexpectedly found")
  assert(typeof miss.hint === "string" && miss.hint.length > 0, "miss carries no hint")
  assert(Array.isArray(miss.closest) && miss.closest.includes(real),
    `closest does not surface ${real} → ${JSON.stringify(miss.closest ?? null)}`)
  return `miss on ${real}-… points back to ${real}`
})

await TA("every id the knowledge manifest prints is a usable handle", async () => {
  // Found by the C1 build-a-view drill: the listing printed an `id` on every
  // row, but passing one back (as `id` or as `topic`) was silently ignored and
  // the caller got the full 95-source manifest again. The handle a tool
  // publishes must retrieve the record it labels.
  const all = (await call("get_knowledge", {})).sources ?? []
  if (all.length === 0) return "no knowledge sources in this clone (blank) — handles unexercised"
  const broken = []
  for (const s of all) {
    const byId = await call("get_knowledge", { id: s.id })
    if (byId.returned !== 1 || byId.sources?.[0]?.id !== s.id) broken.push(`id:${s.id}`)
  }
  const byTopic = await call("get_knowledge", { topic: all[0].id })
  if (!byTopic.sources?.some((x) => x.id === all[0].id)) broken.push(`topic:${all[0].id}`)
  assert(broken.length === 0, `${broken.length} unusable handles → ${broken.slice(0, 3).join(" · ")}`)
  return { records: all.length, detail: `${all.length} ids round-trip to exactly their own record` }
})

// ============================================================= F — contracts

suite = "F · contracts"

// Absent = a fresh clone (reset deletes the artifact; readers degrade on
// absence by contract). The audit honors the same contract: each check reports
// "absent (skipped)" instead of failing on ENOENT — found auditing a freshly
// intaken clone where all four contracts checks failed on a missing file.
const CONTRACTS_ABSENT = !existsSync(path.join(HUB, ".synclair/cache/contracts.json"))
const contracts = () => readJson(".synclair/cache/contracts.json")

T("no link is formed on the degenerate root path", () => {
  if (CONTRACTS_ABSENT) return "absent (skipped) — fresh clone, nothing scanned yet"
  const bad = contracts().links.filter((l) => l.path === "/")
  assert(
    bad.length === 0,
    `${bad.length} links on "/" → ${bad.map((b) => `${b.consumerApp}→${b.providerApp}`).slice(0, 4).join(", ")}`
  )
  return "no `/` links"
})

T("every link's consumer file exists and contains its URL", () => {
  if (CONTRACTS_ABSENT) return "absent (skipped) — fresh clone, nothing scanned yet"
  const j = contracts()
  const root = j.repo?.root ?? ".."
  const bad = []
  for (const l of j.links) {
    const abs = path.resolve(HUB, root, l.consumer)
    if (!existsSync(abs)) {
      bad.push(`${l.consumer} (no file)`)
      continue
    }
    // The literal has to be somewhere in the file it was supposedly read from.
    const src = readFileSync(abs, "utf8")
    const stem = String(l.path).split("/:")[0].replace(/^\//, "")
    if (stem && !src.includes(stem)) bad.push(`${l.consumer} lacks "${stem}"`)
  }
  assert(bad.length === 0, `${bad.length} → ${bad.slice(0, 3).join(" · ")}`)
  return `${j.links.length} links, all traceable to their consumer`
})

T("every link's provider really declares that endpoint", () => {
  if (CONTRACTS_ABSENT) return "absent (skipped) — fresh clone, nothing scanned yet"
  const j = contracts()
  const root = j.repo?.root ?? ".."
  const bad = []
  for (const l of j.links) {
    for (const p of l.providers ?? []) {
      const abs = path.resolve(HUB, root, p)
      if (!existsSync(abs)) {
        bad.push(`${p} (no file)`)
        continue
      }
      const src = readFileSync(abs, "utf8")
      const verb = l.method[0] + l.method.slice(1).toLowerCase()
      const ok =
        new RegExp(`@${verb}\\(`).test(src) ||
        new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${l.method}\\b`).test(src)
      if (!ok) bad.push(`${p} lacks ${l.method}`)
    }
  }
  assert(bad.length === 0, `${bad.length} → ${bad.slice(0, 3).join(" · ")}`)
  return "all providers declare their verb"
})

T("unresolvable URLs are counted, not silently dropped", () => {
  if (CONTRACTS_ABSENT) return "absent (skipped) — fresh clone, nothing scanned yet"
  const d = contracts().diagnostics ?? {}
  assert(typeof d.opaqueCalls === "number", "no opaqueCalls diagnostic")
  assert(Array.isArray(d.unmatched), "no unmatched list")
  return `${d.opaqueCalls} opaque · ${d.unmatched.length} unmatched, all reported`
})

// ============================================================= E — freshness

suite = "E · freshness"

/**
 * Recompute an anchor the way `anchorOf` in scan-system.mjs writes it: for each
 * source file in order — the repo-relative path, a newline, the file bytes, a
 * NUL. If this disagrees with the stored hash, the artifact is describing code
 * that has since changed, and anything reporting it as "fresh" is wrong.
 */
const { createHash } = await import("node:crypto")
const recompute = (root, sourceFiles) => {
  const h = createHash("sha256")
  let any = false
  for (const rel of sourceFiles) {
    const abs = path.resolve(HUB, root ?? "..", rel)
    if (!existsSync(abs)) continue
    h.update(rel)
    h.update("\n")
    h.update(readFileSync(abs))
    h.update("\0")
    any = true
  }
  return any ? h.digest("hex") : null
}

const ANCHORED = [
  ["data/system-map.json", ".."],
  ["data/pages-map.json", null],
  [".synclair/cache/host-hygiene.json", null],
  [".synclair/cache/contracts.json", null],
]

for (const [file, rootOverride] of ANCHORED) {
  T(`${file} — anchor sources all exist`, () => {
    if (!existsSync(path.join(HUB, file))) return "absent (skipped)"
    const j = JSON.parse(readFileSync(path.join(HUB, file), "utf8"))
    const p = j.provenance ?? {}
    if (!p.sourceFiles?.length) return "unanchored (not a failure)"
    const root = rootOverride ?? j.repo?.root ?? ".."
    const missing = p.sourceFiles.filter((r) => !existsSync(path.resolve(HUB, root, r)))
    assert(
      missing.length === 0,
      `${missing.length}/${p.sourceFiles.length} anchor sources gone → ${missing.slice(0, 3).join(", ")}`
    )
    return `${p.sourceFiles.length} anchor sources present`
  })

  T(`${file} — stored hash matches the files on disk`, () => {
    if (!existsSync(path.join(HUB, file))) return "absent (skipped)"
    const j = JSON.parse(readFileSync(path.join(HUB, file), "utf8"))
    const p = j.provenance ?? {}
    if (!p.sourceHash || !p.sourceFiles?.length) return "unanchored (not a failure)"
    const root = rootOverride ?? j.repo?.root ?? ".."
    const now = recompute(root, p.sourceFiles)
    assert(
      now === p.sourceHash,
      `STALE — stored ${String(p.sourceHash).slice(0, 12)} vs on-disk ${String(now).slice(0, 12)}`
    )
    return `hash matches (${p.sourceFiles.length} files)`
  })
}

await TA("reported freshness agrees with recomputed anchors", async () => {
  const o = await call("get_overview", {})
  const claims = { system: o.system?.freshness, pages: o.pages?.freshness }
  const files = { system: "data/system-map.json", pages: "data/pages-map.json" }
  const lies = []
  for (const [k, claimed] of Object.entries(claims)) {
    if (!claimed || claimed === "unanchored") continue
    const j = JSON.parse(readFileSync(path.join(HUB, files[k]), "utf8"))
    const p = j.provenance ?? {}
    if (!p.sourceHash) continue
    const root = k === "system" ? ".." : (j.repo?.root ?? "..")
    const actual = recompute(root, p.sourceFiles) === p.sourceHash ? "fresh" : "stale"
    if (claimed !== actual) lies.push(`${k}: reports "${claimed}", is "${actual}"`)
  }
  assert(lies.length === 0, lies.join(" · "))
  return `system=${claims.system} pages=${claims.pages}, both verified`
})

// ============================================================== G — protocol

suite = "G · protocol"

/**
 * `handle()` is the JSON-RPC dispatcher both transports share byte-for-byte —
 * stdio (`mcp-server.mjs`) and HTTP (`app/api/mcp/route.ts`). Testing it once
 * covers the remote endpoint's behaviour without standing a server up, which is
 * the only reason a remote transport is safe to add at all: there is one
 * dispatcher, not two implementations that agree until they don't.
 */
const rpc = (msg) => mod.handle(msg)

await TA("initialize returns protocol version and server info", async () => {
  const r = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })
  assert(r?.result, "no result")
  assert(r.result.protocolVersion, "no protocolVersion")
  assert(r.result.serverInfo?.name, "no serverInfo.name")
  assert(r.id === 1, `id not echoed: ${r.id}`)
  return `${r.result.serverInfo.name} · ${r.result.protocolVersion}`
})

await TA("tools/list advertises every tool with a schema", async () => {
  const r = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })
  const tools = r?.result?.tools
  assert(Array.isArray(tools), "tools is not an array")
  assert(tools.length === NAMES.length, `${tools.length} advertised vs ${NAMES.length} registered`)
  const bad = tools.filter((t) => !t.name || !t.description || !t.inputSchema)
  assert(bad.length === 0, `${bad.length} tools missing name/description/inputSchema`)
  return `${tools.length} tools, all fully described`
})

await TA("tools/call returns MCP content, not a bare object", async () => {
  const r = await rpc({
    jsonrpc: "2.0", id: 3, method: "tools/call",
    params: { name: "get_overview", arguments: {} },
  })
  assert(Array.isArray(r?.result?.content), "result.content is not an array")
  assert(r.result.content[0]?.type === "text", "first content block is not text")
  JSON.parse(r.result.content[0].text)
  return "content[0].text parses as JSON"
})

await TA("an unknown method is a JSON-RPC error, not a crash", async () => {
  const r = await rpc({ jsonrpc: "2.0", id: 4, method: "does/not/exist" })
  assert(r?.error, "no error returned")
  assert(r.error.code === -32601, `expected -32601 method-not-found, got ${r.error.code}`)
  return `code ${r.error.code}`
})

await TA("an unknown tool errors without inventing an answer", async () => {
  const r = await rpc({
    jsonrpc: "2.0", id: 5, method: "tools/call",
    params: { name: "get_nonexistent_thing", arguments: {} },
  })
  const said = JSON.stringify(r)
  assert(r?.error || r?.result?.isError, `neither error nor isError: ${said.slice(0, 120)}`)
  return "refused"
})

await TA("a notification (no id) gets no reply", async () => {
  const r = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" })
  assert(r === null || r === undefined, `expected no reply, got ${JSON.stringify(r).slice(0, 80)}`)
  return "silent, as the spec requires"
})

await TA("malformed messages are rejected, not executed", async () => {
  const bad = [
    ["not an object", "string"],
    ["null", null],
    ["array", []],
    ["missing method", { jsonrpc: "2.0", id: 9 }],
    ["numeric method", { jsonrpc: "2.0", id: 9, method: 5 }],
    ["params not object", { jsonrpc: "2.0", id: 9, method: "tools/call", params: 5 }],
    ["call without name", { jsonrpc: "2.0", id: 9, method: "tools/call", params: {} }],
  ]
  const broke = []
  for (const [label, msg] of bad) {
    try {
      const r = await rpc(msg)
      if (r && !r.error && !r.result?.isError) broke.push(`${label}: accepted`)
    } catch (e) {
      broke.push(`${label}: threw ${e.message}`)
    }
  }
  assert(broke.length === 0, broke.join(" · "))
  return `${bad.length} malformed messages all refused cleanly`
})

await TA("the stdio transport answers a real request end to end", async () => {
  const { execFileSync } = await import("node:child_process")
  const req = [
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    // Deliberately no trailing newline on the last line: a client that writes
    // and closes must still be answered, not left with its request in a buffer.
    JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_overview", arguments: {} } }),
  ].join("\n")
  const out = execFileSync(process.execPath, [new URL("./mcp-server.mjs", import.meta.url).pathname], {
    input: req, encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024,
  })
  const lines = out.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
  assert(lines.length === 3, `expected 3 replies, got ${lines.length}`)
  assert(lines.map((l) => l.id).join(",") === "1,2,3", `replies out of order: ${lines.map((l) => l.id)}`)
  assert(lines[2].result?.content, "third reply carried no content")
  return "3 requests, 3 ordered replies, no trailing newline needed"
})

// ======================================================== H — remote safety

suite = "H · remote safety"

/**
 * Properties that must hold before any of this is served over a network. The
 * corpus stamp is the load-bearing one: a hosted answer describes the branch
 * the image was built from, NOT the caller's checkout, and an agent that cannot
 * see which tree it is being told about will assert someone else's facts into a
 * rebased working copy with total confidence.
 */
const withHosted = async (fn) => {
  const prev = process.env.SYNCLAIR_CORPUS_REF
  process.env.SYNCLAIR_CORPUS_REF = "design@testsha"
  try {
    // The module caches nothing per-call, so the env change takes effect at once.
    return await fn()
  } finally {
    if (prev === undefined) delete process.env.SYNCLAIR_CORPUS_REF
    else process.env.SYNCLAIR_CORPUS_REF = prev
  }
}

await TA("every read tool names the tree its answer describes", async () => {
  await withHosted(async () => {
    const missing = []
    for (const n of NAMES) {
      if (n === "memories_submit_thought") continue
      const out = await call(n, PROBE[n] ?? {})
      if (out?._meta?.corpus !== "design@testsha") missing.push(n)
    }
    assert(missing.length === 0, `${missing.length} tools without a corpus stamp → ${missing.join(", ")}`)
  })
  return `${NAMES.length - 1} tools stamp the corpus when hosted`
})

await TA("hosted responses do not disclose the server's filesystem", async () => {
  await withHosted(async () => {
    const leaks = []
    for (const n of NAMES) {
      if (n === "memories_submit_thought") continue
      const out = await call(n, PROBE[n] ?? {})
      if (out?._meta?.hubRoot) leaks.push(n)
    }
    assert(leaks.length === 0, `${leaks.length} tools leak hubRoot → ${leaks.join(", ")}`)
  })
  return "no absolute host paths in _meta"
})

/**
 * The _meta check above only proves the FIELD is withheld — a tool that embeds
 * an absolute path in its body (a file citation, an error message, a preview
 * URL) discloses the server's filesystem just as loudly. Sweep the whole
 * serialized response for this hub's real absolute path while hosted.
 */
await TA("hosted response bodies never contain the server's absolute path", async () => {
  await withHosted(async () => {
    const leaks = []
    for (const n of NAMES) {
      if (n === "memories_submit_thought") continue
      const body = JSON.stringify(await call(n, PROBE[n] ?? {}))
      if (body.includes(HUB)) leaks.push(n)
    }
    assert(leaks.length === 0, `${leaks.length} tools embed the hub path in their body → ${leaks.join(", ")}`)
  })
  return "no absolute hub path anywhere in any hosted response"
})

/**
 * This asserted only that the env var was unset, and cited suite A for the rest
 * — but suite A never looks at `hubRoot` either, so nothing anywhere checked it.
 * Hiding hubRoot when hosted is only half the property: the other half is that a
 * LOCAL caller still gets it, and a one-character overreach in the hosted fix
 * would have removed it everywhere with every gate green.
 */
await TA("local responses still carry hubRoot", async () => {
  assert(!process.env.SYNCLAIR_CORPUS_REF, "test env is polluted")
  const bare = []
  for (const n of NAMES) {
    if (n === "memories_submit_thought") continue
    const out = await call(n, PROBE[n] ?? {})
    if (!out?._meta?.hubRoot) bare.push(n)
  }
  assert(bare.length === 0, `${bare.length} tools dropped hubRoot locally → ${bare.join(", ")}`)
  return `${NAMES.length - 1} tools name their hub when unhosted`
})

T("the one write tool is identifiable so it can be withheld remotely", () => {
  const writes = NAMES.filter((n) => /submit|create|write|update|delete/.test(n))
  // The write tool belongs to the Memories extension, and an extension a clone
  // has switched OFF takes its tool with it — that is the extension model
  // working, not an audit failure. The expectation follows the switch: exactly
  // one write tool when Memories is on, exactly zero when it is off. (Found
  // when a clone disabled Memories and its own MCP audit started failing.)
  let memoriesOn = true
  try {
    const ext = readJson("data/extensions.json")
    memoriesOn = (ext.extensions?.["collaborative-memory"] ?? "on") !== "off"
  } catch {
    /* no state file → manifest default (on) */
  }
  if (memoriesOn) {
    assert(writes.length === 1 && writes[0] === "memories_submit_thought",
      `expected exactly one write tool, found: ${writes.join(", ") || "none"}`)
    return "memories_submit_thought — the only non-read tool"
  }
  assert(writes.length === 0,
    `Memories is off, so expected zero write tools, found: ${writes.join(", ")}`)
  return "Memories off — zero write tools, correctly withheld"
})

// ======================================================= I — self-maintenance

suite = "I · self-maintenance"

/**
 * The map now indexes itself: `scan:system --write` appends a mechanical row
 * for any endpoint it can see and leaves the summary empty. These assert the
 * invariants that make that safe to run unattended — checked against the data
 * as it stands, never by running a write, because a gate that mutates the thing
 * it is grading is not a gate.
 */
T("the undescribed count in provenance is the truth", () => {
  const m = readJson("data/system-map.json")
  const blank = m.api.filter((e) => !e.summary).length
  const recorded = m.provenance?.undescribedEndpoints
  if (recorded === undefined) return `not recorded yet (${blank} blank) — written on the next --write`
  assert(recorded === blank, `provenance says ${recorded}, the data has ${blank}`)
  return `${blank} undescribed, recorded honestly`
})

T("confidence is never 'high' while endpoints are undescribed", () => {
  const m = readJson("data/system-map.json")
  const blank = m.api.filter((e) => !e.summary).length
  const c = m.provenance?.confidence
  assert(!(c === "high" && blank > 0), `confidence "high" with ${blank} blank summaries`)
  return `confidence ${c} · ${blank} undescribed`
})

T("every entry carries the fields an indexed row needs", () => {
  const m = readJson("data/system-map.json")
  const bad = m.api.filter((e) => !e.method || !e.path || !e.source)
  assert(bad.length === 0, `${bad.length} entries missing method/path/source`)
  return `${m.api.length} rows, all structurally complete`
})

// ================================================================== finish

const pass = results.filter((r) => r.pass).length
const fail = results.length - pass
writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), pass, fail, results }, null, 2)
)

for (const r of results) {
  if (!r.pass) {
    console.log(`${r.vacuous ? "VACUOUS" : "FAIL   "} [${r.suite}] ${r.name}\n        ${r.detail}`)
  }
}

/**
 * Report the RECORD count alongside the assertion count. "58 assertions passed"
 * and "58 assertions passed over 1,582 records" are different claims, and only
 * the second one survives a check silently reading a field name that does not
 * exist.
 */
const counted = results.filter((r) => typeof r.records === "number")
const examined = counted.reduce((n, r) => n + r.records, 0)
const vacuous = results.filter((r) => r.vacuous).length
console.log(
  `\n${pass}/${results.length} passed · ${fail} failed`
  + (vacuous ? ` (${vacuous} examining nothing)` : "")
)
if (counted.length) {
  console.log(
    `  ${examined.toLocaleString()} records examined across ${counted.length} counted check(s);`
    + ` ${results.length - counted.length} report no count.`
  )
}
console.log(`results → ${OUT}`)
process.exit(fail > 0 ? 1 : 0)
