"use client"

import * as React from "react"

import { EmbedFrame } from "@/components/embed-frame"

/**
 * A lazy live thumbnail of a route for the sitemap gallery — the same
 * zoom-to-fit `EmbedFrame` used on detail pages, but (a) mounted only once
 * scrolled into view (IntersectionObserver) so a gallery of N pages never spins
 * up N iframes at once, and (b) `pointer-events-none` so the whole card stays a
 * single click target. EmbedFrame reads the default desktop viewport context, so
 * the thumbnail shows the full desktop render scaled down into the card.
 */
export function PageThumb({
  url,
  title,
  height = 160,
}: {
  url: string
  title?: string
  height?: number
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: "300px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="stage-canvas pointer-events-none overflow-hidden border-b"
      style={{ height }}
    >
      {visible ? <EmbedFrame url={url} title={title} height={height} /> : null}
    </div>
  )
}
