import { notFound, redirect } from "next/navigation"

import { TierGallery, type GalleryFilters } from "@/components/library/tier-gallery"
import { synclair } from "@/lib/system/routes"
import { getSurface, isMultiSurface, SHARED_SURFACE_ID } from "@/lib/system/surfaces"
import { tierBySlug } from "@/lib/system/tiers"

export const dynamic = "force-dynamic"

/** A surface-scoped tier gallery: /synclair/library/<surface>/<components|blocks|templates>. */
export default async function ScopedTierPage({
  params,
  searchParams,
}: {
  params: Promise<{ surface: string; tier: string }>
  searchParams: Promise<GalleryFilters>
}) {
  if (!isMultiSurface()) redirect(synclair("/components"))
  const { surface, tier: tierSeg } = await params
  const t = tierBySlug(tierSeg)
  if (!t) notFound()
  if (!getSurface(surface) && surface !== SHARED_SURFACE_ID) notFound()
  const { origin, usage } = await searchParams
  return <TierGallery kind={t.kind} filters={{ origin, usage }} scope={surface} />
}
