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
 */
export function ViewportFrame({
  children,
  defaultMode = "desktop",
  fullscreen = false,
  modes: allowedModes,
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
          style={{ width: width === "100%" ? "100%" : width, maxWidth: "100%" }}
        >
          <div className="text-foreground flex min-h-24 flex-wrap items-center justify-center gap-4 p-6">
            <ViewportModeContext.Provider value={mode}>{children}</ViewportModeContext.Provider>
          </div>
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
