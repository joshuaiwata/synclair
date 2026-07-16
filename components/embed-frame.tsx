"use client"

import * as React from "react"

import {
  ViewportModeContext,
  VIEWPORT_WIDTHS,
} from "@/components/viewport-frame"

/**
 * Zoom-to-fit iframe for `embed` previews (Storybook-canvas semantics, the
 * iframe edition of CardThumb). The iframe renders at the LOGICAL device width
 * of the active ViewportFrame mode — 1280 when desktop/unframed — and scales
 * down to fit its container. Without this, a doc-column iframe (~620px) puts
 * responsive blocks into their MOBILE layout: the shadcn sidebar off-cavases
 * itself away and the "live preview" renders empty. Scaling keeps media
 * queries firing at the device width the switcher claims.
 */
const LOGICAL_DESKTOP = 1280

export function EmbedFrame({
  url,
  title,
  height = 480,
}: {
  url: string
  title?: string
  /** Visual height of the frame on the doc page. */
  height?: number
}) {
  const mode = React.useContext(ViewportModeContext)
  const ref = React.useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = React.useState<number | null>(null)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setContainerW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const device = VIEWPORT_WIDTHS[mode]
  const logical = device === "100%" ? LOGICAL_DESKTOP : device
  // Before measurement (SSR, first paint) fall back to the doc column's
  // typical content width — the iframe must ALWAYS render; it corrects on
  // the first ResizeObserver tick.
  const scale = Math.min(1, (containerW || 620) / logical)

  return (
    <div ref={ref} className="w-full overflow-hidden" style={{ height }}>
      <iframe
        src={url}
        title={title ?? "preview"}
        className="origin-top-left border-0"
        style={{
          width: logical,
          height: height / scale,
          transform: `scale(${scale})`,
        }}
      />
    </div>
  )
}
