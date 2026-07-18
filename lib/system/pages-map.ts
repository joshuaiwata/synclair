import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

import type { MapSurface } from "./system-map"

/**
 * The PAGES MAP: an inventory of the app's actual views/routes — the SITEMAP.
 * Where the component catalog answers "what UI exists" and the System Map
 * answers "what does this system consist of", the pages map answers "what
 * PAGES does this app have, how do they tie together, and which
 * components/blocks/templates does each one compose". Each page also carries a
 * live preview (a real route iframed and scaled down) so the sitemap shows what
 * every view actually looks like, not just its name.
 *
 * Mode-agnostic like the System Map: `repo.root === null` means the map
 * describes THIS repo (Synclair's own hub routes — the dogfood target); a path
 * means it describes the HOST repo (existing-project mode, same convention as
 * `data/external-catalog.json` and `data/system-map.json`).
 *
 * Source of truth is `data/pages-map.json` (SEED — written by the `page-mapper`
 * agent via the `pages-map` skill; blank in the mother repo). A DIGEST, not a
 * mirror: one node per route with the source file for depth. Surfaced for humans
 * at `/synclair/pages`; agents read this file (or the loader) direct. Freshness
 * is per-page (sha256 of each route's source files) so `check:pages` can flag
 * exactly which pages drifted as people add and merge routes.
 */

const MAP_PATH = path.join(process.cwd(), "data", "pages-map.json")

export interface PagesMapRepo {
  /** Project name, e.g. "acme-app". */
  name: string
  /** null = THIS repo; otherwise the host repo root, relative to this repo. */
  root: string | null
  /** Commit hash the digest was generated from — the staleness anchor. */
  commit?: string
  /** ISO date the map was last generated. */
  digestedAt: string
  /**
   * Origin serving the live routes for the preview iframes. Omit for THIS repo
   * (same-origin — the hub serves its own routes). In existing-project mode this
   * is the host dev server, e.g. "http://localhost:3000", so the detail page can
   * frame the real host route.
   */
  previewBaseUrl?: string
}

/** One catalog item (any tier) a page composes. */
export interface PageItemUse {
  /** Catalog item name — the stable id doc routes resolve by (per-surface). */
  name: string
  /** "component" | "block" | "template" — the tier, for grouping + the library link. */
  tier: string
  /** Surface id (multi-surface projects only). */
  surface?: MapSurface
  /** How many times this page composes the item. */
  count?: number
  /**
   * Whether the item is in the library. false = the page uses something not yet
   * cataloged — a coverage signal, flagged in the UI rather than hidden.
   */
  catalogued?: boolean
}

/** One view/route in the app. */
export interface PageNode {
  /** Filesystem-safe slug, unique across the map — the detail-route segment. */
  id: string
  /** URL path the app serves, e.g. "/dashboard/settings". */
  route: string
  /** Human name for the view. */
  title?: string
  /** Repo-relative source file that defines the route. */
  file: string
  /** "page" | "layout" | "dynamic" | "api" — what kind of route node this is. */
  kind?: string
  /** One line: what this view is for. */
  summary?: string
  /** Surface id (multi-surface projects only). */
  surface?: MapSurface
  /** Parent page id, for tree nesting (optional — else derived from `route`). */
  parent?: string
  /** Optional gating note: "public" | "authed" | "admin" | ... */
  auth?: string
  /** True when the route has a dynamic segment (`[id]`, `[...slug]`). */
  dynamic?: boolean
  /** Registered template this route instantiates, if any (catalog name). */
  templateName?: string
  /** Routes this page navigates to — the "how they tie together" edges. */
  links?: string[]
  /** Components/blocks/templates this page composes (all three tiers). */
  items: PageItemUse[]
  /**
   * Route to iframe for the live preview. For same-origin (this repo) it's the
   * route itself; for a host it's `previewBaseUrl` + the route. For dynamic
   * routes, a concrete example path. Absent when there's nothing to frame.
   */
  previewUrl?: string
  /** false when the target can't be framed (API route, host blocks framing) → fall back to docs. */
  previewable?: boolean
  /** Repo-relative files that define this route — the input to `sourceHash`. */
  sourceFiles?: string[]
  /** sha256 over `sourceFiles` at map time — the per-page freshness anchor. */
  sourceHash?: string
}

export interface PagesMap {
  repo: PagesMapRepo | null
  /** "next-app" | "next-pages" | "react-router" | ... — how routes are defined. */
  routerKind?: string
  /**
   * The source file(s) that DEFINE the router, repo-relative. For routers whose
   * routes can't be enumerated from the filesystem (react-router, a config
   * table), `check:pages` can't detect new/removed routes — but it CAN hash
   * these and flag "the router changed, re-run pages-map" when they drift. Set
   * by the page-mapper for non-`next-app` routers; unused for `next-app`
   * (file-scan enumeration works there).
   */
  routerSources?: string[]
  /** Markdown, multi-surface projects: how the frontends divide. */
  surfacesNote?: string
  pages: PageNode[]
  /** Set when the data file exists but couldn't be parsed — the page says so instead of a lying empty state. */
  unreadable?: boolean
}

const EMPTY: PagesMap = {
  repo: null,
  pages: [],
}

/** Coerce to string, or drop — agent-written JSON may put objects/arrays anywhere. */
function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}

/** Coerce to a finite number, or drop. */
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined
}

/** Keep only string entries of an array (used for `links` / `sourceFiles`). */
function strList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.filter((e): e is string => typeof e === "string")
  return out.length ? out : undefined
}

/** Normalize one section: keep only object entries, coerce every field. */
function entries<T>(v: unknown, norm: (e: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
    .map(norm)
    .filter((e): e is T => e !== null)
}

function normRepo(v: unknown): PagesMapRepo | null {
  if (typeof v !== "object" || v === null) return null
  const r = v as Record<string, unknown>
  const name = str(r.name)
  const digestedAt = str(r.digestedAt)
  // name + digestedAt are the minimum for the page's provenance line; without
  // them the map is not trustworthy enough to render as "generated".
  if (!name || !digestedAt) return null
  return {
    name,
    root: typeof r.root === "string" ? r.root : null,
    commit: str(r.commit),
    digestedAt,
    previewBaseUrl: str(r.previewBaseUrl),
  }
}

function normItem(e: Record<string, unknown>): PageItemUse | null {
  const name = str(e.name)
  if (!name) return null
  return {
    name,
    tier: str(e.tier) ?? "component",
    surface: str(e.surface),
    count: num(e.count),
    catalogued: typeof e.catalogued === "boolean" ? e.catalogued : undefined,
  }
}

function normPage(e: Record<string, unknown>): PageNode | null {
  const route = str(e.route)
  if (!route) return null
  // id is the detail-route segment; fall back to a slug of the route so a
  // node missing an id still resolves rather than being dropped.
  const id = str(e.id) ?? slugifyRoute(route)
  return {
    id,
    route,
    title: str(e.title),
    file: str(e.file) ?? "",
    kind: str(e.kind),
    summary: str(e.summary),
    surface: str(e.surface),
    parent: str(e.parent),
    auth: str(e.auth),
    dynamic: typeof e.dynamic === "boolean" ? e.dynamic : undefined,
    templateName: str(e.templateName),
    links: strList(e.links),
    items: entries<PageItemUse>(e.items, normItem),
    previewUrl: str(e.previewUrl),
    previewable: typeof e.previewable === "boolean" ? e.previewable : undefined,
    sourceFiles: strList(e.sourceFiles),
    sourceHash: str(e.sourceHash),
  }
}

/**
 * A filesystem-safe, unique-ish slug for a route: the detail-route segment.
 * "/" → "home"; "/dashboard/settings" → "dashboard-settings"; dynamic segments
 * keep a readable marker ("/orders/[id]" → "orders-id"). The page-mapper assigns
 * ids; this is the loader's fallback and the shared slug rule.
 */
export function slugifyRoute(route: string): string {
  const cleaned = route
    .replace(/^\/+|\/+$/g, "")
    .replace(/[[\]().]/g, "")
    .replace(/[^a-zA-Z0-9/_-]+/g, "-")
    .replace(/\//g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
  return cleaned || "home"
}

/**
 * Read the map. Agent-written JSON gets normalized per entry — non-object
 * entries dropped, every rendered field coerced — so a bad entry degrades to a
 * sparse node instead of crashing the page.
 */
export async function getPagesMap(): Promise<PagesMap> {
  try {
    const raw = await readFile(MAP_PATH, "utf8")
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      repo: normRepo(parsed.repo),
      routerKind: str(parsed.routerKind),
      routerSources: strList(parsed.routerSources),
      surfacesNote: str(parsed.surfacesNote),
      pages: entries<PageNode>(parsed.pages, normPage),
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return EMPTY
    // A corrupt file must be loud in the UI too, not a lying "no map yet".
    console.error(
      "[pages-map] data/pages-map.json unreadable — flagging on the page:",
      e instanceof Error ? e.message : e
    )
    return { ...EMPTY, unreadable: true }
  }
}

/** True when a map has been generated (drives the page's empty state). */
export function hasPagesMap(map: PagesMap): boolean {
  return map.repo !== null
}

/**
 * Hash a page's source files. MUST stay in lockstep with
 * scripts/check-pages.mjs (same algorithm, same input framing) — the drift
 * check re-hashes the live files and compares to the stored `sourceHash`.
 *
 * `rel` paths are stored relative to the target repo root; `baseDir` is that
 * root on disk (this repo's cwd, or cwd joined with `repo.root` for a host), so
 * both sides frame the identical `rel` strings and read the identical bytes.
 */
export function hashPageSource(files: string[], baseDir: string): string | null {
  const hash = createHash("sha256")
  let any = false
  for (const rel of files) {
    const abs = path.join(baseDir, rel)
    if (!existsSync(abs)) continue
    hash.update(rel)
    hash.update("\n")
    hash.update(readFileSync(abs))
    hash.update("\0")
    any = true
  }
  return any ? hash.digest("hex") : null
}

export type PageSyncState = "fresh" | "stale" | "unanchored"

/**
 * Freshness for one page: re-hash its source files live and compare to the
 * anchor stored at map time. `unanchored` = no stored hash or the files are
 * gone (e.g. a host repo not checked out on this machine) — the UI shows
 * nothing rather than a false "stale". `repoRoot` is `map.repo.root`.
 */
export function getPageSourceSync(node: PageNode, repoRoot: string | null | undefined): PageSyncState {
  if (!node.sourceHash || !node.sourceFiles?.length) return "unanchored"
  const baseDir = repoRoot ? path.join(process.cwd(), repoRoot) : process.cwd()
  const current = hashPageSource(node.sourceFiles, baseDir)
  if (current === null) return "unanchored"
  return current === node.sourceHash ? "fresh" : "stale"
}
