"use client"

import { EmbedFrame } from "@/components/embed-frame"
import { ViewportFrame } from "@/components/viewport-frame"

/**
 * The live page preview for a sitemap detail page: a browser-chrome bar over the
 * device-width switcher (`ViewportFrame`) wrapping the zoom-to-fit route iframe
 * (`EmbedFrame`). Nothing here is new machinery — it's the existing doc-page
 * `route()` embed, given a browser frame so a whole rendered view reads as "a
 * page" instead of a naked iframe. EmbedFrame renders the route at the logical
 * device width and scales it down, so the awkward page-inside-a-page-at-100% is
 * replaced by a clean zoomed-out render, and the mobile/tablet/desktop toggle
 * genuinely re-lays-out the route (the iframe viewport IS the device width).
 */
export function PageViewport({
  url,
  route,
  height = 600,
}: {
  /** The route/URL to frame (same-origin route, or host previewBaseUrl + route). */
  url: string
  /** The route path, shown in the browser chrome URL pill. */
  route: string
  /** Visual height of the frame. */
  height?: number
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="bg-muted/40 flex items-center gap-2 rounded-lg border px-3 py-1.5">
        <span className="flex shrink-0 gap-1.5" aria-hidden>
          <span className="bg-muted-foreground/25 size-2.5 rounded-full" />
          <span className="bg-muted-foreground/25 size-2.5 rounded-full" />
          <span className="bg-muted-foreground/25 size-2.5 rounded-full" />
        </span>
        <span className="bg-background text-muted-foreground min-w-0 flex-1 truncate rounded px-2 py-0.5 font-mono text-xs">
          {route}
        </span>
      </div>
      <ViewportFrame fullscreen>
        <EmbedFrame url={url} title={route} height={height} />
      </ViewportFrame>
    </div>
  )
}
