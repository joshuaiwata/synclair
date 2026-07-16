import { notFound, redirect } from "next/navigation"

import { ComponentDocView } from "@/components/library/component-doc-view"
import { getSurface, isMultiSurface, SHARED_SURFACE_ID } from "@/lib/system/surfaces"
import { tierBySlug } from "@/lib/system/tiers"

export const dynamic = "force-dynamic"

/** A surface-scoped doc page — collision-free by construction (path carries the surface). */
export default async function ScopedItemPage({
  params,
}: {
  params: Promise<{ surface: string; tier: string; name: string }>
}) {
  const { surface, tier: tierSeg, name } = await params
  const t = tierBySlug(tierSeg)
  if (!t) notFound()
  if (!isMultiSurface()) redirect(`${t.path}/${name}`)
  if (!getSurface(surface) && surface !== SHARED_SURFACE_ID) notFound()
  return <ComponentDocView name={name} expectedKind={t.kind} surface={surface} />
}
