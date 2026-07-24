import { cache } from "react"

import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

import type { ComponentKind, ComponentStatus, RegistryComponent } from "./components"
import type { ComponentDoc, DocProp, Preview } from "./doc-types"
import { deriveHostProps } from "./host-docgen"
import { getSetupMode } from "./setup"
import { defaultSurfaceId } from "./surfaces"

/**
 * The EXTERNAL tier of the library: components that live in a HOST repo, not
 * this clone — existing-project mode (docs/existing-project.md), where Synclair
 * runs as a companion beside an app that already exists.
 *
 * These are *documented entities* by default — the hub catalogs them (name,
 * API, usage, a picture) without importing them. Two derived layers keep the
 * catalog a LENS over the host rather than a third source of truth
 * (docs/rendering-parity.md): props are computed live from the host source when
 * it's on disk (host-docgen.ts), and an entry with a registered live preview
 * (components/host-previews/registry.tsx, via the port-host-component skill)
 * renders the host's actual component in a scoped product theme.
 *
 * Source of truth is `data/external-catalog.json` (SEED — written by the
 * `component-cataloger` agent via the `existing-project-intake` skill; blank in
 * the mother repo). Freshness against the host repo is machine-checked by
 * `npm run check:host` (scripts/check-host-drift.mjs) using each entry's
 * `sourceHash`.
 */

const CATALOG_PATH = path.join(process.cwd(), "data", "external-catalog.json")

/**
 * A host app this catalog was surveyed from. Single-frontend projects have one;
 * multi-surface projects (see `lib/system/surfaces.ts`) have one per surface —
 * monorepo workspaces ("../acme/apps/mobile") or sibling repos both work, since
 * a host is just a root path.
 */
export interface ExternalHost {
  /** Project name, e.g. "acme-app". */
  name: string
  /** Host repo root, relative to THIS repo's root, e.g. "../acme-app". */
  root: string
  /** Surface id this host belongs to (seed/surfaces.ts). Optional when there's one surface. */
  surface?: string
  /** One-liner from the codebase-surveyor, e.g. "Next.js 15 + Tailwind 4". */
  framework?: string
  /** ISO date the survey was last run. */
  surveyedAt?: string
  /**
   * The host's STYLING source-of-truth files (tailwind config, globals.css,
   * theme module) + a sha256 at token-dig time — so the design foundation is
   * "living" like the component catalog: `check:host` re-hashes these and WARNS
   * when the host re-themes, prompting a token-dig refresh. Companion mode only;
   * the `token-archaeologist` records what it read. Advisory (a warning, not a
   * hard failure) — a stale palette is "may have drifted", not "definitely wrong".
   */
  styleSources?: { path: string; hash: string }[]
}

export interface ExternalExample {
  title: string
  description?: string
  /** Verbatim usage snippet from the host codebase. */
  code?: string
  /** Screenshot path under public/, e.g. "/external/data-grid.png". */
  image?: string
}

/** Usage inside the HOST repo (the cataloger's import-graph count). */
export interface ExternalUsage {
  fileCount: number
  /** Sample of host-relative files that use it (not exhaustive). */
  files?: string[]
}

export interface ExternalItem {
  name: string
  title: string
  description: string
  kind: ComponentKind
  categories: string[]
  /** Surface id this component belongs to (seed/surfaces.ts). Defaults to the first host's surface. */
  surface?: string
  /**
   * Cross-surface CONCEPT id — the design concept this implements. Defaults to
   * `name`: same-named items on different surfaces are one concept (a web
   * `button` and an RN `button`). Set only when names diverge across surfaces
   * for the same concept (web `data-table` / RN `list-view` → both
   * `concept: "data-table"`) or same-named items are genuinely different things.
   */
  concept?: string
  /** Source path relative to ITS surface's host root (`hosts[]`). */
  hostPath: string
  /** sha256 of the host source at cataloging time — drives check:host. */
  sourceHash: string
  /** ISO date this entry was written/refreshed. */
  catalogedAt: string
  status?: ComponentStatus
  /**
   * What the host component is built on: `shadcn` (a shadcn/ui primitive — native
   * to the host's own design system) or `custom` (bespoke to the host). Drives
   * the companion-mode gallery's shadcn-vs-custom differentiation. Absent →
   * treated as custom. The cataloger sets this from the source (does it wrap a
   * shadcn/Radix primitive, or is it hand-built?).
   */
  basis?: "shadcn" | "custom"
  props?: DocProp[]
  examples?: ExternalExample[]
  usage?: ExternalUsage
  /** Markdown: behavior, variants, caveats — what the cataloger distilled. */
  notes?: string
}

export interface ExternalCatalog {
  /** One host per surface. Older catalogs wrote a singular `host`; the loader upgrades it. */
  hosts: ExternalHost[]
  items: ExternalItem[]
}

const EMPTY: ExternalCatalog = { hosts: [], items: [] }

const VALID_KINDS = new Set<string>(["component", "block", "template"])

/** Request-memoised — one build per render pass (react cache). */
export const getExternalCatalog = cache(getExternalCatalogUncached)

async function getExternalCatalogUncached(): Promise<ExternalCatalog> {
  try {
    const raw = await readFile(CATALOG_PATH, "utf8")
    const parsed = JSON.parse(raw) as Partial<ExternalCatalog> & { host?: ExternalHost | null }
    // Back-compat: pre-surfaces catalogs have a singular `host` field.
    const hosts = Array.isArray(parsed.hosts)
      ? parsed.hosts.filter((h) => h && typeof h.root === "string")
      : parsed.host
        ? [parsed.host]
        : []
    return {
      hosts,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    }
  } catch (e) {
    // A missing file is a valid blank; a corrupt one should be loud, not an
    // inexplicably empty hub (check:host reports the same corruption as exit 1).
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(
        "[external-catalog] data/external-catalog.json unreadable — treating as empty:",
        e instanceof Error ? e.message : e
      )
    }
    return EMPTY
  }
}

/**
 * True in existing-project / companion mode — Synclair documents a HOST app that
 * already exists. Drives mode-aware chrome (e.g. Foundations frames the host
 * palette as the project's, distinct from Synclair's own neutral tokens).
 *
 * Derives from the durable setup-mode marker (`lib/system/setup.ts`,
 * `docs/setup-modes.md`) rather than guessing purely from catalog contents:
 *
 * - `watcher` — a separate repo paired beside a host → always existing-project.
 * - `embedded` **or** unresolved — the topology marker alone can't say whether a
 *   host is being documented (a co-located embedded hub sitting OVER a host vs. a
 *   new-project clone that IS the product), so fall back to the catalog: true iff
 *   a host is declared. This is exactly the pre-marker behavior, so clones with
 *   no marker (and new-project embedded clones, which have no hosts) are unchanged.
 */
export async function isExistingProjectMode(): Promise<boolean> {
  if ((await getSetupMode()) === "watcher") return true
  return (await getExternalCatalog()).hosts.length > 0
}

/**
 * Catalog entries as library items (`origin: "external"`), for getCatalog().
 * Agent-written JSON gets validated per entry: unusable entries (no name /
 * hostPath) are skipped and duplicates dropped rather than crashing the
 * galleries; missing decoration falls back to safe defaults.
 */
export async function getExternalComponents(): Promise<RegistryComponent[]> {
  const { hosts, items } = await getExternalCatalog()
  const fallbackSurface = hosts[0]?.surface ?? defaultSurfaceId()
  const seen = new Set<string>()
  const usable = items.filter((it) => {
    if (typeof it?.name !== "string" || !it.name || typeof it.hostPath !== "string" || !it.hostPath) {
      console.error(`[external-catalog] skipping entry without name/hostPath: ${JSON.stringify(it).slice(0, 120)}`)
      return false
    }
    // Same name on DIFFERENT surfaces is legal (web `button` + RN `button`).
    const key = `${it.surface ?? fallbackSurface}:${it.name}`
    if (seen.has(key)) {
      console.error(`[external-catalog] skipping duplicate entry "${key}" (first one wins)`)
      return false
    }
    seen.add(key)
    return true
  })
  return usable.map((it) => ({
    name: it.name,
    title: it.title ?? it.name,
    description: it.description ?? "",
    kind: VALID_KINDS.has(it.kind) ? it.kind : "component",
    categories: Array.isArray(it.categories) ? it.categories : [],
    surface: it.surface ?? fallbackSurface,
    concept: it.concept ?? it.name,
    dependencies: [],
    files: [it.hostPath],
    file: it.hostPath,
    docs: undefined,
    status: it.status,
    layer: "project" as const,
    origin: "external" as const,
    previewImage: it.examples?.find((ex) => ex.image)?.image,
    hostUsageCount: it.usage?.fileCount,
    hostBasis: it.basis === "shadcn" ? "shadcn" : "custom",
    // Git dates don't apply to host sources; both dates read as "cataloged".
    addedAt: it.catalogedAt ?? "",
    updatedAt: it.catalogedAt ?? "",
  }))
}

function examplePreview(ex: ExternalExample): Preview {
  return ex.image ? { kind: "image", src: ex.image, alt: ex.title } : { kind: "code" }
}

/**
 * Synthesize a ComponentDoc from an external entry — same contract as a
 * colocated .docs.tsx, minus live rendering (the source can't run here).
 */
export async function getExternalDoc(name: string, surface?: string): Promise<ComponentDoc | undefined> {
  const { hosts, items } = await getExternalCatalog()
  const fallbackSurface = hosts[0]?.surface ?? defaultSurfaceId()
  const matches = items.filter((i) => i.name === name)
  const it = surface
    ? matches.find((i) => (i.surface ?? fallbackSurface) === surface)
    : matches[0]
  if (!it) return undefined
  const host = hosts.find((h) => h.surface === (it.surface ?? fallbackSurface)) ?? hosts[0] ?? null

  const provenance = [
    `Documented from the host app${host ? ` (**${host.name}**)` : ""} — source \`${it.hostPath}\`, cataloged ${it.catalogedAt || "date unknown"}.`,
    "To make it first-class in this library, port it through the `component-library` invention gate.",
  ].join(" ")

  const usageLine = it.usage
    ? `\n\n**Used in the host app:** ${it.usage.fileCount} file${it.usage.fileCount === 1 ? "" : "s"}${
        it.usage.files?.length ? ` — e.g. ${it.usage.files.map((f) => `\`${f}\``).join(", ")}` : ""
      }.`
    : ""

  // DERIVE, don't transcribe (docs/rendering-parity.md): with the host on disk,
  // the Props table is computed from the host's actual TypeScript on read —
  // fresh by construction, like Storybook docgen. Authored `props` are only the
  // fallback for machines where the host isn't checked out.
  const hostRootAbs = host ? path.resolve(process.cwd(), host.root) : null
  const derived =
    hostRootAbs && existsSync(hostRootAbs) ? deriveHostProps(hostRootAbs, it.hostPath) : null
  const propsLine = derived
    ? `\n\n**Props are derived live** from \`${it.hostPath}\` on every read — the API table can't go stale.`
    : ""

  return {
    // An example with neither code nor image would render as a bare title.
    examples: (it.examples ?? [])
      .filter((ex) => ex.code || ex.image)
      .map((ex) => ({
        title: ex.title,
        description: ex.description,
        code: ex.code,
        preview: examplePreview(ex),
      })),
    props: derived ?? it.props,
    notes: `${it.notes ? `${it.notes}\n\n` : ""}${provenance}${usageLine}${propsLine}`,
  }
}
