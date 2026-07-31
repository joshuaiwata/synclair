import { TabsNav, type TabsNavOption } from "@/components/tabs-nav"
import {
  getSurfaces,
  isMultiSurface,
  SHARED_SURFACE_ID,
  surfaceLabel,
} from "@/lib/system/surfaces"
import { cn } from "@/lib/utils"

/**
 * SurfaceSwitcher — THE one control for flipping between a multi-frontend
 * project's app surfaces (web app, companion app, shared packages), everywhere
 * a view can be scoped to one: tier galleries, the pages sitemap, any future
 * scoped surface. One component so the switch reads identically across the hub
 * instead of each page inventing its own (a rail select here, nothing there).
 *
 * Renders nothing for single-surface projects — the `isMultiSurface()` gate
 * lives inside, so callers place it unconditionally and single-app clones pay
 * zero chrome. URL-driven (`TabsNav`), so it works from server components and
 * every scope deep-links.
 */
export function SurfaceSwitcher({
  active,
  hrefFor,
  allHref,
  counts,
  includeShared = false,
  className,
  "aria-label": ariaLabel = "Surface",
}: {
  /** The active surface id; undefined = the "all surfaces" view. */
  active?: string
  /** Where a surface's scoped view lives (also called for SHARED_SURFACE_ID). */
  hrefFor: (surfaceId: string) => string
  /** The unscoped "all surfaces" view; omit to hide that tab. */
  allHref?: string
  /** Optional per-surface item counts, keyed by surface id. */
  counts?: Record<string, number>
  /** Offer the Shared (packages) scope as its own tab. */
  includeShared?: boolean
  className?: string
  "aria-label"?: string
}) {
  if (!isMultiSurface()) return null

  const options: TabsNavOption[] = []
  if (allHref) options.push({ value: "all", label: "All surfaces", href: allHref })
  for (const s of getSurfaces())
    options.push({ value: s.id, label: s.label, href: hrefFor(s.id), count: counts?.[s.id] })
  if (includeShared)
    options.push({
      value: SHARED_SURFACE_ID,
      label: surfaceLabel(SHARED_SURFACE_ID),
      href: hrefFor(SHARED_SURFACE_ID),
      count: counts?.[SHARED_SURFACE_ID],
    })

  return (
    <TabsNav
      aria-label={ariaLabel}
      value={active ?? "all"}
      options={options}
      className={cn("max-w-full overflow-x-auto", className)}
    />
  )
}
