import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  getCatalog,
  isFoundationVisible,
  isLibraryVisible,
  type RegistryComponent,
} from "@/lib/system/components"
import { isNewlyAdded, itemArea } from "@/lib/system/item-meta"
import { synclair } from "@/lib/system/routes"
import {
  defaultSurfaceId,
  getSurfaces,
  isMultiSurface,
  PLATFORM_BADGE,
  SHARED_SURFACE_ID,
} from "@/lib/system/surfaces"
import { TIERS, tierSlug } from "@/lib/system/tiers"

export const dynamic = "force-dynamic"

/**
 * The LIBRARY HOME for multi-surface projects — the "org page": one CARD per
 * app surface (plus Shared), each a small dashboard of that sub-library —
 * per-tier counts, its app areas, and what's new — entered like entering a
 * repo. A dashboard, not a data table: on this route the explorer rail is
 * hidden (library-explorer), so this page IS the jumping-off point.
 * Single-surface projects never see this (redirect to the components
 * gallery — the tree is their whole structure).
 */
export default async function LibraryHomePage() {
  if (!isMultiSurface()) redirect(synclair("/components"))

  const catalog = await getCatalog()
  const foundationVisible = await isFoundationVisible()
  const items = catalog.filter((c) => isLibraryVisible(c, foundationVisible))
  const surfaceOf = (c: RegistryComponent) => c.surface ?? defaultSurfaceId()
  const surfaces = getSurfaces()
  const sharedItems = items.filter((c) => surfaceOf(c) === SHARED_SURFACE_ID)

  const cards = [
    ...surfaces.map((s) => ({
      id: s.id,
      label: s.label,
      badge: PLATFORM_BADGE[s.platform],
      stack: s.framework ?? "—",
      root: s.root,
      items: items.filter((c) => surfaceOf(c) === s.id),
    })),
    ...(sharedItems.length > 0
      ? [
          {
            id: SHARED_SURFACE_ID,
            label: "Shared",
            badge: "pkg",
            stack: "consumed by several surfaces",
            root: undefined as string | undefined,
            items: sharedItems,
          },
        ]
      : []),
  ]
  const countBy = (of: RegistryComponent[], kind: string) =>
    of.filter((c) => c.kind === kind).length
  // Top app areas across the surface's items (item-meta), largest first —
  // the same axis as the galleries' "By app area" grouping. "General" is the
  // no-convention catch-all, so it sorts last however big it is.
  const areasOf = (of: RegistryComponent[]) => {
    const byArea = new Map<string, number>()
    for (const c of of) byArea.set(itemArea(c.files), (byArea.get(itemArea(c.files)) ?? 0) + 1)
    return [...byArea.entries()].sort(
      (a, b) => Number(a[0] === "General") - Number(b[0] === "General") || b[1] - a[1]
    )
  }

  return (
    <div className="page-enter mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 md:px-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Library</h1>
        <p className="text-body-content max-w-2xl text-base">
          This project ships {surfaces.length} app surfaces
          {sharedItems.length > 0 && " plus shared packages"}, each with its own component
          library. Enter one below.
        </p>
      </div>

      <div className="stagger-children grid gap-4 sm:grid-cols-2">
        {cards.map((card) => {
          const areas = areasOf(card.items)
          const fresh = card.items.filter((c) => isNewlyAdded(c.addedAt)).length
          const empty = card.items.length === 0
          return (
            <div key={card.id} className="group relative">
              <Card className="group-hover:border-foreground/20 card-lift flex h-full flex-col gap-4 p-5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h2 className="text-lg font-semibold tracking-tight">{card.label}</h2>
                  <Badge variant="secondary" className="text-3xs">
                    {card.badge}
                  </Badge>
                  <span className="text-muted-foreground ml-auto text-xs">{card.stack}</span>
                </div>

                {empty ? (
                  <p className="text-muted-foreground text-sm">
                    Not cataloged yet — nothing from this surface is in the library. The
                    intake skill populates it.
                  </p>
                ) : (
                  <>
                    {/* Per-tier stat row — each count is a real link into that
                        scoped gallery, sitting ABOVE the card overlay. */}
                    <div className="flex gap-8">
                      {TIERS.map((t) => {
                        const n = countBy(card.items, t.kind)
                        return (
                          <Link
                            key={t.kind}
                            href={synclair(`/library/${card.id}/${tierSlug(t.kind)}`)}
                            className="relative z-10 flex flex-col gap-0.5"
                          >
                            <span className="font-mono text-2xl tabular-nums">{n}</span>
                            <span className="text-muted-foreground text-xs underline-offset-2 hover:underline">
                              {t.label}
                            </span>
                          </Link>
                        )
                      })}
                      {fresh > 0 && (
                        <span className="ml-auto flex items-center gap-1.5 self-start text-xs">
                          <span className="bg-info size-1.5 rounded-full" />
                          <span className="text-muted-foreground">
                            {fresh} new in 48h
                          </span>
                        </span>
                      )}
                    </div>

                    {/* App areas — the surface's product shape at a glance
                        (same derivation as the galleries' By-app-area view). */}
                    <div className="flex flex-wrap gap-1.5">
                      {areas.slice(0, 5).map(([area, n]) => (
                        <Badge
                          key={area}
                          variant="outline"
                          className="text-muted-foreground text-3xs"
                        >
                          {area} · {n}
                        </Badge>
                      ))}
                      {areas.length > 5 && (
                        <Badge variant="outline" className="text-muted-foreground/70 text-3xs">
                          +{areas.length - 5} more
                        </Badge>
                      )}
                    </div>
                  </>
                )}

                {card.root && (
                  <span className="text-muted-foreground/70 mt-auto font-mono text-2xs">
                    {card.root}
                  </span>
                )}
              </Card>
              {/* Whole-card link (overlay, ComponentCard pattern): enter the
                  surface. Tier links above sit at z-10 to stay clickable. */}
              <Link
                href={synclair(`/library/${card.id}`)}
                className="absolute inset-0"
                aria-label={`Enter ${card.label}`}
              >
                <span className="sr-only">Enter {card.label}</span>
              </Link>
            </div>
          )
        })}
      </div>

      <p className="text-muted-foreground text-xs">
        {items.length} items across {cards.length} roots
        {sharedItems.length > 0 && ` · ${sharedItems.length} shared`}. All-surfaces view:{" "}
        {TIERS.map((t, i) => (
          <span key={t.kind}>
            {i > 0 && " · "}
            <Link href={t.path} className="underline underline-offset-2">
              {t.label}
            </Link>
          </span>
        ))}
      </p>
    </div>
  )
}
