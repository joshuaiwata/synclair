import { readFile } from "node:fs/promises"
import path from "node:path"

import { getExternalComponents, isExistingProjectMode } from "./external"
import { fileDates } from "./git-dates"
import { defaultSurfaceId, getSurfaces } from "./surfaces"
import { getNativePrimitives } from "./ui-primitives"

const REGISTRY_PATH = path.join(process.cwd(), "registry.json")

export type ComponentKind = "component" | "block" | "template"
export type ComponentStatus = "stable" | "beta" | "deprecated"
/**
 * Which layer a registered item belongs to:
 * - `project`    — the app's OWN design-system components (what the library is for).
 * - `foundation` — the Synclair-skin / infrastructure (Synclair's own UI).
 *   These stay registered + documented but are hidden from the project library.
 * Defaults to `project` when unset. See docs/foundation-model.md.
 */
export type ComponentLayer = "foundation" | "project"
/**
 * Where an item comes from:
 * - `native`   — an upstream shadcn/ui primitive vendored in `components/ui/`,
 *                surfaced from the filesystem (not registry.json).
 * - `extended` — a registered item whose source lives in `components/ui/` —
 *                an upstream primitive this project deliberately customized.
 * - `custom`   — invented for this project (the registry's default).
 * - `external` — lives in a HOST repo (existing-project mode), cataloged as a
 *                documented entity via `data/external-catalog.json` — never
 *                imported or live-rendered here. See `lib/system/external.ts`.
 */
export type ComponentOrigin = "native" | "extended" | "custom" | "external"

export interface RegistryComponent {
  name: string
  title: string
  description: string
  kind: ComponentKind
  categories: string[]
  dependencies: string[]
  /** All source files for the item; `file` is the first (primary). */
  files: string[]
  file: string
  /** Repo-relative path to the colocated `.docs.tsx`, if registered. */
  docs?: string
  status?: ComponentStatus
  /** `foundation` (Synclair hub-skin) or `project` (the app's own). Defaults to `project`. */
  layer: ComponentLayer
  /** `native` (upstream shadcn) / `extended` (customized upstream) / `custom` (invented here). */
  origin: ComponentOrigin
  /**
   * App surface this item belongs to (`lib/system/surfaces.ts`). Names are
   * unique per (surface, name) — a web `button` and an RN `button` coexist.
   * Defaults to the project's first/implicit surface; only meaningful when the
   * project declares multiple surfaces. `SHARED_SURFACE_ID` marks monorepo
   * code consumed by several frontends.
   */
  surface?: string
  /**
   * Cross-surface concept id (defaults to `name`) — items sharing a concept
   * are the same design concept implemented per surface, and present as ONE
   * entry with availability chips in unscoped views. The entity is a
   * projection over items, not a record (foundation-model §5b).
   */
  concept: string
  /** Upstream documentation URL — set for `native` items (ui.shadcn.com). */
  docsUrl?: string
  /** Static thumbnail for items that can't live-render (`external` screenshots). */
  previewImage?: string
  /** For `external` items: file count from the HOST repo's import graph (cataloged, not live). */
  hostUsageCount?: number
  /**
   * For `external` items: what the host component is built on — `shadcn` (a
   * shadcn/ui primitive, native to the host's own system) vs `custom` (bespoke
   * to the host). Drives the companion-mode gallery's shadcn/custom split, which
   * is the differentiation that matters to a stakeholder (native vs custom,
   * in-use vs not) — not the Synclair-vs-host origin taxonomy. Absent → custom.
   */
  hostBasis?: "shadcn" | "custom"
  /** ISO date first committed (from git). Empty when unavailable. */
  addedAt: string
  /** ISO date last committed (from git). Empty when unavailable. */
  updatedAt: string
}

interface RawItem {
  name: string
  type: string
  title?: string
  description?: string
  categories?: string[]
  files?: { path: string }[]
  registryDependencies?: string[]
  docs?: string
  meta?: {
    status?: ComponentStatus
    layer?: ComponentLayer
    surface?: string
    concept?: string
    /** Opt-in gallery THUMBNAIL screenshot (public/ path). Cards only — the doc
     *  page still renders live; use for complex blocks whose scaled-down live
     *  render makes a poor thumb. */
    previewImage?: string
  }
}

const KIND_BY_TYPE: Record<string, ComponentKind> = {
  "registry:block": "block",
  "registry:page": "template",
  "registry:component": "component",
}

async function readItems(): Promise<RawItem[]> {
  try {
    const raw = await readFile(REGISTRY_PATH, "utf8")
    return (JSON.parse(raw).items ?? []) as RawItem[]
  } catch {
    return []
  }
}

async function toComponent(it: RawItem): Promise<RegistryComponent> {
  const files = (it.files ?? []).map((f) => f.path)
  const primary = files[0] ?? ""
  const { addedAt, updatedAt } = primary
    ? await fileDates(primary)
    : { addedAt: "", updatedAt: "" }
  return {
    name: it.name,
    title: it.title ?? it.name,
    description: it.description ?? "",
    kind: KIND_BY_TYPE[it.type] ?? "component",
    categories: it.categories ?? [],
    dependencies: it.registryDependencies ?? [],
    files,
    file: primary,
    docs: it.docs,
    status: it.meta?.status,
    layer: it.meta?.layer ?? "project",
    origin: primary.startsWith("components/ui/") ? "extended" : "custom",
    surface: it.meta?.surface ?? defaultSurfaceId(),
    concept: it.meta?.concept ?? it.name,
    previewImage: it.meta?.previewImage,
    addedAt,
    updatedAt,
  }
}

/** Native shadcn primitives always belong to a web surface (they're DOM components). */
function nativeSurfaceId(): string {
  return getSurfaces().find((s) => s.platform === "web")?.id ?? defaultSurfaceId()
}

/** Our own registered components/blocks/templates — source of truth is registry.json. */
export async function getComponents(): Promise<RegistryComponent[]> {
  const items = await readItems()
  return Promise.all(items.map(toComponent))
}

/**
 * The full library catalog: registered items (registry.json) PLUS the native
 * shadcn primitives installed in `components/ui/` (`origin: "native"`) PLUS —
 * in existing-project mode — the host app's cataloged components
 * (`origin: "external"`, from `data/external-catalog.json`). Natives and
 * externals are part of the project's design vocabulary, so they carry
 * `layer: "project"` and show in the galleries by default.
 *
 * Precedence is registered > external > native, keyed per (surface, name) —
 * but only a PROJECT-layer registered item outranks a host external. A
 * registered item that customizes a `components/ui/` file (`origin: "extended"`)
 * supersedes its native entry, and a PROJECT-layer registered item (e.g. an
 * external component ported through the invention gate) supersedes an external
 * entry of the same name. Crucially, an EXTERNAL (host) entry supersedes a
 * NATIVE primitive of the same name: in existing-project mode the host's
 * cataloged components ARE the project's design system, so the host `button`
 * we just cataloged must win over Synclair's own stock native `button`
 * (foundation scaffolding) — otherwise the host component would be invisible.
 *
 * A FOUNDATION-layer registered item (Synclair's own hub skin — `page-header`,
 * `section-header`, …) is hidden from the project galleries, so it must NOT
 * shadow a host component that merely shares its generic name; and when a host
 * external does own such a name, the shadowed foundation item is dropped from
 * this project catalog so the name resolves to exactly one entry (the host's).
 * New-project clones have no externals, so this reduces to registered > native.
 */
export async function getCatalog(): Promise<RegistryComponent[]> {
  const [registered, natives, externals, existingProject] = await Promise.all([
    getComponents(),
    getNativePrimitives(),
    getExternalComponents(),
    isExistingProjectMode(),
  ])
  // Keyed per (surface, name) so a web `button` never shadows an RN `button`.
  // Single-surface, this reduces to plain name-keyed behavior exactly.
  const key = (c: { surface?: string; name: string }, fallback: string) =>
    `${c.surface ?? fallback}:${c.name}`
  const nativeSurface = nativeSurfaceId()
  const fallback = defaultSurfaceId()
  const claimedFiles = new Set(registered.flatMap((c) => c.files))
  const claimedKeys = new Set(registered.map((c) => key(c, fallback)))
  // Only a PROJECT-layer registered item outranks a host external — a
  // foundation hub-skin item (hidden from the galleries) must not shadow it.
  const projectClaimedKeys = new Set(
    registered.filter((c) => c.layer === "project").map((c) => key(c, fallback))
  )
  const externalItems = externals.filter((e) => !projectClaimedKeys.has(key(e, fallback)))
  const externalKeys = new Set(externalItems.map((e) => key(e, fallback)))
  // Drop any foundation item a surviving host external now owns the name for, so
  // the project catalog has one entry per (surface, name) and the doc route /
  // search resolve to the host component rather than the hidden hub-skin one.
  // Symmetrically, a PROJECT-layer registered item (a live port that just
  // superseded that external) keeps owning the name — otherwise porting a host
  // component whose name a hub-skin item shares (e.g. `page-header`) would
  // resurface the shadowed foundation item as a same-key twin.
  const registeredVisible = registered.filter(
    (c) =>
      c.layer === "project" ||
      (!externalKeys.has(key(c, fallback)) && !projectClaimedKeys.has(key(c, fallback)))
  )
  // Natives fill in last: a stock primitive shows only when neither a
  // registered nor a host component of the same name already occupies its slot.
  // BUT in existing-project/companion mode the native fillers are SYNCLAIR's own
  // `components/ui` primitives — they are NOT the host's design system, so
  // surfacing them as project components only adds noise (Accordion, Skeleton,
  // Select… the host may not even use). The project's real primitives already
  // come through as host externals (a shadcn `button` the host uses is cataloged
  // as a host entry). So drop the fillers entirely when there's a host.
  const takenKeys = new Set([...claimedKeys, ...externalKeys])
  const nativeItems: RegistryComponent[] = existingProject
    ? []
    : await Promise.all(
    natives
      .filter((n) => !claimedFiles.has(n.file) && !takenKeys.has(`${nativeSurface}:${n.name}`))
      .map(async (n) => {
        const { addedAt, updatedAt } = await fileDates(n.file)
        return {
          name: n.name,
          title: n.title,
          description: n.description,
          kind: "component" as const,
          categories: [n.category],
          dependencies: [],
          files: [n.file],
          file: n.file,
          docs: undefined,
          status: undefined,
          layer: "project" as const,
          origin: "native" as const,
          surface: nativeSurface,
          concept: n.name,
          docsUrl: n.docsUrl,
          addedAt,
          updatedAt,
        }
      })
  )
  return [...registeredVisible, ...externalItems, ...nativeItems]
}

/**
 * Whether Synclair's own foundation hub-skin (`layer: "foundation"`) is shown in
 * the project library. Hidden in companion/existing-project mode (a stakeholder
 * browsing THEIR product shouldn't see Synclair's chrome); shown in new-project
 * mode (the clone IS the product — the mother repo), where those components ARE
 * the design system being developed. The one gate every library surface shares,
 * so galleries, search, the tree, and counts never disagree.
 */
export async function isFoundationVisible(): Promise<boolean> {
  return !(await isExistingProjectMode())
}
/** Library-visibility predicate for a catalog item, given the foundation gate. */
export function isLibraryVisible(c: RegistryComponent, foundationVisible: boolean): boolean {
  return c.layer === "project" || (foundationVisible && c.layer === "foundation")
}

/**
 * The PROJECT's components — what the library galleries + search should show.
 * Excludes Synclair's own hub-skin (`layer: "foundation"`) in companion mode;
 * includes it in new-project mode, where the clone IS the product and those
 * components ARE the design system being developed.
 */
export async function getProjectComponents(): Promise<RegistryComponent[]> {
  const fv = await isFoundationVisible()
  return (await getComponents()).filter((c) => isLibraryVisible(c, fv))
}

/** Count of hidden foundation (hub-skin) items, for a transparent "N hidden" note. Zero when foundation is visible (nothing is hidden). */
export async function getFoundationCount(): Promise<number> {
  return (await isFoundationVisible())
    ? 0
    : (await getComponents()).filter((c) => c.layer === "foundation").length
}

/** One registered item by name, or null if it isn't in the registry. */
export async function getComponent(name: string): Promise<RegistryComponent | null> {
  const items = await readItems()
  const it = items.find((i) => i.name === name)
  return it ? toComponent(it) : null
}

/**
 * One catalog item by name — registered items first, then the merged catalog.
 * When `surface` is given, an exact (surface, name) match wins; without it the
 * first name match is returned (unambiguous whenever names don't collide
 * across surfaces — i.e. every single-surface project).
 */
export async function getCatalogItem(name: string, surface?: string): Promise<RegistryComponent | null> {
  const matches = await getCatalogItems(name)
  if (matches.length === 0) return null
  if (surface) return matches.find((c) => (c.surface ?? defaultSurfaceId()) === surface) ?? null
  return matches[0]
}

/** All catalog items sharing a name (one per surface at most) — for disambiguation. */
export async function getCatalogItems(name: string): Promise<RegistryComponent[]> {
  return (await getCatalog()).filter((c) => c.name === name)
}

/** Items that list `name` in their registryDependencies — the "used in" reverse lookup. */
export async function getDependents(name: string): Promise<RegistryComponent[]> {
  const all = await getComponents()
  return all.filter((c) => c.dependencies.includes(name))
}
