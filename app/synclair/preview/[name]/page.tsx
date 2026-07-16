import { notFound } from "next/navigation"

import { getPreviewScene } from "@/components/library/preview-scenes"
import { SidebarProvider } from "@/components/ui/sidebar"

export const dynamic = "force-dynamic"

/**
 * Chrome-free stage for preview scenes: renders one self-referential block's
 * REAL composition standalone, so its doc page can embed it via `scene()`.
 * Lives outside the `(hub)` route group on purpose — no sidebar, no palette,
 * just the block. Scenes: `components/library/preview-scenes.tsx`.
 *
 * SidebarProvider mirrors the ambient context the hub layout gives every
 * page — previews of sidebar-flavored pieces (a SidebarTrigger in a breadcrumb,
 * the native `sidebar` primitive's card preview) throw without it.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  const { name } = await params
  const scene = getPreviewScene(name)
  if (!scene) notFound()
  return (
    <div className="bg-background min-h-svh">
      <SidebarProvider>{await scene()}</SidebarProvider>
    </div>
  )
}
