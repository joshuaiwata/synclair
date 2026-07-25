import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowRight } from "lucide-react"

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
  getSurface,
  isMultiSurface,
  SHARED_SURFACE_ID,
  surfaceLabel,
} from "@/lib/system/surfaces"
import { itemHref, TIERS, tierSlug } from "@/lib/system/tiers"

export const dynamic = "force-dynamic"

/**
 * A surface's HOME inside its scope — the "you've entered this workspace"
 * page: what this frontend is, and its sub-library as a small dashboard —
 * one card per tier (count, what the tier means, what's new), the surface's
 * app areas, and the latest arrivals. GitHub-repo-page analog for one app
 * surface (or the Shared packages root); same design language as the library
 * home's surface cards, one level down.
 */
export default async function SurfaceHomePage({
  params,
}: {
  params: Promise<{ surface: string }>
}) {
  if (!isMultiSurface()) redirect(synclair("/components"))
  const { surface: surfaceId } = await params
  const surface = getSurface(surfaceId)
  if (!surface && surfaceId !== SHARED_SURFACE_ID) notFound()

  const catalog = await getCatalog()
  const foundationVisible = await isFoundationVisible()
  const surfaceOf = (c: RegistryComponent) => c.surface ?? defaultSurfaceId()
  const items = catalog.filter(
    (c) => isLibraryVisible(c, foundationVisible) && surfaceOf(c) === surfaceId
  )

  // App areas across every tier (item-meta) — the surface's product shape.
  // "General" (the no-convention catch-all) sorts last however big it is.
  const byArea = new Map<string, number>()
  for (const c of items) byArea.set(itemArea(c.files), (byArea.get(itemArea(c.files)) ?? 0) + 1)
  const areas = [...byArea.entries()].sort(
    (a, b) => Number(a[0] === "General") - Number(b[0] === "General") || b[1] - a[1]
  )

  // Latest arrivals — the 48h recency window, newest first.
  const fresh = items
    .filter((c) => isNewlyAdded(c.addedAt))
    .sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""))

  return (
    <div className="page-enter mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8 md:px-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{surfaceLabel(surfaceId)}</h1>
        <p className="text-muted-foreground text-sm">
          {surfaceId === SHARED_SURFACE_ID
            ? "Monorepo packages consumed by several surfaces. Shared items also appear inside each surface's library, badged."
            : `${surface?.framework ?? "—"} · ${items.length} library items`}
        </p>
        {surface?.root && (
          <span className="text-muted-foreground/70 font-mono text-2xs">{surface.root}</span>
        )}
      </div>

      {/* One card per tier — the same jumping-off treatment as the library
          home, one level down. Whole card links into the scoped gallery. */}
      <div className="stagger-children grid gap-4 sm:grid-cols-3">
        {TIERS.map((t) => {
          const ofTier = items.filter((c) => c.kind === t.kind)
          const freshCount = ofTier.filter((c) => isNewlyAdded(c.addedAt)).length
          return (
            <div key={t.kind} className="group relative">
              <Card className="group-hover:border-foreground/20 card-lift flex h-full flex-col gap-3 p-5">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-3xl tabular-nums">{ofTier.length}</span>
                  {freshCount > 0 && (
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="bg-info size-1.5 rounded-full" />
                      <span className="text-muted-foreground">{freshCount} new</span>
                    </span>
                  )}
                  <ArrowRight className="text-muted-foreground ml-auto size-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="flex flex-col gap-1">
                  <h2 className="text-sm font-medium">{t.label}</h2>
                  <p className="text-muted-foreground text-xs">{t.description}</p>
                </div>
              </Card>
              <Link
                href={synclair(`/library/${surfaceId}/${tierSlug(t.kind)}`)}
                className="absolute inset-0"
                aria-label={`${t.label} — ${surfaceLabel(surfaceId)}`}
              >
                <span className="sr-only">{t.label}</span>
              </Link>
            </div>
          )
        })}
      </div>

      {/* The surface's app areas — each chip jumps into the blocks gallery
          grouped by area (components tier when the surface has no blocks). */}
      {areas.length > 1 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">
            App areas
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {areas.map(([area, n]) => (
              <Link
                key={area}
                href={synclair(
                  `/library/${surfaceId}/${tierSlug(
                    items.some((c) => c.kind === "block") ? "block" : "component"
                  )}?group=area`
                )}
                className="hover:bg-muted/50 rounded-md border px-2.5 py-1 text-xs"
              >
                {area} <span className="text-muted-foreground font-mono">{n}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Latest arrivals — what entered the catalog in the last 48 hours. */}
      {fresh.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground flex items-center gap-1.5 text-2xs font-medium tracking-wide uppercase">
            <span className="bg-info size-1.5 rounded-full" />
            New in the last 48 hours
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {fresh.slice(0, 12).map((c) => (
              <Link
                key={`${c.kind}:${c.name}`}
                href={itemHref(c.kind, c.name, surfaceId)}
                className="hover:bg-muted/50 rounded-md border px-2.5 py-1 font-mono text-xs"
              >
                {c.name}
                <span className="text-muted-foreground/70 ml-1.5 text-2xs">{c.kind}</span>
              </Link>
            ))}
            {fresh.length > 12 && (
              <span className="text-muted-foreground self-center text-xs">
                +{fresh.length - 12} more
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
