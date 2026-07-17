import Link from "next/link"
import { LayoutTemplate } from "lucide-react"

import { ComponentCard } from "@/components/library/component-card"
import { getHostPreview } from "@/components/host-previews/registry"
import { FilterBar, type FilterGroup } from "@/components/library/filter-bar"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  getCatalog,
  isFoundationVisible,
  isLibraryVisible,
  type ComponentKind,
  type RegistryComponent,
} from "@/lib/system/components"
import { getHostCoverage } from "@/lib/system/host-scan"
import { countHostUsage, jsxTagPattern, type HostUsage } from "@/lib/system/host-usage"
import { synclair } from "@/lib/system/routes"
import {
  defaultSurfaceId,
  getSurface,
  inheritsShared,
  isMultiSurface,
  PLATFORM_BADGE,
  SHARED_SURFACE_ID,
  surfaceLabel,
} from "@/lib/system/surfaces"
import { itemHref, tier, tierSlug } from "@/lib/system/tiers"
import { getUsageMap, type ItemUsage } from "@/lib/system/usage"

/** "data-display" -> "Data display". */
function prettyCategory(cat: string): string {
  const s = cat.replace(/[-_]/g, " ")
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const UNCATEGORIZED = "Other"

export interface GalleryFilters {
  /** "all" | "custom" | "native" | "extended" | "external" */
  origin?: string
  /** "all" | "used" | "unused" */
  usage?: string
  /** Legacy deep links (?surface=) — the page redirects these to scoped paths. */
  surface?: string
}

/**
 * One display entry in the gallery. Unscoped multi-surface galleries group
 * items by CONCEPT (one entry per design concept, availability chips per
 * surface — foundation-model §5b); everywhere else an entry is one item.
 */
interface GalleryEntry {
  primary: RegistryComponent
  href: string
  chips?: string[]
}

function surfaceChip(surfaceId: string): string {
  if (surfaceId === SHARED_SURFACE_ID) return "pkg"
  const platform = getSurface(surfaceId)?.platform
  return platform ? PLATFORM_BADGE[platform] : surfaceLabel(surfaceId)
}

export async function TierGallery({
  kind,
  filters = {},
  scope,
}: {
  kind: ComponentKind
  filters?: GalleryFilters
  /** Surface id (or SHARED_SURFACE_ID) when rendering inside an entered scope. */
  scope?: string
}) {
  const t = tier(kind)
  const catalog = await getCatalog()
  const usage = await getUsageMap(catalog)
  const multiSurface = isMultiSurface()
  const surfaceOf = (c: RegistryComponent) => c.surface ?? defaultSurfaceId()

  // The library catalogs the PROJECT's design system. Synclair's own hub-skin
  // (`layer: "foundation"`) is hidden in companion/existing-project mode (a
  // stakeholder shouldn't see Synclair's chrome), but SHOWN in new-project mode
  // (the mother repo) — there those components ARE the design system.
  const foundationVisible = await isFoundationVisible()
  const allOfTier = catalog.filter((c) => c.kind === kind && isLibraryVisible(c, foundationVisible))
  const foundationCount = foundationVisible
    ? 0
    : catalog.filter((c) => c.kind === kind && c.layer === "foundation").length

  // Scope: an entered surface sees its own items PLUS shared packages (badged),
  // so a web dev never has to leave scope to see what packages/ui offers. Shared
  // only carries over to platform-compatible surfaces — an RN surface doesn't
  // inherit the web design system.
  const items = scope
    ? allOfTier.filter(
        (c) =>
          surfaceOf(c) === scope ||
          (scope !== SHARED_SURFACE_ID &&
            inheritsShared(scope) &&
            surfaceOf(c) === SHARED_SURFACE_ID)
      )
    : allOfTier

  const origin = filters.origin ?? "all"
  const usageFilter = filters.usage ?? "all"
  // Foundation items (Synclair's own hub-skin) are used BY the hub — for them
  // "in use" means anywhere in the repo, matching the card badge.
  const inProduct = (c: RegistryComponent) => {
    const u = usage.get(c.name)
    if (!u) return false
    return c.layer === "foundation"
      ? u.productFiles.length + u.hubFiles.length > 0
      : u.inProduct
  }

  // Companion/existing-project mode: the gallery IS the host's own components
  // (Synclair's native fillers are dropped upstream in getCatalog). The
  // differentiation a stakeholder cares about is what a host item is built on —
  // shadcn (native to their system) vs custom — and whether it's used in the
  // host, NOT the Synclair-vs-host origin taxonomy. So swap the axes.
  const hasHost = items.some((c) => c.origin === "external")
  const basisOf = (c: RegistryComponent) => c.hostBasis ?? "custom"
  const basisCount = (b: string) =>
    items.filter((c) => c.origin === "external" && basisOf(c) === b).length
  // Host (external) items: count their JSX tag LIVE against the host's web
  // source (host-usage.ts), replacing the intake-time snapshot — derive, don't
  // transcribe. Non-web surfaces keep the cataloged count (RN vocabularies
  // aren't pattern-matched); null = host not checked out, fall back too.
  const hostLiveUsage = new Map<string, HostUsage | null>()
  await Promise.all(
    items
      .filter(
        (c) =>
          c.origin === "external" &&
          (getSurface(surfaceOf(c))?.platform ?? "web") === "web"
      )
      .map(async (c) => {
        hostLiveUsage.set(
          `${surfaceOf(c)}:${c.name}`,
          await countHostUsage([jsxTagPattern(c.name)])
        )
      })
  )
  const hostUsageOf = (c: RegistryComponent) =>
    hostLiveUsage.get(`${surfaceOf(c)}:${c.name}`) ?? null
  // "In use" = live host count for externals (cataloged snapshot as fallback),
  // this repo's import graph for anything registered.
  const isUsed = (c: RegistryComponent) =>
    c.origin === "external"
      ? (hostUsageOf(c)?.fileCount ?? c.hostUsageCount ?? 0) > 0
      : inProduct(c)

  const originCount = (o: string) => items.filter((c) => c.origin === o).length
  // Foundation (Synclair hub-skin) items are registered with `origin: "custom"`,
  // so the "custom" label must count PROJECT-layer items only — otherwise it
  // double-counts the Synclair items already shown under "from Synclair".
  const foundationItemCount = items.filter((c) => c.layer === "foundation").length
  const customLabelCount = items.filter(
    (c) => c.layer === "project" && c.origin !== "native"
  ).length
  const originGroup: FilterGroup = hasHost
    ? {
        param: "origin",
        label: "Basis",
        options: [
          { value: "all", label: "All", count: items.length },
          { value: "shadcn", label: "shadcn", count: basisCount("shadcn") },
          { value: "custom", label: "Custom", count: basisCount("custom") },
        ],
      }
    : {
        param: "origin",
        label: "Origin",
        options: [
          { value: "all", label: "All", count: items.length },
          { value: "custom", label: "Custom", count: customLabelCount },
          { value: "native", label: "shadcn", count: originCount("native") },
          ...(originCount("extended") > 0
            ? [{ value: "extended", label: "Extended", count: originCount("extended") }]
            : []),
          ...(foundationVisible && foundationItemCount > 0
            ? [{ value: "foundation", label: "Synclair", count: foundationItemCount }]
            : []),
        ],
      }
  // Usage: host items carry their own usage (host import graph), so unlike the
  // registered-only case they are NOT usage-exempt in companion mode.
  const usageEligible = hasHost ? items : items.filter((c) => c.origin !== "external")
  const usedCount = (hasHost ? items : usageEligible).filter(isUsed).length
  const usageGroup: FilterGroup = {
    param: "usage",
    label: "Usage",
    options: [
      { value: "all", label: "All", count: items.length },
      { value: "used", label: "In use", count: usedCount },
      { value: "unused", label: "Unused", count: usageEligible.length - usedCount },
    ],
  }
  const groups = [
    ...(originGroup.options.filter((o) => o.value !== "all" && o.count > 0).length > 1
      ? [originGroup]
      : []),
    usageGroup,
  ]

  const filtered = items.filter((c) => {
    if (hasHost) {
      if (origin !== "all" && basisOf(c) !== origin) return false
    } else {
      // "foundation" selects the Synclair hub-skin; every other origin excludes
      // it (foundation items carry `origin: "custom"` but are a distinct axis).
      if (origin === "foundation") {
        if (c.layer !== "foundation") return false
      } else if (origin !== "all" && (c.origin !== origin || c.layer === "foundation")) {
        return false
      }
      if (usageFilter !== "all" && c.origin === "external") return false
    }
    if (usageFilter === "used" && !isUsed(c)) return false
    if (usageFilter === "unused" && isUsed(c)) return false
    return true
  })

  // Build display entries. Unscoped multi-surface: one entry per CONCEPT with
  // availability chips; a multi-implementation entry links the flat name URL
  // (the concept page). Scoped/single-surface: one entry per item.
  let entries: GalleryEntry[]
  if (!scope && multiSurface) {
    const byConcept = new Map<string, RegistryComponent[]>()
    for (const c of filtered) {
      const list = byConcept.get(c.concept) ?? []
      list.push(c)
      byConcept.set(c.concept, list)
    }
    entries = [...byConcept.values()].map((group) => {
      const primary =
        group.find((c) => getSurface(surfaceOf(c))?.platform === "web") ?? group[0]
      return {
        primary,
        href:
          group.length > 1
            ? `${t.path}/${primary.name}`
            : itemHref(kind, primary.name, surfaceOf(primary)),
        chips: group.map((c) => surfaceChip(surfaceOf(c))),
      }
    })
  } else {
    entries = filtered.map((c) => ({
      primary: c,
      // Inside a surface scope, inherited Shared items link WITHIN that surface
      // (not off to the Shared scope), so browsing stays put. The doc resolver
      // falls back to the shared item for these surface-scoped URLs.
      href: multiSurface
        ? itemHref(kind, c.name, scope && scope !== SHARED_SURFACE_ID ? scope : surfaceOf(c))
        : itemHref(kind, c.name),
      // Inside a surface scope, mark items that actually live in Shared.
      chips:
        scope && scope !== SHARED_SURFACE_ID && surfaceOf(c) === SHARED_SURFACE_ID
          ? ["Shared"]
          : undefined,
    }))
  }

  // Group entries by the primary item's first category.
  const grouped = new Map<string, GalleryEntry[]>()
  for (const e of entries) {
    const key = e.primary.categories[0] ? prettyCategory(e.primary.categories[0]) : UNCATEGORIZED
    const list = grouped.get(key) ?? []
    list.push(e)
    grouped.set(key, list)
  }
  const sections = [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  const isFiltered = origin !== "all" || usageFilter !== "all"
  const basePath = scope ? synclair(`/library/${scope}/${tierSlug(kind)}`) : t.path

  // Companion-mode coverage (anti-fiction, docs/rendering-parity.md): a live
  // scan of the host repo on every render, diffed against the catalog in both
  // directions — component files the catalog doesn't document, and cataloged
  // entries nothing in the host uses. Components tier only: the scan finds
  // component FILES; blocks/templates are the diggers' judgment tiering.
  const coverage = hasHost && kind === "component" ? await getHostCoverage() : []
  const uncatalogedCount = coverage.reduce((n, c) => n + c.uncataloged.length, 0)
  const unusedCount = coverage.reduce((n, c) => n + c.unusedCataloged.length, 0)
  // Documented but NOT RENDERED — cataloged host items with neither a live
  // preview scene (host-previews/registry) nor a screenshot example degrade to
  // a bare `<name />` placeholder card. Cataloging alone doesn't make an item
  // render; this count keeps that follow-up step (port-host-component Path A,
  // or a screenshot when the compat gate blocks importing) from being missed.
  // Every tier: blocks/templates get previews too, unlike the file scan above.
  const unrenderedCount = hasHost
    ? items.filter(
        (c) =>
          c.origin === "external" && !getHostPreview(c.name, c.surface) && !c.previewImage
      ).length
    : 0

  return (
    <main className="flex max-w-6xl flex-col gap-8 p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-base font-semibold">{t.label}</h1>
          <span className="text-muted-foreground font-mono text-xs">
            {hasHost
              ? `${items.length} ${t.label.toLowerCase()} · ${basisCount("shadcn")} shadcn · ${basisCount("custom")} custom · ${usedCount} in use`
              : `${
                  originCount("native") > 0
                    ? `${items.length} available · ${customLabelCount} custom`
                    : `${items.length} registered`
                }${
                  foundationVisible && foundationItemCount > 0
                    ? ` · ${foundationItemCount} from Synclair`
                    : ""
                } · ${usedCount} in use${
                  foundationCount > 0 && !scope ? ` · ${foundationCount} foundation hidden` : ""
                }`}
          </span>
        </div>
        <p className="text-muted-foreground max-w-2xl text-sm">{t.description}</p>
        {(uncatalogedCount > 0 || unusedCount > 0 || unrenderedCount > 0) && (
          <p className="text-muted-foreground/80 max-w-2xl text-xs">
            Live host scan:
            {uncatalogedCount > 0 && (
              <>
                {" "}
                <span className="text-foreground font-medium">{uncatalogedCount}</span>{" "}
                component file{uncatalogedCount === 1 ? "" : "s"} in the app{" "}
                {uncatalogedCount === 1 ? "isn't" : "aren't"} cataloged yet
                {(unusedCount > 0 || unrenderedCount > 0) && " ·"}
              </>
            )}
            {unusedCount > 0 && (
              <>
                {" "}
                <span className="text-foreground font-medium">{unusedCount}</span> cataloged
                but unused in the host
                {unrenderedCount > 0 && " ·"}
              </>
            )}
            {unrenderedCount > 0 && (
              <>
                {" "}
                <span className="text-foreground font-medium">{unrenderedCount}</span>{" "}
                documented but not rendered (no preview scene or screenshot)
              </>
            )}{" "}
            — triage with <code className="font-mono">npm run check:coverage</code>.
          </p>
        )}
        {items.length > 0 && (
          <FilterBar basePath={basePath} groups={groups} active={{ origin, usage: usageFilter }} />
        )}
      </div>

      {entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayoutTemplate />
            </EmptyMedia>
            {isFiltered ? (
              <>
                <EmptyTitle>Nothing matches these filters</EmptyTitle>
                <EmptyDescription>
                  No {t.label.toLowerCase()} match the current origin/usage
                  filters. <Link href={basePath}>Clear filters</Link>
                </EmptyDescription>
              </>
            ) : (
              <>
                <EmptyTitle>
                  No {scope ? `${surfaceLabel(scope)} ` : "project "}
                  {t.label.toLowerCase()} yet
                </EmptyTitle>
                <EmptyDescription>
                  {scope && scope !== SHARED_SURFACE_ID ? (
                    <>
                      Register the first with{" "}
                      <code>{`"meta": { "surface": "${scope}" }`}</code> in{" "}
                      <code>registry.json</code>, or catalog the host&rsquo;s via
                      the intake skill.
                    </>
                  ) : (
                    <>
                      This is the app&rsquo;s own design system. {t.label} appear
                      here as they&rsquo;re built and registered in{" "}
                      <code>registry.json</code>.
                      {!foundationVisible && foundationCount > 0 && (
                        <>
                          {" "}
                          Synclair&rsquo;s {foundationCount} foundation{" "}
                          {t.label.toLowerCase()} (Synclair&rsquo;s own UI)
                          are hidden here.
                        </>
                      )}
                    </>
                  )}
                </EmptyDescription>
              </>
            )}
          </EmptyHeader>
        </Empty>
      ) : (
        sections.map(([category, group]) => (
          <section key={category} className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold">{category}</h2>
              <span className="text-muted-foreground text-xs">{group.length}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((e) => (
                <ComponentCard
                  key={`${surfaceOf(e.primary)}:${e.primary.name}`}
                  component={e.primary}
                  usage={usage.get(e.primary.name)}
                  hostUsage={hostUsageOf(e.primary)}
                  href={e.href}
                  chips={e.chips}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  )
}

export type { ItemUsage }
