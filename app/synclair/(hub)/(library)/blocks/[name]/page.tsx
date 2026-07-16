import { redirect } from "next/navigation"

import { ComponentDocView } from "@/components/library/component-doc-view"
import { synclair } from "@/lib/system/routes"

export const dynamic = "force-dynamic"

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>
  searchParams: Promise<{ surface?: string }>
}) {
  const { name } = await params
  const { surface } = await searchParams
  // Legacy deep links from the first-pass ?surface= UI land on the scoped path.
  if (surface) redirect(synclair(`/library/${surface}/blocks/${name}`))
  return <ComponentDocView name={name} expectedKind="block" />
}
