import { redirect } from "next/navigation"

import { TierGallery, type GalleryFilters } from "@/components/library/tier-gallery"
import { synclair } from "@/lib/system/routes"

export const dynamic = "force-dynamic"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<GalleryFilters>
}) {
  const { origin, usage, surface } = await searchParams
  // Legacy deep links from the first-pass ?surface= UI land on the scoped path.
  if (surface && surface !== "all") redirect(synclair(`/library/${surface}/blocks`))
  return <TierGallery kind="block" filters={{ origin, usage }} />
}
