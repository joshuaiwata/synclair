"use client"

import { useLayoutEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

/**
 * Zoom-to-fit thumbnail for gallery cards: renders the preview at natural size,
 * measures it, and scales it down (never up) to fit the card's media box —
 * Storybook-canvas semantics. Replaces the old fixed `scale-90`, which clipped
 * any preview taller than the frame (sidebar, wireframes, definition lists).
 * Re-measures on resize so responsive galleries stay fitted.
 */
export function CardThumb({ children, className }: { children: React.ReactNode; className?: string }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    const fit = () => {
      // scrollWidth/Height = natural content size, independent of the transform.
      const w = inner.scrollWidth
      const h = inner.scrollHeight
      if (!w || !h) return
      // Breathing room so edges never kiss the frame; floor keeps degenerate
      // measurements from blanking the thumb.
      const next = Math.min(1, (outer.clientWidth * 0.9) / w, (outer.clientHeight * 0.9) / h)
      setScale(Math.max(next, 0.2))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(outer)
    ro.observe(inner)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={outerRef}
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden",
        className
      )}
    >
      <div ref={innerRef} className="flex w-max max-w-none items-center justify-center" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  )
}
