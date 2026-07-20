"use client"

import * as React from "react"
import { Maximize2, Monitor, Smartphone, Tablet, Tv } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The canonical doc viewports. Widths are the industry-standard device
 * checkpoints (and match the responsive vocabulary in DocResponsiveRule):
 * mobile 375, tablet 768, desktop = container width, wide = 1920 (large
 * monitors). "fullscreen" exists so a dense template preview can escape the
 * doc column.
 *
 * Mechanism is CSS WIDTH, not an iframe: the frame constrains its own width and
 * the embedded tree reflows. Cheap and animated, but media queries don't fire —
 * container-driven layouts reflow correctly, `md:`/`lg:` classes don't. For
 * full-fidelity responsive previews of whole templates, use an `embed` preview
 * (real route in an iframe) inside this frame — the iframe viewport IS the
 * frame width, so media queries fire at the device width.
 */
export type ViewportMode = "mobile" | "tablet" | "desktop" | "wide" | "fullscreen"

export const VIEWPORT_WIDTHS: Record<ViewportMode, number | "100%"> = {
  mobile: 375,
  tablet: 768,
  desktop: "100%",
  wide: 1920,
  fullscreen: "100%",
}

/**
 * The active device mode, provided to previews inside the frame. EmbedFrame
 * reads it to render its iframe at the LOGICAL device width (scaled to fit),
 * so an embedded scene lays out for the chosen device even when the doc
 * column is narrower than the device.
 */
export const ViewportModeContext = React.createContext<ViewportMode>("desktop")

const MODES: { mode: ViewportMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { mode: "wide", label: "Wide (1920px)", icon: Tv },
  { mode: "desktop", label: "Desktop", icon: Monitor },
  { mode: "tablet", label: "Tablet (768px)", icon: Tablet },
  { mode: "mobile", label: "Mobile (375px)", icon: Smartphone },
  { mode: "fullscreen", label: "Fullscreen", icon: Maximize2 },
]

/**
 * Device-width switcher for documentation previews: a segmented toggle
 * (desktop / tablet / mobile / fullscreen) above a width-constrained frame.
 * The standard wrapper for block and template previews on doc pages — one
 * component, so every doc's responsive story looks and behaves the same.
 */
export function ViewportFrame({
  children,
  defaultMode = "desktop",
  fullscreen = false,
  className,
}: {
  children: React.ReactNode
  defaultMode?: ViewportMode
  /** Offer the fullscreen mode (templates); off for inline block previews. */
  fullscreen?: boolean
  className?: string
}) {
  const [mode, setMode] = React.useState<ViewportMode>(defaultMode)
  const width = VIEWPORT_WIDTHS[mode]
  const modes = fullscreen ? MODES : MODES.filter((m) => m.mode !== "fullscreen")

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        mode === "fullscreen" && "bg-background fixed inset-0 z-50 overflow-auto p-6",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">
          Preview
        </span>
        <div className="flex items-center gap-0.5 rounded-md border p-0.5" role="group" aria-label="Preview viewport">
          {modes.map(({ mode: m, label, icon: Icon }) => (
            <Button
              key={m}
              variant="ghost"
              size="icon"
              className={cn("size-6", mode === m && "bg-muted")}
              aria-pressed={mode === m}
              title={label}
              onClick={() => setMode(mode === m && m === "fullscreen" ? "desktop" : m)}
            >
              <Icon className="size-3.5" />
              <span className="sr-only">{label}</span>
            </Button>
          ))}
        </div>
      </div>
      <div className="w-full">
        <div
          className={cn(
            "bg-muted/40 mx-auto overflow-auto rounded-lg border border-dashed p-6 transition-[width] duration-200 ease-out",
            mode === "mobile" || mode === "tablet" ? "max-h-[70vh] min-h-48" : "min-h-24"
          )}
          style={{ width: width === "100%" ? "100%" : width, maxWidth: "100%" }}
        >
          <ViewportModeContext.Provider value={mode}>
            {children}
          </ViewportModeContext.Provider>
        </div>
      </div>
    </div>
  )
}
