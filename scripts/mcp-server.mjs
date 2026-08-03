#!/usr/bin/env node
/**
 * SYNCLAIR MCP SERVER — the agent-facing view of the hub's data.
 *
 * The hub at `/synclair` is the HUMAN view of Synclair's knowledge. This is the
 * agent view of the same data: an MCP server over stdio that answers shaped
 * questions instead of making an agent open whole files.
 *
 * Three properties are deliberate:
 *
 *   NO HUB REQUIRED — this reads `registry.json` and `data/*.json` off disk. It
 *   does not boot Next, bind a port, or need the dev server on 4100. Starting a
 *   server here can never collide with the hub.
 *
 *   NO DEPENDENCIES — raw JSON-RPC over newline-delimited stdio, no SDK. A
 *   cloned foundation must work in any clone with zero install, and MCP's stdio
 *   transport is small enough that a dependency would cost more than it saves.
 *
 *   LOCATION-ANCHORED, NOT CWD-ANCHORED — the hub root is derived from this
 *   file's own path, so the server works identically whether the agent's cwd is
 *   the hub (embedded topology) or the host repo beside it (watcher topology).
 *   This is what makes one `.mcp.json` entry correct in both modes.
 *
 * Tools are TASK-SHAPED, not one-per-file: six of them, batched where it
 * matters, each returning the slice an agent asked for plus a `_meta` block
 * carrying freshness. Measure the difference with `npm run measure:agent-cost`.
 *
 *   node scripts/mcp-server.mjs           # serve (stdio; for an MCP client)
 *   node scripts/mcp-server.mjs --probe   # self-test: list tools + call each
 */

import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/** <hubRoot>/scripts/mcp-server.mjs → <hubRoot>. Never `process.cwd()`. */
const HUB_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const SERVER_INFO = { name: "synclair", version: "0.1.0" }
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
const baseDirFor = (repoRoot) => (repoRoot ? path.join(HUB_ROOT, repoRoot) : HUB_ROOT)

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
  const re = /\{\s*name:\s*"([^"]+)",\s*bg:\s*"([^"]*)",\s*value:\s*"([^"]*)",\s*usage:\s*"([^"]*)"/g
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
        "These are the PRODUCT's brand values (lib/system/seed/brand-ramps.ts) — use them. "
        + "`hubTokens` is Synclair's own chrome and styles the hub, not the app.",
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
      distilledInto: pick("distilledInto"),
    })
  }
  return out
}

// -------------------------------------------------------------- data loaders

const lower = (s) => (s ?? "").toString().toLowerCase()

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
  const map = readJson("data/pages-map.json")
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
function meta(extra = {}) {
  const setup = readJson("data/setup.json")
  return {
    source: "synclair",
    hubRoot: HUB_ROOT,
    setupMode: setup?.mode ?? null,
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
  names: (i) => ({ name: i.name, tier: i.tier, origin: i.origin, path: i.path }),
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
function fitBatch(records, keyOf) {
  // The envelope isn't free: 131 deferred names cost ~2k on their own, which is
  // how the first cut of this landed 1,479 characters OVER the budget it was
  // enforcing. Reserve the worst case (every record deferred) plus the hint and
  // `_meta`. Over-reserving when little is deferred errs the safe way.
  const envelope = JSON.stringify(records.map(keyOf)).length + 400
  const ceiling = RESPONSE_BUDGET - envelope

  const kept = []
  let size = 0
  for (const r of records) {
    const len = JSON.stringify(r).length + 1
    // Always serve at least one whole record: a single item over budget is a
    // real answer, while an empty list plus "ask again" is a loop.
    if (kept.length && size + len > ceiling) break
    kept.push(r)
    size += len
  }
  return { kept, deferred: records.slice(kept.length).map(keyOf) }
}

const TOOLS = {
  get_overview: {
    description:
      "Orientation for this project: what product it is, how this Synclair clone is wired, and what "
      + "the hub knows so far (counts + freshness per section). Call this FIRST on an unfamiliar repo "
      + "instead of reading AGENTS.md and the data files.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run() {
      const project = scanProject()
      const items = allItems()
      const pages = pagesMap()
      const sys = readJson("data/system-map.json")
      const knowledge = scanKnowledgeSources()
      const hygiene = readJson("data/host-hygiene.json")

      const byTier = (t, origin) =>
        items.filter((i) => i.tier === t && (!origin || i.origin === origin)).length
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
        _meta: meta(),
      }
    },
  },

  search_library: {
    description:
      "Search this project's component library — components, blocks, and templates, both Synclair-native "
      + "and cataloged HOST components. Returns matches with tier, origin, status and path. Use before "
      + "building any UI: the invention gate requires checking what already exists. Descriptions come "
      + "back clipped; call get_component for an item's full record.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free text matched against name, title, description." },
        tier: { type: "string", enum: ["component", "block", "template"] },
        origin: { type: "string", enum: ["native", "host"] },
        limit: { type: "number", description: "Max results (default 40)." },
        fields: {
          type: "string",
          enum: ["names", "compact", "full"],
          description:
            "Detail per item. 'names' (name/tier/origin/path) for a wide inventory sweep, 'compact' "
            + "(default: adds title, clipped description, status, usage) to pick a candidate, 'full' "
            + "for whole registry records — 'full' only pays off on a narrow result set.",
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
          else if ((i.categories ?? []).some((c) => lower(c).includes(q))) s = 30
          else if (lower(i.description).includes(q)) s = 20
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
      const limit = Number.isFinite(args.limit) ? args.limit : 40
      const total = items.length

      const asked = PROJECTIONS[args.fields] ? args.fields : "compact"
      const build = (width, count) => ({
        query: args.query ?? null,
        total,
        returned: Math.min(total, count),
        fields: width,
        items: items.slice(0, count).map(PROJECTIONS[width]),
        // Never silently truncate — say what was dropped.
        truncated: total > count ? total - count : 0,
        _meta: meta(),
      })

      // Fit the budget: narrow the projection first (all items, less detail per
      // item), and only then drop items. Someone sweeping the catalog wants to
      // know WHAT exists more than they want prose about the first thirty.
      let width = asked
      let count = limit
      let out = build(width, count)
      const fits = (r) => JSON.stringify(r).length <= RESPONSE_BUDGET

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
      "Full record for one or more library items: registry entry, docs status, source path, and which "
      + "pages compose it. Batch several names in one call rather than calling repeatedly.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
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
            .filter((i) => lower(i.name).includes(lower(n)) || lower(n).includes(lower(i.name)))
            .slice(0, 5)
            .map((i) => i.name)
          return [{ name: n, found: false, didYouMean: near }]
        }
        return matches.map((item) => {
          const usedBy = pageNodes
            .filter((p) => (p.items ?? []).some((u) => lower(u.name) === lower(item.name)))
            .map((p) => ({ route: p.route ?? p.path, name: p.title }))
          return {
            ...item,
            found: true,
            usedByPages: usedBy,
            usedByCount: usedBy.length,
            // Say so explicitly rather than leaving the agent to notice two
            // records came back for one name.
            ...(matches.length > 1
              ? { ambiguous: `${matches.length} items share this name — see \`origin\`` }
              : {}),
          }
        })
      })

      const { kept, deferred } = fitBatch(found, (r) => r.name)
      return {
        items: kept,
        ...(deferred.length
          ? {
              deferred,
              hint:
                `${deferred.length} more matched but would exceed the response budget — `
                + "ask for them in a follow-up call, or use search_library for an overview.",
            }
          : {}),
        _meta: meta(),
      }
    },
  },

  get_foundation: {
    description:
      "This project's design tokens and the styling rules that go with them — the semantic vocabulary to "
      + "use INSTEAD of raw hex/px values. Consult before writing any styling; raw values are lint-enforced "
      + "failures in this codebase.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Filter tokens by name or usage, e.g. 'muted', 'border'." },
      },
      additionalProperties: false,
    },
    run(args = {}) {
      const { tokens, unreadable, scope, hubTokens, note } = scanTokens()
      const q = lower(args.query)
      const filtered = q
        ? tokens.filter((t) => lower(t.name).includes(q) || lower(t.usage).includes(q))
        : tokens
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
        ...(hubTokens?.length ? { hubTokens: { count: hubTokens.length, note: "Synclair's own chrome — styles the hub, not the app." } } : {}),
        unreadable: unreadable ?? null,
        _meta: meta({ note: "values are documented light-mode; the theme renders live from app/globals.css" }),
      }
    },
  },

  get_page: {
    description:
      "The app's sitemap, or the record for specific routes: what each view is, its source files, the "
      + "components/blocks/templates it composes, its navigation edges, and whether its source changed "
      + "since the map was generated. Batch several routes in one call.",
    inputSchema: {
      type: "object",
      properties: {
        route: {
          oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
          description: "Route path(s). Omit to list every page.",
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
        const picked = routes.map((r) => {
          const node = nodes.find((p) => (p.route ?? p.path) === r)
          return node ? withFreshness(node) : { route: r, found: false }
        })
        const { kept, deferred } = fitBatch(picked, (p) => p.route)
        return {
          pages: kept,
          ...(deferred.length
            ? {
                deferred,
                hint:
                  `${deferred.length} more route(s) would exceed the response budget — `
                  + "ask for them in a follow-up call, or omit `route` for the sitemap digest.",
              }
            : {}),
          _meta: meta({ repo: map.repo?.name }),
        }
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
      "What this codebase consists of BEYOND the UI — areas/modules, API surface, data model, background "
      + "jobs, integrations — from the System Map. Use to orient in the backend without reading source. "
      + "Returns a digest with `source` paths for anything you need to go deeper on.",
    inputSchema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          enum: ["areas", "api", "data", "jobs", "integrations", "overview"],
          description: "Return just one section. Omit for the whole digest.",
        },
        query: { type: "string", description: "Filter entries by name/path/summary." },
      },
      additionalProperties: false,
    },
    run(args = {}) {
      const map = readJson("data/system-map.json")
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
      const match = (e) =>
        !q || [e.name, e.path, e.summary, e.method].some((f) => lower(f).includes(q))

      const sections = {
        overview: map.overviewSections ?? (map.overview ? [{ body: map.overview }] : []),
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

      // Asking for one section (or filtering) means you want the detail.
      if (args.section || q) {
        return {
          ...base,
          ...(args.section ? { [args.section]: sections[args.section] } : sections),
          _meta: meta({ generatedAt: map.repo?.digestedAt, commit: map.repo?.commit }),
        }
      }

      /**
       * Default is a DIGEST, not the whole map. Returning every section in full
       * made this tool LARGER than reading data/system-map.json outright (−24%
       * on a real 32KB map) — a tool that costs more than the file it replaces
       * is worse than no tool. Names and counts orient; `section` fetches depth.
       */
      const names = (list, key = "name") => list.map((e) => e[key]).filter(Boolean)
      return {
        ...base,
        overview: sections.overview,
        areas: { count: sections.areas.length, names: names(sections.areas) },
        api: {
          count: sections.api.length,
          paths: sections.api.slice(0, 40).map((e) => `${e.method ?? "—"} ${e.path}`),
          truncated: Math.max(0, sections.api.length - 40),
        },
        data: { count: sections.data.length, entities: names(sections.data) },
        jobs: { count: sections.jobs.length, names: names(sections.jobs) },
        integrations: { count: sections.integrations.length, names: names(sections.integrations) },
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
      "This project's knowledge sources — specs, PRDs, Figma files, decks — and the distilled digest for "
      + "each. Returns the manifest and where the digest lives; read the DIGEST before digging into a raw "
      + "source.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Filter by title, area, or kind." },
      },
      additionalProperties: false,
    },
    run(args = {}) {
      const sources = scanKnowledgeSources()
      const q = lower(args.topic)
      const filtered = q
        ? sources.filter((s) => [s.title, s.area, s.kind].some((f) => lower(f).includes(q)))
        : sources
      return {
        total: sources.length,
        returned: filtered.length,
        sources: filtered,
        hint: filtered.length
          ? "Read `distilledInto` first; dig the raw `url` via the prd-retriever agent only if the digest is insufficient."
          : "No knowledge sources registered yet — see lib/system/knowledge/sources.ts.",
        _meta: meta(),
      }
    },
  },
}

/** Any stale page makes the map stale — a 95%-current map still needs a look. */
function rollUpPages(map) {
  const nodes = map.pages ?? map.nodes ?? []
  const states = nodes.map((p) =>
    syncState({ sourceHash: p.sourceHash, sourceFiles: p.sourceFiles }, map.repo?.root)
  )
  if (states.includes("stale")) return "stale"
  if (states.includes("fresh")) return "fresh"
  return "unanchored"
}

// ------------------------------------------------------------------ protocol

const toolList = () =>
  Object.entries(TOOLS).map(([name, t]) => ({
    name,
    description: t.description,
    inputSchema: t.inputSchema,
  }))

function callTool(name, args) {
  const tool = TOOLS[name]
  if (!tool) {
    return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] }
  }
  try {
    const result = tool.run(args ?? {})
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
  } catch (e) {
    // A tool failure must never take the server down — the agent gets the error.
    return {
      isError: true,
      content: [{ type: "text", text: `${name} failed: ${e instanceof Error ? e.message : e}` }],
    }
  }
}

function handle(msg) {
  const { id, method, params } = msg

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
    return { jsonrpc: "2.0", id, result: callTool(params?.name, params?.arguments) }
  }
  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} }
  }
  // Notifications (no id) never get a reply.
  if (id === undefined || id === null) return null
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } }
}

function serve() {
  let buffer = ""
  process.stdin.setEncoding("utf8")
  process.stdin.on("data", (chunk) => {
    buffer += chunk
    let nl
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      let reply
      try {
        reply = handle(JSON.parse(line))
      } catch (e) {
        reply = {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: `Parse error: ${e instanceof Error ? e.message : e}` },
        }
      }
      if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`)
    }
  })
  // Deliberately NO process.exit() here. stdout is a pipe, and exit() discards
  // whatever is still buffered — which silently TRUNCATES large replies mid-JSON.
  // With stdin ended and no work left, the event loop empties and Node exits on
  // its own, after the writes have flushed.
  process.stdin.on("end", () => {})
}

/** Self-test: exercises every tool without an MCP client. */
function probe() {
  const out = [`hub root: ${HUB_ROOT}`, `tools:    ${Object.keys(TOOLS).length}`, ""]
  for (const name of Object.keys(TOOLS)) {
    const res = callTool(name, name === "get_component" ? { name: "status-badge" } : {})
    const size = res.content[0].text.length
    const state = res.isError ? "ERROR" : "ok"
    out.push(`  ${name.padEnd(16)} ${state.padEnd(6)} ${String(size).padStart(6)} chars`)
    if (res.isError) out.push(`    ${res.content[0].text}`)
  }
  // The point of the layer: what a shaped answer costs vs opening files whole.
  const total = Object.keys(TOOLS).reduce(
    (n, name) => n + callTool(name, name === "get_component" ? { name: "status-badge" } : {}).content[0].text.length,
    0
  )
  out.push(
    "",
    `  all ${Object.keys(TOOLS).length} responses: ${total.toLocaleString()} chars `
      + `(~${Math.round(total / 3.5).toLocaleString()} est. tokens)`
  )
  console.log(out.join("\n"))
}

if (process.argv.includes("--probe")) probe()
else serve()
