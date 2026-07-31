"use client"

import * as React from "react"
import {
  Check,
  Code2,
  Copy,
  Maximize2,
  Monitor,
  Moon,
  Smartphone,
  Sun,
  Tablet,
  Tv,
} from "lucide-react"
import { useTheme } from "next-themes"

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

/** The default mode set per tier: components skip the 1920 wide mode. */
export const COMPONENT_MODES: ViewportMode[] = ["desktop", "tablet", "mobile"]

/**
 * Logical stage width for the fluid modes (desktop/fullscreen) when `zoom` is
 * on — matches EmbedFrame's logical desktop so an inline block and an embedded
 * route read as the same "desktop" on a doc page.
 */
const LOGICAL_DESKTOP = 1280

/**
 * Zoom-to-fit stage for inline previews — the JSX edition of EmbedFrame's
 * scaling (which only works for `embed`/iframe previews). The stage lays the
 * children out at a stage width and scales down (never up) to fit the doc
 * column, so a whole workspace block reads as a zoomed-out screen instead of
 * cramming into the column, and "Wide (1920px)" genuinely imitates a
 * widescreen layout rather than growing a horizontal scrollbar.
 *
 * The zoom is CONDITIONAL — small pieces don't need it:
 * - Explicit device modes (wide/tablet/mobile) always lay out at the device
 *   width — picking "wide" means "show me the 1920 layout", scaled to fit.
 * - The fluid modes (desktop/fullscreen) first probe the content's natural
 *   (max-content) width. Content that FITS the column renders plain — no
 *   blow-up, no transform, natural height — identical to the normal stage.
 *   Only a layout that wants MORE width than the column gets the stage
 *   treatment: laid out at its natural width (capped at the 1280 logical
 *   desktop) and scaled down.
 * The stage box is height-cropped to `natural × scale` only when actually
 * scaled, so the frame hugs the content instead of reserving dead space.
 */
function ZoomStage({
  mode,
  children,
}: {
  mode: ViewportMode
  children: React.ReactNode
}) {
  const measureRef = React.useRef<HTMLDivElement>(null)
  const innerRef = React.useRef<HTMLDivElement>(null)
  // stageW null = plain flow (content fits — no fixed width, no transform).
  const [stage, setStage] = React.useState<{
    stageW: number | null
    scale: number
    innerH: number | null
  }>({ stageW: null, scale: 1, innerH: null })

  const device = VIEWPORT_WIDTHS[mode]
  const fluid = device === "100%"

  React.useLayoutEffect(() => {
    const measure = measureRef.current
    const inner = innerRef.current
    if (!measure || !inner) return
    const fit = () => {
      const containerW = measure.clientWidth
      let stageW: number | null
      if (fluid) {
        // Probe the natural (max-content) width. The mutation is reverted
        // synchronously before this frame paints, so ResizeObserver never
        // sees it (no observe-mutate loop) and nothing flickers.
        const prev = inner.style.width
        inner.style.width = "max-content"
        const naturalW = inner.scrollWidth
        inner.style.width = prev
        // 1.2: fluid content within ~20% of the column compresses gracefully
        // (text wraps a little more) and stays crisp at 1:1 — only a layout
        // meaningfully wider than the column is worth shrinking to fit.
        stageW =
          naturalW > containerW * 1.2
            ? Math.min(naturalW, LOGICAL_DESKTOP)
            : null
      } else {
        stageW = device
      }
      const scale = stageW ? Math.min(1, containerW / stageW) : 1
      // Natural content height, independent of the transform — when scaled,
      // the sized box crops to height × scale so the stage doesn't reserve
      // the unscaled height as empty space.
      setStage({ stageW, scale, innerH: inner.scrollHeight })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(measure)
    ro.observe(inner)
    return () => ro.disconnect()
  }, [fluid, device])

  const { stageW, scale, innerH } = stage
  const scaled = stageW !== null && scale < 1

  return (
    <div ref={measureRef} className="w-full">
      <div
        className={cn("mx-auto", scaled && "overflow-hidden")}
        style={{
          width: stageW ? stageW * scale : undefined,
          height: scaled && innerH ? innerH * scale : undefined,
        }}
      >
        <div
          ref={innerRef}
          className="flex min-h-24 origin-top-left flex-wrap items-center justify-center gap-4"
          style={
            stageW
              ? { width: stageW, transform: scaled ? `scale(${scale})` : undefined }
              : undefined
          }
        >
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * The documentation preview stage — Storybook canvas semantics for doc pages:
 * a toolbar (device-width switcher, stage light/dark toggle, code toggle) above
 * a dot-grid stage that renders the real thing. One component, so every doc's
 * preview looks and behaves the same.
 *
 * - `code` adds a Code toggle + copy button; the snippet lives behind the
 *   toolbar instead of permanently below the preview.
 * - `themeToggle` (default on) previews the stage in the opposite theme by
 *   scoping a `.dark` wrapper — the stage flips, the page doesn't.
 * - `modes` narrows the device set (components use COMPONENT_MODES — a 1920px
 *   lane says nothing about a button).
 * - `zoom` swaps the width-clamp mechanism for ZoomStage's lay-out-then-scale-
 *   down-to-fit (conditional: content that fits the column renders plain) —
 *   for blocks/templates, mirroring how the sitemap zooms whole pages.
 */
export function ViewportFrame({
  children,
  defaultMode = "desktop",
  fullscreen = false,
  modes: allowedModes,
  zoom = false,
  code,
  themeToggle = true,
  className,
}: {
  children: React.ReactNode
  defaultMode?: ViewportMode
  /** Offer the fullscreen mode (templates); off for inline block previews. */
  fullscreen?: boolean
  /** Narrow the device set (e.g. COMPONENT_MODES). Default: all widths. */
  modes?: ViewportMode[]
  /** Zoom-to-fit (ZoomStage): device modes lay out at the device width and
      scale down to fit the column; the fluid desktop mode does so only when
      the content's natural width outgrows the column — small pieces render
      plain. For blocks/templates. */
  zoom?: boolean
  /** The example's source — adds the Code toggle + copy button. */
  code?: string
  /** Offer the stage light/dark flip (default on). */
  themeToggle?: boolean
  className?: string
}) {
  const [mode, setMode] = React.useState<ViewportMode>(defaultMode)
  // The stage follows the app theme until flipped; flipping shows the OPPOSITE
  // theme via a scoped `.dark`/`.light` wrapper (see globals.css), so the flip
  // works from either app theme.
  const [stageFlipped, setStageFlipped] = React.useState(false)
  const { resolvedTheme } = useTheme()
  const appDark = resolvedTheme === "dark"
  const stageDark = stageFlipped ? !appDark : appDark
  const [showCode, setShowCode] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const copyTimer = React.useRef<number | undefined>(undefined)
  const width = VIEWPORT_WIDTHS[mode]
  const modes = MODES.filter(({ mode: m }) =>
    m === "fullscreen" ? fullscreen : (allowedModes?.includes(m) ?? true)
  )

  React.useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  const copy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      // Insecure origins (e.g. the hub over LAN) have no clipboard API — fall
      // back to the selection-based copy.
      const ta = document.createElement("textarea")
      ta.value = code
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      ta.remove()
    }
    setCopied(true)
    window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        mode === "fullscreen" && "bg-background fixed inset-0 z-50 overflow-auto p-6",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">
          Preview
        </span>
        <div className="flex items-center gap-1.5">
          {themeToggle && (
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-pressed={stageFlipped}
              title={stageDark ? "Stage: dark (switch to light)" : "Stage: light (switch to dark)"}
              onClick={() => setStageFlipped((f) => !f)}
            >
              {stageDark ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
              <span className="sr-only">Toggle stage theme</span>
            </Button>
          )}
          {modes.length > 1 && (
            <div
              className="flex items-center gap-0.5 rounded-md border p-0.5"
              role="group"
              aria-label="Preview viewport"
            >
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
          )}
          {code && (
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-6 gap-1 px-1.5 font-mono text-2xs", showCode && "bg-muted")}
              aria-pressed={showCode}
              onClick={() => setShowCode((s) => !s)}
            >
              <Code2 className="size-3.5" />
              Code
            </Button>
          )}
        </div>
      </div>
      <div className="w-full">
        <div
          className={cn(
            "stage-canvas mx-auto overflow-auto rounded-lg border transition-[width] duration-200 ease-out",
            stageFlipped && (stageDark ? "dark" : "light"),
            mode === "mobile" || mode === "tablet" ? "max-h-[70vh] min-h-48" : "min-h-24"
          )}
          style={{
            width: zoom || width === "100%" ? "100%" : width,
            maxWidth: "100%",
          }}
        >
          {zoom ? (
            // Zoom-to-fit: the stage stays column-width; ZoomStage lays the
            // preview out at the logical device width and scales it down.
            <div className="text-foreground p-6">
              <ViewportModeContext.Provider value={mode}>
                <ZoomStage mode={mode}>{children}</ZoomStage>
              </ViewportModeContext.Provider>
            </div>
          ) : (
            <div className="text-foreground flex min-h-24 flex-wrap items-center justify-center gap-4 p-6">
              <ViewportModeContext.Provider value={mode}>{children}</ViewportModeContext.Provider>
            </div>
          )}
        </div>
      </div>
      {code && showCode && (
        <div className="relative">
          <pre className="overflow-x-auto rounded-lg border bg-muted/60 p-3 pr-10 font-mono text-xs">
            <code>{code}</code>
          </pre>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1.5 right-1.5 size-6"
            title="Copy code"
            onClick={copy}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            <span className="sr-only">Copy code</span>
          </Button>
        </div>
      )}
    </div>
  )
}
