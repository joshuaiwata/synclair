import { readFile } from "node:fs/promises"
import path from "node:path"

/**
 * The SYSTEM MAP: a distilled, human-and-agent-readable digest of what's in a
 * codebase BEYOND the component library — areas/modules, API surface, data
 * model, background jobs, integrations. The visibility counterpart of the
 * component catalog: the catalog answers "what UI exists", the system map
 * answers "what does this system consist of and where does it live".
 *
 * Mode-agnostic: `repo.root === null` means the map describes THIS repo (the
 * product app at the root); a path means it describes the HOST repo
 * (existing-project mode, same convention as `data/external-catalog.json`).
 *
 * Source of truth is `data/system-map.json` (SEED — written by the
 * `system-mapper` agent via the `codebase-map` skill; blank in the mother
 * repo). It is a DIGEST, not a mirror: one screen of orientation per section,
 * with `source` paths pointing at the real files for anything deeper. Surfaced
 * for humans at `/synclair/system`; agents read this file (or the loader) direct.
 */

const MAP_PATH = path.join(process.cwd(), "data", "system-map.json")

export interface SystemMapRepo {
  /** Project name, e.g. "acme-app". */
  name: string
  /** null = THIS repo; otherwise the host repo root, relative to this repo. */
  root: string | null
  /** Commit hash the digest was generated from — the staleness anchor. */
  commit?: string
  /** ISO date the map was last generated. */
  digestedAt: string
}

/**
 * Which app surface a map entry belongs to, for multi-surface projects
 * (`lib/system/surfaces.ts`): a surface id from `seed/surfaces.ts`, or the
 * literal `"shared"` for backend/packages both frontends consume. Absent =
 * shared — single-surface maps never set it.
 */
export type MapSurface = string

/** A product/code area — a module, domain, or top-level directory that means something. */
export interface SystemArea {
  name: string
  /** Repo-relative path, e.g. "src/billing". */
  path: string
  /** One line: what lives here and why it exists. */
  summary: string
  /** Optional markdown: key files, patterns, gotchas. */
  details?: string
  /** Surface id or "shared" (multi-surface projects only). */
  surface?: MapSurface
}

export interface ApiEndpoint {
  /** "GET" / "POST" / "MUTATION" / "SUBSCRIBE" — whatever the protocol calls it. */
  method: string
  /** "/api/orders/:id" or "orders.create" (RPC) — the callable surface. */
  path: string
  summary?: string
  /** Repo-relative file that defines it. */
  source?: string
  /** Surface id or "shared" (multi-surface projects only). */
  surface?: MapSurface
}

export interface DataEntityField {
  name: string
  type?: string
  note?: string
}

export interface DataEntity {
  name: string
  /** "table" / "collection" / "model" — whatever the store calls it. */
  kind?: string
  summary?: string
  /** Key fields only — a digest, not the full schema. */
  fields?: DataEntityField[]
  /** Repo-relative schema/migration/model file. */
  source?: string
}

export interface SystemJob {
  name: string
  /** What runs it: "cron 0 2 * * *", "queue: emails", "on deploy". */
  trigger: string
  summary?: string
  source?: string
  /** Surface id or "shared" (multi-surface projects only). */
  surface?: MapSurface
}

export interface SystemIntegration {
  name: string
  /** "payments" / "auth" / "email" / "analytics" / "storage" / "llm" ... */
  kind?: string
  summary?: string
}

/**
 * One labeled fact in the "at a glance" stack grid — the scannable replacement
 * for a run-on prose `stack` paragraph. `label` is the category ("Framework",
 * "Data", "Auth"); `value` is the tech, short enough to read in a glance;
 * `note` is optional half-sentence context.
 */
export interface StackFact {
  label: string
  value: string
  note?: string
}

/**
 * One headed section of the overview — structure so the orientation read is
 * scannable (What it is / How a request flows / Where state lives / …) instead
 * of a wall of prose. `body` is markdown.
 */
export interface OverviewSection {
  heading: string
  body: string
}

export interface SystemMap {
  repo: SystemMapRepo | null
  /** Markdown paragraph: the one-breath stack. Back-compat fallback for `stackFacts`. */
  stack?: string
  /** The "at a glance" stack, as scannable labeled facts. Preferred over `stack`. */
  stackFacts: StackFact[]
  /** Markdown: how the pieces fit together. Back-compat fallback for `overviewSections`. */
  overview?: string
  /** The orientation read, as headed sections. Preferred over `overview`. */
  overviewSections: OverviewSection[]
  /** Markdown, multi-surface projects: how the repo divides into frontends + shared code. */
  surfacesNote?: string
  areas: SystemArea[]
  api: ApiEndpoint[]
  data: DataEntity[]
  jobs: SystemJob[]
  integrations: SystemIntegration[]
  /** Set when the data file exists but couldn't be parsed — the page says so instead of showing a lying empty state. */
  unreadable?: boolean
}

const EMPTY: SystemMap = {
  repo: null,
  stackFacts: [],
  overviewSections: [],
  areas: [],
  api: [],
  data: [],
  jobs: [],
  integrations: [],
}

/** Coerce to string, or drop — agent-written JSON may put objects/arrays anywhere. */
function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}

/** Normalize one section: keep only object entries, coerce every field. */
function entries<T>(v: unknown, norm: (e: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
    .map(norm)
    .filter((e): e is T => e !== null)
}

function normRepo(v: unknown): SystemMapRepo | null {
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
  }
}

/**
 * Read the map. Agent-written JSON gets normalized per entry — non-object
 * entries dropped, every rendered field coerced to string-or-undefined — so a
 * bad entry degrades to a sparse row instead of crashing the page.
 */
export async function getSystemMap(): Promise<SystemMap> {
  try {
    const raw = await readFile(MAP_PATH, "utf8")
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      repo: normRepo(parsed.repo),
      stack: str(parsed.stack),
      stackFacts: entries<StackFact>(parsed.stackFacts, (e) => {
        const label = str(e.label)
        const value = str(e.value)
        if (!label || !value) return null
        return { label, value, note: str(e.note) }
      }),
      overview: str(parsed.overview),
      overviewSections: entries<OverviewSection>(parsed.overviewSections, (e) => {
        const heading = str(e.heading)
        const body = str(e.body)
        if (!heading || !body) return null
        return { heading, body }
      }),
      surfacesNote: str(parsed.surfacesNote),
      areas: entries<SystemArea>(parsed.areas, (e) => {
        const name = str(e.name) ?? str(e.path)
        if (!name) return null
        return {
          name,
          path: str(e.path) ?? "",
          summary: str(e.summary) ?? "",
          details: str(e.details),
          surface: str(e.surface),
        }
      }),
      api: entries<ApiEndpoint>(parsed.api, (e) => {
        const path = str(e.path)
        if (!path) return null
        return { method: str(e.method) ?? "—", path, summary: str(e.summary), source: str(e.source), surface: str(e.surface) }
      }),
      data: entries<DataEntity>(parsed.data, (e) => {
        const name = str(e.name)
        if (!name) return null
        return {
          name,
          kind: str(e.kind),
          summary: str(e.summary),
          fields: entries<DataEntityField>(e.fields, (f) => {
            const fname = str(f.name)
            return fname ? { name: fname, type: str(f.type), note: str(f.note) } : null
          }),
          source: str(e.source),
        }
      }),
      jobs: entries<SystemJob>(parsed.jobs, (e) => {
        const name = str(e.name)
        if (!name) return null
        return { name, trigger: str(e.trigger) ?? "", summary: str(e.summary), source: str(e.source), surface: str(e.surface) }
      }),
      integrations: entries<SystemIntegration>(parsed.integrations, (e) => {
        const name = str(e.name)
        if (!name) return null
        return { name, kind: str(e.kind), summary: str(e.summary) }
      }),
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return EMPTY
    // A corrupt file must be loud in the UI too, not a lying "no map yet".
    console.error(
      "[system-map] data/system-map.json unreadable — flagging on the page:",
      e instanceof Error ? e.message : e
    )
    return { ...EMPTY, unreadable: true }
  }
}

/** True when a map has been generated (drives the page's empty state). */
export function hasSystemMap(map: SystemMap): boolean {
  return map.repo !== null
}
