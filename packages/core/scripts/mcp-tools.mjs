/**
 * SYNCLAIR MCP TOOLS — the transport-agnostic core of the MCP server.
 *
 * Everything that ANSWERS lives here: the data readers, the tool registry, and
 * the JSON-RPC dispatcher (`handle`). Everything that LISTENS lives elsewhere,
 * and there are two listeners sharing this one registry:
 *
 *   scripts/mcp-server.mjs   stdio — for editor/CLI agents working in a clone
 *   app/api/mcp/route.ts     HTTP  — the same tools on a hosted hub, so agents
 *                            WITHOUT a local clone get identical answers
 *
 * The split exists so those two can never drift: a tool added here appears on
 * both transports, byte-identical. Keep this module dependency-free and free of
 * transport concerns (no stdin/stdout, no Request/Response) — auth, streaming,
 * and framing belong to the listeners.
 *
 * Properties inherited by both transports:
 *
 *   NO HUB REQUIRED — reads `registry.json` and `data/*.json` off disk; never
 *   boots Next or binds a port. (The HTTP route runs inside Next, but the tools
 *   still only read files.)
 *
 *   NO DEPENDENCIES — raw JSON-RPC, no SDK. A cloned foundation must work in
 *   any clone with zero install.
 *
 *   LOCATION-ANCHORED, NOT CWD-ANCHORED — the hub root is derived from this
 *   file's own path, so answers are identical whether the caller's cwd is the
 *   hub (embedded topology) or the host repo beside it (watcher topology).
 *
 * Tools are TASK-SHAPED, not one-per-file: batched where it matters, each
 * returning the slice an agent asked for plus a `_meta` block carrying
 * freshness. Measure the difference with `npm run measure:agent-cost`.
 */

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { extensionTools } from "./extension-tools.mjs"

// One owner per artifact (B3): map file access goes through lib/artifacts/*.
// This file loads under tsx (registered by its entrypoints), so importing TS
// here is fine. The adapter mirrors readJson's old sentinel contract.
import { readPagesMapFile } from "../lib/artifacts/pages-map.ts"
import { readSystemMapFile } from "../lib/artifacts/system-map.ts"
import { readHostHygieneArtifact } from "../lib/artifacts/host-hygiene.ts"

const readMapArtifact = (readFn) => {
  const file = readFn()
  if (file.state === "absent") return null
  if (file.state === "unreadable") return { __unreadable: true }
  return file.value
}
const readPagesMapJson = () => readMapArtifact(readPagesMapFile)
const readSystemMapJson = () => readMapArtifact(readSystemMapFile)

/**
 * The HUB root is the CALLER'S working directory. Before the split this file
 * lived at <hubRoot>/scripts/ and derived the root from its own location
 * ("never process.cwd()") — inside the package that same derivation resolves
 * to packages/core, and every hub-rooted read (data/, extensions state) lands
 * inside the package instead of the hub. Found by the first clone migration:
 * the Memories write tool served with the extension off, because its state
 * was read from a data/ directory that doesn't exist. Every runtime that
 * loads this module — next dev/start, the synclair CLI, the stdio server,
 * the audit — runs with cwd = hub root, which is now the honest source.
 */
export const HUB_ROOT = process.cwd()

export const SERVER_INFO = { name: "synclair", version: "0.1.0" }
const DEFAULT_PROTOCOL = "2024-11-05"

// ------------------------------------------------------------------ reading

const abs = (rel) => path.join(HUB_ROOT, rel)

function readText(rel) {
  const p = abs(rel)
  if (!existsSync(p)) return null
  try {
    return readFileSync(p, "utf8")
  } catch {
    return null
  }
}

function readJson(rel) {
  const text = readText(rel)
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch (e) {
    // A corrupt data file must be loud, not silently an empty hub.
    return { __unreadable: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Freshness, mirroring `lib/system/provenance.ts`. Duplicated deliberately:
 * this script must run without a TypeScript runtime (Node 20 has no type
 * stripping), the same way `scripts/check-pages.mjs` does. The framing —
 * rel + "\n" + bytes + "\0" — MUST stay byte-identical across all three or the
 * drift checks and the UI will disagree about what is stale.
 */
function hashSources(files, baseDir) {
  const hash = createHash("sha256")
  let any = false
  for (const rel of files ?? []) {
    const p = path.join(baseDir, rel)
    if (!existsSync(p)) continue
    hash.update(rel)
    hash.update("\n")
    hash.update(readFileSync(p))
    hash.update("\0")
    any = true
  }
  return any ? hash.digest("hex") : null
}

/** `repoRoot`: null/absent = this repo; a path = the HOST repo, relative to it. */
const baseDirFor = (repoRoot) =>
  repoRoot ? path.join(HUB_ROOT, repoRoot) : HUB_ROOT

function syncState(anchor, repoRoot) {
  if (!anchor?.sourceHash || !anchor.sourceFiles?.length) return "unanchored"
  const current = hashSources(anchor.sourceFiles, baseDirFor(repoRoot))
  if (current === null) return "unanchored"
  return current === anchor.sourceHash ? "fresh" : "stale"
}

// --------------------------------------------------------- TS seed extraction

/**
 * A few sources of truth are TypeScript modules, not JSON (tokens, the project
 * seed). Rather than take a TS runtime, we scan the literals — they are
 * single-line, stable, and lint-enforced. Extraction is TOLERANT: a shape we
 * don't recognise yields nothing rather than a wrong answer, and every caller
 * reports what it couldn't read instead of pretending the data is empty.
 */
/**
 * Token literals, from either source file. Both use the same single-line shape.
 */
function scanTokenFile(rel) {
  const text = readText(rel)
  if (!text) return null
  const tokens = []
  const re =
    /\{\s*name:\s*"([^"]+)",\s*bg:\s*"([^"]*)",\s*value:\s*"([^"]*)",\s*usage:\s*"([^"]*)"/g
  let m
  while ((m = re.exec(text)) !== null) {
    tokens.push({ name: m[1], class: m[2], value: m[3], usage: m[4] })
  }
  return tokens
}

/**
 * WHOSE tokens are these?
 *
 * `lib/system/tokens.ts` is Synclair's OWN chrome. Its own header says so: in
 * companion mode "these style SYNCLAIR, not the product (the host's palette
 * lives in BRAND_RAMPS)". Returning them to an agent asking which token to use
 * for the PRODUCT is a confidently wrong answer with a usage string attached —
 * on a real clone it answered `primary = #1c1917` (a stone neutral) when the
 * product's primary is a product brand colour.
 *
 * So in companion mode the product's ramps lead and the hub's chrome is
 * labelled as such. When the clone IS the product there's no distinction to
 * draw, and the semantic set is the answer.
 */
function scanTokens() {
  const hub = scanTokenFile("lib/system/tokens.ts")
  const brand = scanTokenFile("lib/system/seed/brand-ramps.ts")
  if (!hub && !brand) return { tokens: [], unreadable: "no token source found" }

  const cat = readJson("data/external-catalog.json")
  const companion = Array.isArray(cat?.hosts) && cat.hosts.length > 0

  if (companion && brand?.length) {
    return {
      tokens: brand,
      scope: "product",
      hubTokens: hub ?? [],
      note:
        "These are the PRODUCT's brand values (lib/system/seed/brand-ramps.ts) — use them. " +
        "`hubTokens` is Synclair's own chrome and styles the hub, not the app.",
    }
  }
  return { tokens: hub ?? [], scope: "product" }
}

function scanProject() {
  const text = readText("lib/system/seed/project.ts")
  if (!text) return {}
  const name = /name:\s*"([^"]*)"/.exec(text)?.[1]
  const tagline = /tagline:\s*"([^"]*)"/.exec(text)?.[1]
  return { name, tagline }
}

/** Knowledge sources live in a TS module; pull the fields an agent needs. */
function scanKnowledgeSources() {
  const text = readText("lib/system/knowledge/sources.ts")
  if (!text) return []
  const out = []
  const re = /\{[^{}]*?id:\s*"([^"]+)"[^{}]*?\}/gs
  let m
  while ((m = re.exec(text)) !== null) {
    const body = m[0]
    const pick = (k) => new RegExp(`${k}:\\s*"([^"]*)"`).exec(body)?.[1]
    const title = pick("title")
    if (!title) continue
    out.push({
      id: m[1],
      title,
      kind: pick("kind"),
      area: pick("area"),
      url: pick("url"),
      // The repo-relative file for in-repo sources — without it an agent can
      // FIND a document here and still be unable to open it (found by
      // consuming this tool: nine ticket packs returned with no way in).
      path: pick("path"),
      distilledInto: pick("distilledInto"),
    })
  }
  return out
}

// -------------------------------------------------------------- data loaders

const lower = (s) => (s ?? "").toString().toLowerCase()

/**
 * A query's words. Every search here took the query as ONE substring, which
 * quietly made multi-word queries phrase searches: "roster contact" worked only
 * because that exact phrase happens to be written in a summary, while "file
 * upload" returned nothing at all from a corpus holding `UploadSession`, a
 * `file-api` area and four endpoints about presigned uploads.
 *
 * Zero results is the worst possible wrong answer — it doesn't read as "phrase
 * not found", it reads as "this tool doesn't know about that", which is the one
 * conclusion that stops someone opening it again.
 */
const terms = (q) => lower(q).trim().split(/\s+/).filter(Boolean)

/**
 * Does `fields` match `q`? The exact phrase wins; failing that, EVERY word must
 * appear somewhere in the record (AND, not OR — an OR over words turns a
 * two-word query into a flood, which teaches the same distrust by the opposite
 * route). Returns the phrase/word distinction so callers can keep ranking
 * phrase hits above scattered-word hits.
 */
function hit(fields, q) {
  const hay = fields.filter(Boolean).map(lower)
  const phrase = lower(q).trim()
  if (!phrase) return { phrase: false, all: false }
  if (hay.some((f) => f.includes(phrase))) return { phrase: true, all: true }
  const words = terms(q)
  if (words.length < 2) return { phrase: false, all: false }
  return { phrase: false, all: words.every((w) => hay.some((f) => f.includes(w))) }
}

/** A caller-supplied `limit` as a usable positive integer, or the default. */
function clampLimit(value, fallback) {
  if (!Number.isFinite(value)) return fallback
  const n = Math.floor(value)
  return n > 0 ? n : fallback
}

/** Set when a library source failed to parse — surfaced on every response that
 *  reads it, so "0 results" is never mistaken for "nothing exists". */
function libraryUnreadable() {
  const reg = readJson("registry.json")
  const cat = readJson("data/external-catalog.json")
  const bad = []
  if (reg?.__unreadable) bad.push(`registry.json: ${reg.__unreadable}`)
  if (cat?.__unreadable)
    bad.push(`data/external-catalog.json: ${cat.__unreadable}`)
  return bad.length ? bad.join(" · ") : null
}

function registryItems() {
  const reg = readJson("registry.json")
  if (!reg || reg.__unreadable || !Array.isArray(reg.items)) return []
  /**
   * shadcn registry types → Synclair tiers. `registry:page` is a whole view, so
   * it belongs with templates — it was falling through to "component" and
   * inflating that count.
   */
  const tierOf = (type) =>
    type?.includes("block")
      ? "block"
      : type?.includes("template") || type?.includes("page")
        ? "template"
        : "component"
  return reg.items.map((it) => ({
    name: it.name,
    tier: tierOf(it.type),
    title: it.title,
    description: it.description,
    origin: "native",
    status: it.meta?.status,
    layer: it.meta?.layer,
    path: it.files?.[0]?.path,
    hasDocs: Boolean(it.docs),
    categories: it.categories,
  }))
}

/**
 * Field names here MUST match `ExternalItem` in lib/system/external.ts. They
 * didn't: `path` read `it.source ?? it.path` and `usageCount` read
 * `it.usageCount`, neither of which exists — so every catalogued component came
 * back with `path: undefined` (145/145 on a real clone) while the response
 * looked perfectly well-formed. `check-mcp-contract.mjs` guards this now.
 */
function externalItems() {
  const cat = readJson("data/external-catalog.json")
  if (!cat || cat.__unreadable || !Array.isArray(cat.items)) return []
  return cat.items.map((it) => ({
    name: it.name,
    tier: it.kind ?? "component",
    title: it.title ?? it.name,
    description: it.description,
    origin: "host",
    status: it.status,
    path: it.hostPath,
    surface: it.surface,
    basis: it.basis,
    usageCount: it.usage?.fileCount,
  }))
}

const allItems = () => [...registryItems(), ...externalItems()]

function pagesMap() {
  const map = readPagesMapJson()
  if (!map || map.__unreadable || !map.repo) return null
  return map
}

// --------------------------------------------------------------------- tools

/**
 * `_meta` rides on every response: where the answer came from and how much we
 * trust it. An agent that can see "stale" decides differently than one that
 * can't, and the alternative — silently serving a stale answer — is the failure
 * mode this whole layer exists to prevent.
 */
/**
 * IS THE ANSWER BEHIND THE CALLER'S OWN WORKING TREE?
 *
 * The digests are regenerated at commit, at merge and daily — which leaves one
 * window uncovered, and it is the worst one: between saving a file and
 * committing it. That is exactly when someone is building with an agent beside
 * them, and until now the tools answered questions about their half-finished
 * work with total confidence and no idea it existed. A saved-but-uncommitted
 * controller returned zero results and `_meta` said nothing at all.
 *
 * Cheap and specific: ask git whether anything is uncommitted among the files
 * the API surface is derived from. Not a general "you have changes" — a
 * developer always has changes — but "changes to the kind of file that would
 * alter this answer".
 *
 * Reported, never corrected. Rescanning inside a read tool would make every
 * question write to disk, and a tool that mutates the thing it is describing is
 * a worse trade than one that admits its age. Silent when the tree is clean, so
 * the common case costs one `git status` and says nothing.
 */
const API_PATHS = [
  "apps/*/src/**/*.controller.ts",
  "apps/*/src/**/*.handler.ts",
  "apps/*/app/**/route.ts",
  "apps/*/prisma/schema.prisma",
  "packages/*/src/transport",
]
function workingTreeDrift() {
  const map = readSystemMapJson()
  const root = map?.repo?.root
  if (!root) return null
  const cwd = path.join(HUB_ROOT, root)
  if (!existsSync(cwd)) return null
  try {
    const out = execFileSync(
      "git",
      ["status", "--porcelain", "--", ...API_PATHS],
      { cwd, encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }
    ).trim()
    if (!out) return null
    const n = out.split("\n").filter(Boolean).length
    return `${n} uncommitted change(s) to API-declaring files — these answers describe the last commit, not your working tree. Re-run \`npm run scan:system -- --write\` to include them.`
  } catch {
    // Not a git repo, git unavailable, or a timeout. Unknown is not a warning.
    return null
  }
}

/**
 * HOW OLD IS THIS ANSWER, AND WHAT COMMIT DOES IT DESCRIBE?
 *
 * `workingTreeDrift` covers the save-to-commit window. This covers the much
 * wider one after it: commits that landed since the digest was generated —
 * someone else's merge, a pull, a branch switch. The hub PAGE has always shown
 * this ("N commits touching the code this map is built from have landed
 * since"), but an agent never sees the page. It sees `_meta`, and `_meta` said
 * nothing — so an artifact that was simply behind read as authoritative.
 *
 * That is not hypothetical: a scan indexed two whole backend modules without
 * describing them, an agent queried the map, got an empty list, and concluded
 * the codebase had no such endpoints. Nothing in the response could have told
 * it otherwise.
 *
 * Reported, never corrected — same rule as the working-tree check. `behind` is
 * omitted entirely when the digest is level with HEAD, so a fresh clone says
 * nothing rather than carrying a reassurance nobody needs.
 */
function indexAge() {
  const map = readSystemMapJson()
  const indexedCommit = map?.provenance?.commit ?? map?.repo?.commit
  const generatedAt = map?.provenance?.generatedAt ?? map?.repo?.digestedAt
  if (!indexedCommit && !generatedAt) return {}

  const out = {}
  if (indexedCommit) out.indexedCommit = indexedCommit
  if (generatedAt) {
    const ms = Date.now() - new Date(generatedAt).getTime()
    if (Number.isFinite(ms) && ms >= 0) out.indexAgeDays = Math.floor(ms / 86_400_000)
  }

  const root = map?.repo?.root
  const cwd = root ? path.join(HUB_ROOT, root) : HUB_ROOT
  if (!indexedCommit || !existsSync(cwd)) return out
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    // Short vs long hashes: compare on the shorter of the two.
    const n = Math.min(head.length, indexedCommit.length)
    if (head.slice(0, n) === indexedCommit.slice(0, n)) return out
    const count = execFileSync("git", ["rev-list", "--count", `${indexedCommit}..HEAD`], {
      cwd,
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    out.behind =
      `indexed at ${indexedCommit.slice(0, 7)}, HEAD is ${head.slice(0, 7)}` +
      (/^\d+$/.test(count) && count !== "0" ? ` (${count} commit(s) since)` : "") +
      ` — anything added since is missing here, not absent from the codebase. ` +
      `Re-run \`npm run scan:system -- --write\` to catch up.`
  } catch {
    // Unknown is not a warning: an unresolvable commit (shallow clone, rebased
    // away) must not manufacture a staleness claim we cannot support.
  }
  return out
}

function meta(extra = {}) {
  const setup = readJson("data/setup.json")
  const drift = workingTreeDrift()
  return {
    source: "synclair",
    ...indexAge(),
    ...(drift ? { workingTree: drift } : {}),
    /**
     * Locally this is how an agent finds the hub on disk. On a hosted
     * deployment the caller has no access to that filesystem, so the absolute
     * container path is useless to them and is simply infrastructure detail
     * handed to whoever holds a token. Omitted there — the same signal that
     * says "this is a hosted corpus" says "there is no local path to give".
     */
    ...(process.env.SYNCLAIR_CORPUS_REF ? {} : { hubRoot: HUB_ROOT }),
    setupMode: setup?.mode ?? null,
    /**
     * WHICH TREE do these answers describe? Locally: the working tree, so
     * nothing to declare. On a hosted deployment the caller may be working on a
     * DIFFERENT branch than the one the image was built from — an agent that
     * can see "this corpus is <branch>@<sha>" can caveat instead of asserting
     * design-branch facts into someone else's checkout. The deploy sets this
     * (build arg → env); unset means local.
     */
    ...(process.env.SYNCLAIR_CORPUS_REF
      ? { corpus: process.env.SYNCLAIR_CORPUS_REF }
      : {}),
    ...extra,
  }
}

/**
 * RESPONSE BUDGET — a tool result too big for the client's context is not an
 * answer, it's a file path. Asking this server for the whole catalog returned
 * ~93k characters of full-paragraph descriptions, which the client spilled to
 * disk; the agent then had to re-read it in chunks, costing more than opening
 * `registry.json` would have. That defeats the point of this layer.
 *
 * So a search response is projected to one of three widths and, if it still
 * doesn't fit, degrades a step at a time and SAYS SO. Same principle as
 * `truncated`: never hand back a quietly reduced answer.
 *
 * The budget is in characters, deliberately well under any client's cap —
 * a tool that fits everywhere beats one tuned to today's limit.
 */
const RESPONSE_BUDGET = 40_000

/**
 * The EXACT bytes `callTool` puts on the wire. Every budget check MUST measure
 * with this, never a bare `JSON.stringify` — the wire form is pretty-printed,
 * which runs ~30% larger than the compact form. Measuring compact while
 * shipping pretty meant the guards passed at 52,809 real characters against a
 * 40,000 budget, and `check:mcp-contract` printed "fits" the whole time.
 */
const wireSize = (value) => JSON.stringify(value, null, 2).length

/** Enough to tell two items apart; not the whole doc paragraph. */
function clip(text, max = 160) {
  const s = (text ?? "").toString().trim()
  if (!s) return undefined
  if (s.length <= max) return s
  // Prefer a sentence boundary when one lands near the cap — a clean stop reads
  // as a summary; a mid-word cut reads as corruption.
  const stop = s.slice(0, max + 40).search(/\.\s/)
  return stop > 60 ? s.slice(0, stop + 1) : `${s.slice(0, max).trimEnd()}…`
}

/**
 * `names` answers "does something like this exist?", `compact` answers "which
 * one do I want?", `full` is the whole registry record. Full detail is what
 * `get_component` is for — search should hand you candidates, not documentation.
 */
const PROJECTIONS = {
  names: (i) => ({
    name: i.name,
    tier: i.tier,
    origin: i.origin,
    path: i.path,
  }),
  compact: (i) => ({
    name: i.name,
    tier: i.tier,
    title: i.title,
    description: clip(i.description),
    origin: i.origin,
    status: i.status,
    path: i.path,
    surface: i.surface,
    hasDocs: i.hasDocs,
    usageCount: i.usageCount,
    categories: i.categories,
  }),
  full: (i) => i,
}

/** Widest first — degrading walks down this list. */
const FIELD_WIDTHS = ["full", "compact", "names"]

/**
 * The BATCHED tools (`get_component`, `get_page` with routes) blow the budget a
 * different way: the caller sets the fan-out. All 174 components came to 127k
 * characters, all 51 routes to 69k.
 *
 * Their fix is NOT search's. Someone who named an item wants that item's full
 * record — clipping it is answering a different question. So serve whole
 * records until the budget fills and hand back the rest as names to ask for
 * next, which is a request the agent can actually act on.
 */
function fitBatch(records, keyOf, assemble) {
  // Measure the ASSEMBLED response, never a sum of parts. Summing per-record
  // sizes plus a reserved envelope under-counts twice over: the wire form is
  // pretty-printed, and nesting each record inside an array inside an object
  // adds indentation the standalone measurement never sees. Both the deferred
  // list and `_meta` also grow as records move across. Building and measuring
  // the real thing is the only accounting that can't drift.
  const build = (n) =>
    assemble(records.slice(0, n), records.slice(n).map(keyOf))

  let n = records.length
  let out = build(n)
  // Converge by the overshoot ratio rather than one record at a time — 160
  // records over budget would otherwise mean 160 rebuilds.
  while (n > 1 && wireSize(out) > RESPONSE_BUDGET) {
    const ratio = wireSize(out) / RESPONSE_BUDGET
    n = Math.max(1, Math.min(n - 1, Math.floor(n / ratio)))
    out = build(n)
  }
  // Always serve at least one whole record: a single item over budget is a
  // real answer, while an empty list plus "ask again" is a loop.
  return out
}

export const TOOLS = {
  get_overview: {
    description:
      "Orientation for this project: what product it is, how this Synclair clone is wired, and what " +
      "the hub knows so far (counts + freshness per section). Call this FIRST on an unfamiliar repo " +
      "instead of reading AGENTS.md and the data files.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    run() {
      const project = scanProject()
      const items = allItems()
      const pages = pagesMap()
      const sys = readSystemMapJson()
      const knowledge = scanKnowledgeSources()
      const hygiene = readHostHygieneArtifact()

      const byTier = (t, origin) =>
        items.filter((i) => i.tier === t && (!origin || i.origin === origin))
          .length
      const pageNodes = pages?.pages ?? pages?.nodes ?? []

      return {
        product: { name: project.name, tagline: project.tagline },
        /**
         * Split by origin. A single `components: 77` silently summed Synclair's
         * own chrome with the product's catalogue, so it disagreed with the hub
         * (which shows 56 for the host surface) on a number labelled the same
         * way. In companion mode those are different questions and an agent
         * almost always means the host's.
         */
        library: {
          total: items.length,
          host: {
            components: byTier("component", "host"),
            blocks: byTier("block", "host"),
            templates: byTier("template", "host"),
          },
          native: {
            components: byTier("component", "native"),
            blocks: byTier("block", "native"),
            templates: byTier("template", "native"),
          },
        },
        pages: {
          count: pageNodes.length,
          repo: pages?.repo?.name ?? null,
          freshness: pages ? rollUpPages(pages) : "unanchored",
        },
        system: {
          present: Boolean(sys?.repo),
          areas: sys?.areas?.length ?? 0,
          api: sys?.api?.length ?? 0,
          data: sys?.data?.length ?? 0,
          freshness: syncState(sys?.provenance, sys?.repo?.root),
        },
        knowledge: { sources: knowledge.length },
        hygiene: hygiene?.totals ? { findings: hygiene.totals.findings } : null,
        _meta: meta({ unreadable: libraryUnreadable() ?? undefined }),
      }
    },
  },

  search_library: {
    description:
      "Search this project's component library — components, blocks, and templates, both Synclair-native " +
      "and cataloged HOST components. Returns matches with tier, origin, status and path. Use before " +
      "building any UI: the invention gate requires checking what already exists. Descriptions come " +
      "back clipped; call get_component for an item's full record.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Free text matched against name, title, description.",
        },
        tier: { type: "string", enum: ["component", "block", "template"] },
        origin: { type: "string", enum: ["native", "host"] },
        limit: { type: "number", description: "Max results (default 40)." },
        fields: {
          type: "string",
          enum: ["names", "compact", "full"],
          description:
            "Detail per item. 'names' (name/tier/origin/path) for a wide inventory sweep, 'compact' " +
            "(default: adds title, clipped description, status, usage) to pick a candidate, 'full' " +
            "for whole registry records — 'full' only pays off on a narrow result set.",
        },
      },
      additionalProperties: false,
    },
    run(args = {}) {
      const q = lower(args.query)
      let items = allItems()
      if (args.tier) items = items.filter((i) => i.tier === args.tier)
      if (args.origin) items = items.filter((i) => i.origin === args.origin)
      if (q) {
        /**
         * Rank, don't just filter. A flat substring match returned Synclair's
         * own `pill-toggle` above the host's `button` for the query "button",
         * because it matched on a description. In companion mode that is the
         * wrong answer twice over: the match is weaker AND it's the hub's own
         * chrome, when someone building the product means the PRODUCT's button.
         *
         * Whoever reads only the first few results should get the right ones.
         */
        const hasHost = items.some((i) => i.origin === "host")
        const score = (i) => {
          const name = lower(i.name)
          let s = 0
          if (name === q) s = 100
          else if (name.startsWith(q)) s = 80
          else if (name.includes(q)) s = 60
          else if (lower(i.title).includes(q)) s = 40
          else if ((i.categories ?? []).some((c) => lower(c).includes(q)))
            s = 30
          else if (lower(i.description).includes(q)) s = 20
          // All the words, not the phrase — ranked under every phrase hit above.
          else if (hit([i.name, i.title, i.description, ...(i.categories ?? [])], q).all) s = 10
          if (s === 0) return 0
          // In a companion clone the product's catalogue is what's being asked
          // about; the hub's own components are a fallback, not the lead.
          if (hasHost && i.origin === "host") s += 10
          // Something the app actually renders beats something it doesn't.
          if ((i.usageCount ?? 0) > 0) s += 5
          return s
        }
        items = items
          .map((i) => ({ i, s: score(i) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s || a.i.name.localeCompare(b.i.name))
          .map((x) => x.i)
      }
      // Clamp: a negative limit produced `returned: -5` and a `truncated`
      // larger than `total`, and disabled the halving fallback entirely.
      const limit = clampLimit(args.limit, 40)
      const total = items.length

      // `Object.hasOwn`, not a truthiness test: a bare `PROJECTIONS[x]` reaches
      // the prototype, so `fields: "__proto__"` resolved to an object and
      // `fields: "valueOf"` to a function, and both were then used as the item
      // mapper — the tool answered "search_library failed" for an argument the
      // schema says is optional.
      const asked = Object.hasOwn(PROJECTIONS, String(args.fields)) ? args.fields : "compact"
      const build = (width, count) => ({
        query: args.query ?? null,
        total,
        returned: Math.min(total, count),
        fields: width,
        items: items.slice(0, count).map(PROJECTIONS[width]),
        // Never silently truncate — say what was dropped.
        truncated: total > count ? total - count : 0,
        // A parse failure must never read as "nothing matched": an agent that
        // believes the library is empty invents a component instead.
        _meta: meta({ unreadable: libraryUnreadable() ?? undefined }),
      })

      // Fit the budget: narrow the projection first (all items, less detail per
      // item), and only then drop items. Someone sweeping the catalog wants to
      // know WHAT exists more than they want prose about the first thirty.
      let width = asked
      let count = limit
      let out = build(width, count)
      const fits = (r) => wireSize(r) <= RESPONSE_BUDGET

      for (const next of FIELD_WIDTHS.slice(FIELD_WIDTHS.indexOf(asked) + 1)) {
        if (fits(out)) break
        width = next
        out = build(width, count)
      }
      while (!fits(out) && count > 1) {
        count = Math.floor(count / 2)
        out = build(width, count)
      }

      if (width !== asked) {
        out._meta.degraded = {
          from: asked,
          to: width,
          why: `${asked} exceeded the ${RESPONSE_BUDGET}-character response budget`,
          hint: "narrow with query/tier/origin, or call get_component for the items you care about",
        }
      }
      return out
    },
  },

  get_component: {
    description:
      "Full record for one or more library items: registry entry, docs status, source path, and which " +
      "pages compose it. Batch several names in one call rather than calling repeatedly.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
          description: "Item name, or an array of names.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    run(args = {}) {
      const names = Array.isArray(args.name) ? args.name : [args.name]
      const items = allItems()
      const pages = pagesMap()
      const pageNodes = pages?.pages ?? pages?.nodes ?? []

      const found = names.flatMap((n) => {
        /**
         * A name can legitimately exist TWICE — once as a Synclair-native
         * component and once in the host catalog (`page-header` does exactly
         * this on a real clone). Returning only the first match handed back the
         * hub's own component when the agent meant the product's, with nothing
         * to indicate the other existed. Return both and let `origin` decide.
         */
        const matches = items.filter((i) => lower(i.name) === lower(n))
        if (matches.length === 0) {
          const near = items
            .filter(
              (i) =>
                lower(i.name).includes(lower(n)) ||
                lower(n).includes(lower(i.name))
            )
            .slice(0, 5)
            .map((i) => i.name)
          return [{ name: n, found: false, didYouMean: near }]
        }
        return matches.map((item) => {
          const usedBy = pageNodes
            .filter((p) =>
              (p.items ?? []).some((u) => lower(u.name) === lower(item.name))
            )
            .map((p) => ({ route: p.route ?? p.path, name: p.title }))
          return {
            ...item,
            found: true,
            usedByPages: usedBy,
            usedByCount: usedBy.length,
            // Say so explicitly rather than leaving the agent to notice two
            // records came back for one name.
            ...(matches.length > 1
              ? {
                  ambiguous: `${matches.length} items share this name — see \`origin\``,
                }
              : {}),
          }
        })
      })

      return fitBatch(
        found,
        (r) => r.name,
        (kept, deferred) => ({
          items: kept,
          ...(deferred.length
            ? {
                deferred,
                hint:
                  `${deferred.length} more matched but would exceed the response budget — ` +
                  "ask for them in a follow-up call, or use search_library for an overview.",
              }
            : {}),
          _meta: meta({ unreadable: libraryUnreadable() ?? undefined }),
        })
      )
    },
  },

  get_foundation: {
    description:
      "This project's design tokens and the styling rules that go with them — the semantic vocabulary to " +
      "use INSTEAD of raw hex/px values. Consult before writing any styling; raw values are lint-enforced " +
      "failures in this codebase.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Filter tokens by name or usage, e.g. 'muted', 'border'.",
        },
      },
      additionalProperties: false,
    },
    run(args = {}) {
      const { tokens, unreadable, scope, hubTokens, note } = scanTokens()
      const q = lower(args.query)
      const filtered = q ? tokens.filter((t) => hit([t.name, t.usage], q).all) : tokens
      return {
        rules: [
          "Reach for a SEMANTIC token first (primary, muted, border…); drop to the brand ramp only for accents semantics can't cover.",
          "No raw hex or px values — this is lint-enforced. The error message names the fix; do not eslint-disable around it.",
          "Never hardcode '/synclair' paths — link via the synclair() helper in lib/system/routes.ts.",
        ],
        scope,
        total: tokens.length,
        returned: filtered.length,
        tokens: filtered,
        ...(note ? { note } : {}),
        // Named, not merged — an agent must never mistake hub chrome for the
        // product's palette, which is the bug this shape exists to prevent.
        ...(hubTokens?.length
          ? {
              hubTokens: {
                count: hubTokens.length,
                note: "Synclair's own chrome — styles the hub, not the app.",
              },
            }
          : {}),
        unreadable: unreadable ?? null,
        _meta: meta({
          note: "values are documented light-mode; the theme renders live from app/globals.css",
        }),
      }
    },
  },

  get_page: {
    description:
      "The app's sitemap, or the record for specific routes: what each view is, its source files, the " +
      "components/blocks/templates it composes, its navigation edges, and whether its source changed " +
      "since the map was generated. Batch several routes in one call.",
    inputSchema: {
      type: "object",
      properties: {
        route: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
          description: "Route path(s). Omit to list every page.",
        },
        surface: {
          type: "string",
          description:
            "Narrow to one frontend when the same route exists on several (multi-surface maps).",
        },
      },
      additionalProperties: false,
    },
    run(args = {}) {
      const map = pagesMap()
      if (!map) {
        return {
          pages: [],
          empty: true,
          hint: "No pages map yet — generate it with the `pages-map` skill.",
          _meta: meta(),
        }
      }
      const nodes = map.pages ?? map.nodes ?? []
      const withFreshness = (p) => ({
        route: p.route ?? p.path,
        // `PageNode` calls these `title` and `links` (lib/system/pages-map.ts).
        // Reading `name`/`linksTo` returned undefined for every page.
        name: p.title,
        summary: p.summary,
        auth: p.auth,
        // Which frontend serves this route. Multi-surface maps carry the same
        // route on different apps (/find-work exists on two of them), and a
        // record that doesn't say whose it is misleads — found by consuming
        // this tool against a three-surface map.
        surface: p.surface,
        sourceFiles: p.sourceFiles,
        composes: p.items,
        linksTo: p.links,
        freshness: syncState(
          { sourceHash: p.sourceHash, sourceFiles: p.sourceFiles },
          map.repo?.root
        ),
      })

      if (args.route) {
        const routes = Array.isArray(args.route) ? args.route : [args.route]
        const picked = routes.flatMap((r) => {
          // ALL surfaces' pages for the route, not the first hit — a colliding
          // route returns one record per surface, optionally narrowed.
          const matches = nodes.filter(
            (p) =>
              (p.route ?? p.path) === r &&
              (!args.surface || p.surface === args.surface)
          )
          if (matches.length) return matches.map(withFreshness)
          // A bare {found:false} strands the caller (the C1 drill asked for
          // /my-applications when the view lives at /roster and got nothing to
          // go on). Hand back the nearest real routes by shared path tokens.
          const tokens = lower(r).split(/[^a-z0-9]+/).filter(Boolean)
          const closest = nodes
            .map((p) => {
              const hay = lower(`${p.route ?? p.path} ${p.title ?? ""} ${p.summary ?? ""}`)
              return { route: p.route ?? p.path, score: tokens.filter((t) => hay.includes(t)).length }
            })
            .filter((c) => c.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map((c) => c.route)
          return [
            {
              route: r,
              found: false,
              ...(closest.length ? { closest } : {}),
              hint: closest.length
                ? "No page at this route — `closest` lists the likeliest matches; search_all also spans titles and summaries."
                : "No page at this route — omit `route` for the sitemap, or search_all to search titles and summaries.",
            },
          ]
        })
        return fitBatch(
          picked,
          (p) => p.route,
          (kept, deferred) => ({
            pages: kept,
            ...(deferred.length
              ? {
                  deferred,
                  hint:
                    `${deferred.length} more route(s) would exceed the response budget — ` +
                    "ask for them in a follow-up call, or omit `route` for the sitemap digest.",
                }
              : {}),
            _meta: meta({ repo: map.repo?.name }),
          })
        )
      }

      // Listing mode stays a digest — routes and names, not every node whole.
      return {
        repo: map.repo?.name,
        total: nodes.length,
        pages: nodes.map((p) => ({
          route: p.route ?? p.path,
          name: p.title,
          composes: (p.items ?? []).length,
          freshness: syncState(
            { sourceHash: p.sourceHash, sourceFiles: p.sourceFiles },
            map.repo?.root
          ),
        })),
        _meta: meta({ hint: "call with `route` for a page's full record" }),
      }
    },
  },

  get_system: {
    description:
      "What this codebase consists of BEYOND the UI — areas/modules, API surface, data model, background " +
      "jobs, integrations — from the System Map. Use to orient in the backend without reading source. " +
      "Returns a digest with `source` paths for anything you need to go deeper on.",
    inputSchema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          enum: ["areas", "api", "data", "jobs", "integrations", "overview"],
          description: "Return just one section. Omit for the whole digest.",
        },
        query: {
          type: "string",
          description: "Filter entries by name/path/summary.",
        },
      },
      additionalProperties: false,
    },
    run(args = {}) {
      const map = readSystemMapJson()
      if (!map || map.__unreadable || !map.repo) {
        return {
          empty: true,
          hint: map?.__unreadable
            ? `data/system-map.json is corrupt: ${map.__unreadable}`
            : "No system map yet — generate it with the `codebase-map` skill.",
          _meta: meta(),
        }
      }
      const q = lower(args.query)
      const match = (e) => !q || hit([e.name, e.path, e.summary, e.method], q).all

      const sections = {
        overview:
          map.overviewSections ??
          (map.overview ? [{ body: map.overview }] : []),
        areas: (map.areas ?? []).filter(match),
        api: (map.api ?? []).filter(match),
        data: (map.data ?? []).filter(match),
        jobs: (map.jobs ?? []).filter(match),
        integrations: (map.integrations ?? []).filter(match),
      }

      const base = {
        repo: map.repo?.name,
        stack: map.stackFacts ?? map.stack,
        freshness: syncState(map.provenance, map.repo?.root),
      }

      // `sections` is a plain object, so an unknown `section` reached its
      // PROTOTYPE — `section: "__proto__"` handed back Object.prototype and
      // `section: "bogus"` produced `{bogus: undefined}`, which serialises to a
      // response with no sections at all. An agent reads that as "the map has
      // nothing", which is the one answer this tool must never give by accident.
      const named = args.section != null ? String(args.section) : null
      const known = named !== null && Object.hasOwn(sections, named)

      // Asking for one section (or filtering) means you want the detail.
      if (named || q) {
        if (named && !known) {
          return {
            ...base,
            error: `unknown section "${named}"`,
            sections: Object.keys(sections),
            _meta: meta({ generatedAt: map.repo?.digestedAt, commit: map.repo?.commit }),
          }
        }
        return {
          ...base,
          ...(known ? { [named]: sections[named] } : sections),
          _meta: meta({
            generatedAt: map.repo?.digestedAt,
            commit: map.repo?.commit,
          }),
        }
      }

      /**
       * Default is a DIGEST, not the whole map. Returning every section in full
       * made this tool LARGER than reading data/system-map.json outright (−24%
       * on a real 32KB map) — a tool that costs more than the file it replaces
       * is worse than no tool. Names and counts orient; `section` fetches depth.
       */
      const names = (list, key = "name") =>
        list.map((e) => e[key]).filter(Boolean)
      return {
        ...base,
        overview: sections.overview,
        areas: { count: sections.areas.length, names: names(sections.areas) },
        api: {
          count: sections.api.length,
          paths: sections.api
            .slice(0, 40)
            .map((e) => `${e.method ?? "—"} ${e.path}`),
          truncated: Math.max(0, sections.api.length - 40),
        },
        data: { count: sections.data.length, entities: names(sections.data) },
        jobs: { count: sections.jobs.length, names: names(sections.jobs) },
        integrations: {
          count: sections.integrations.length,
          names: names(sections.integrations),
        },
        _meta: meta({
          generatedAt: map.repo?.digestedAt,
          commit: map.repo?.commit,
          hint: "digest — call with `section` (areas|api|data|jobs|integrations) or `query` for detail",
        }),
      }
    },
  },

  get_knowledge: {
    description:
      "This project's knowledge sources — specs, PRDs, Figma files, decks — and the distilled digest for " +
      "each. Returns the manifest and where the digest lives; read the DIGEST before digging into a raw " +
      "source.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Exact source id from a previous listing — returns just that entry.",
        },
        topic: {
          type: "string",
          description: "Filter by id, title, area, or kind.",
        },
      },
      additionalProperties: false,
    },
    run(args = {}) {
      const sources = scanKnowledgeSources()
      // The listing prints an `id` on every row, so the id must be a usable
      // handle — before this, passing one back (as `id` OR as `topic`) was
      // silently ignored and the caller got the full manifest again.
      const id = typeof args.id === "string" ? args.id.trim() : ""
      if (id) {
        const one = sources.filter((s) => s.id === id)
        return {
          total: sources.length,
          returned: one.length,
          sources: one,
          hint: one.length
            ? "Read `distilledInto` first. The raw source is at `path` (repo-relative, from the repo root) when in-repo, else `url` — dig raw via the prd-retriever agent only if the digest is insufficient."
            : `No source with id "${id}" — call get_knowledge with no args (or a topic) to list what exists.`,
          _meta: meta(),
        }
      }
      const q = lower(args.topic)
      const filtered = q
        ? sources.filter((s) => hit([s.id, s.title, s.area, s.kind], q).all)
        : sources
      return {
        total: sources.length,
        returned: filtered.length,
        sources: filtered,
        hint: filtered.length
          ? "Read `distilledInto` first. The raw source is at `path` (repo-relative, from the repo root) when in-repo, else `url` — dig raw via the prd-retriever agent only if the digest is insufficient."
          : "No knowledge sources registered yet — see lib/system/knowledge/sources.ts.",
        _meta: meta(),
      }
    },
  },

  search_all: {
    description:
      "One search across EVERYTHING the hub knows — the component library, the app's pages, the system " +
      "map (endpoints, data model, areas), and the knowledge sources. Use when you don't know which " +
      "corpus holds the answer, or the term could live anywhere (a feature name, a screen, an endpoint, " +
      "a spec). The per-corpus tools require knowing the filing vocabulary; this one doesn't. Returns " +
      "grouped matches, each naming the tool that holds its full record.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Free text — feature, screen, endpoint, spec, component…",
        },
        limit: {
          type: "number",
          description: "Max matches per corpus (default 8).",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    run(args = {}) {
      const q = lower(args.query).trim()
      if (!q) {
        return {
          hint: "Pass `query` — e.g. a feature name, screen, endpoint, or spec topic.",
          _meta: meta(),
        }
      }
      const asked = clampLimit(args.limit, 8)

      /**
       * One scorer for every corpus: the entry's NAME-LIKE field ranks above
       * prose matches, so "profile" surfaces `/account` (summary match) below a
       * literal `ProfileTab` — the same ranking rule search_library uses.
       */
      const scored = (entries, nameOf, textsOf) =>
        entries
          .map((e) => {
            const name = lower(nameOf(e))
            let s = 0
            if (name === q) s = 100
            else if (name.startsWith(q)) s = 80
            else if (name.includes(q)) s = 60
            else if (textsOf(e).some((t) => lower(t).includes(q))) s = 20
            // Below every phrase match, never instead of one: a record that
            // carries all the words but not the phrase is a real answer, and it
            // was the difference between eight results and none.
            else if (hit([nameOf(e), ...textsOf(e)], q).all) s = 10
            return { e, s }
          })
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .map((x) => x.e)

      const lib = scored(
        allItems(),
        (i) => i.name,
        (i) => [i.title, i.description, ...(i.categories ?? [])]
      )

      const pmap = pagesMap()
      const pageNodes = pmap?.pages ?? pmap?.nodes ?? []
      const pages = scored(
        pageNodes,
        (p) => `${p.route ?? p.path} ${p.title ?? ""}`,
        (p) => [p.summary]
      )

      const sys = readSystemMapJson()
      const sysEntries =
        !sys || sys.__unreadable
          ? []
          : [
              ...(sys.api ?? []).map((e) => ({ ...e, section: "api" })),
              ...(sys.data ?? []).map((e) => ({ ...e, section: "data" })),
              ...(sys.areas ?? []).map((e) => ({ ...e, section: "areas" })),
            ]
      const system = scored(
        sysEntries,
        (e) => e.name ?? e.path ?? "",
        (e) => [e.summary, e.path]
      )

      const knowledge = scored(
        scanKnowledgeSources(),
        (s) => s.title,
        (s) => [s.area, s.kind, s.id]
      )

      const group = (list, project, followUp, limit) => ({
        total: list.length,
        items: list.slice(0, limit).map(project),
        ...(list.length > limit ? { truncated: list.length - limit } : {}),
        followUp,
      })

      const build = (limit) => ({
        query: args.query,
        groups: {
          library: group(
            lib,
            (i) => ({
              name: i.name,
              tier: i.tier,
              origin: i.origin,
              description: clip(i.description, 100),
            }),
            "get_component <name> for the full record",
            limit
          ),
          pages: group(
            pages,
            (p) => ({
              route: p.route ?? p.path,
              name: p.title,
              summary: clip(p.summary, 100),
            }),
            "get_page <route> for sources, composition, freshness",
            limit
          ),
          system: group(
            system,
            (e) => ({
              section: e.section,
              name: e.name,
              ...(e.method ? { method: e.method } : {}),
              ...(e.path ? { path: e.path } : {}),
              summary: clip(e.summary, 100),
            }),
            "get_system with `query` or `section` for detail",
            limit
          ),
          knowledge: group(
            knowledge,
            (s) => ({
              id: s.id,
              title: s.title,
              kind: s.kind,
              area: s.area,
              distilledInto: s.distilledInto,
            }),
            "get_knowledge <topic>; read the digest at `distilledInto`",
            limit
          ),
        },
        _meta: meta({ unreadable: libraryUnreadable() ?? undefined }),
      })

      // Same budget discipline as search_library: shrink per-corpus results
      // until the response fits, and say so rather than shipping something the
      // client spills to disk. Unbounded, `limit: 200` returned ~99k chars.
      // Reserve headroom for the `degraded` block this loop may append —
      // measuring without it landed a "fitted" response 130 characters OVER
      // the budget it had just enforced.
      const DEGRADED_NOTE = 320
      let limit = asked
      let out = build(limit)
      while (wireSize(out) > RESPONSE_BUDGET - DEGRADED_NOTE && limit > 1) {
        limit = Math.floor(limit / 2)
        out = build(limit)
      }
      if (limit !== asked) {
        out._meta.degraded = {
          from: asked,
          to: limit,
          why: `${asked} per corpus exceeded the ${RESPONSE_BUDGET}-character response budget`,
          hint: "narrow the query, or use the per-corpus tool for the group you care about",
        }
      }

      const empty = Object.values(out.groups).every((g) => g.total === 0)
      if (empty) {
        out.hint =
          "Nothing matched. Try a broader or different term — corpora file things under their own " +
          "vocabulary (e.g. 'account' where you might say 'profile')."
      }
      return out
    },
  },

  whats_new: {
    description:
      "What changed recently, in product language — the narrated weekly updates written from real repo " +
      "history: a headline per week plus per-theme summaries. Use for 'what's new', 'what shipped', " +
      "'catch me up', or orienting after time away. This is the stakeholder narrative, not a commit log.",
    inputSchema: {
      type: "object",
      properties: {
        weeks: {
          type: "number",
          description: "How many weekly buckets, newest first (default 1).",
        },
      },
      additionalProperties: false,
    },
    run(args = {}) {
      const data = readJson("data/dashboard-updates.json")
      if (!data || data.__unreadable || !Array.isArray(data.buckets)) {
        return {
          weeks: [],
          empty: true,
          hint: data?.__unreadable
            ? `data/dashboard-updates.json is corrupt: ${data.__unreadable}`
            : "No narrated updates written yet — the `dashboard-update` skill generates them.",
          _meta: meta(),
        }
      }
      const n = Number.isFinite(args.weeks) && args.weeks > 0 ? args.weeks : 1
      const buckets = [...data.buckets]
        .filter((b) => b && typeof b === "object")
        .filter(
          (b) =>
            b.headline || (Array.isArray(b.updates) ? b.updates : []).length
        )
        .sort((a, b) => (a.from < b.from ? 1 : -1))
        .slice(0, n)
        .map((b) => ({
          id: b.id,
          from: b.from,
          to: b.to,
          headline: b.headline,
          updates: (Array.isArray(b.updates) ? b.updates : [])
            .filter((u) => u && typeof u === "object")
            .map((u) => ({ theme: u.theme, summary: u.summary })),
        }))

      return fitBatch(
        buckets,
        (b) => b.id,
        (kept, deferred) => ({
          asOf: data.writtenAt,
          weeks: kept,
          ...(deferred.length
            ? {
                deferred,
                hint: "More weeks exist than fit the response budget — ask for them by lowering `weeks` per call.",
              }
            : {}),
          _meta: meta({ anchoredTip: data.anchoredTip }),
        })
      )
    },
  },
}

/** Any stale page makes the map stale — a 95%-current map still needs a look. */
function rollUpPages(map) {
  const nodes = map.pages ?? map.nodes ?? []
  const states = nodes.map((p) =>
    syncState(
      { sourceHash: p.sourceHash, sourceFiles: p.sourceFiles },
      map.repo?.root
    )
  )
  if (states.includes("stale")) return "stale"
  if (states.includes("fresh")) return "fresh"
  return "unanchored"
}

// ------------------------------------------------------------------ protocol

/** Core tools plus tools from enabled extensions — extension state is read per
 * call, so a Settings toggle applies to agents without a server restart. */
export const allTools = () => ({ ...TOOLS, ...extensionTools(HUB_ROOT) })

export const toolList = () =>
  Object.entries(allTools()).map(([name, t]) => ({
    name,
    description: t.description,
    inputSchema: t.inputSchema,
  }))

export async function callTool(name, args) {
  const tool = allTools()[name]
  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    }
  }
  try {
    const result = await tool.run(args ?? {})
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    }
  } catch (e) {
    // A tool failure must never take the server down — the agent gets the error.
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `${name} failed: ${e instanceof Error ? e.message : e}`,
        },
      ],
    }
  }
}

export async function handle(msg) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    return {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32600,
        message: "Invalid Request: expected a JSON-RPC object",
      },
    }
  }
  const { id, method, params } = msg

  // A notification (no id) NEVER gets a reply — checked FIRST, because a
  // response object without an `id` member isn't valid JSON-RPC, and every
  // method branch below was happily producing one.
  if (id === undefined || id === null) return null

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion ?? DEFAULT_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      },
    }
  }
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: toolList() } }
  }
  if (method === "tools/call") {
    return {
      jsonrpc: "2.0",
      id,
      result: await callTool(params?.name, params?.arguments),
    }
  }
  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} }
  }
  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  }
}
