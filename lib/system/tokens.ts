/**
 * Design-token reference — the single source of truth for the Foundations pages
 * AND the canonical vocabulary the AI consults before styling anything.
 *
 * Values here are DOCUMENTATION (light mode). The Foundations swatches render
 * live from the theme via the Tailwind classes below, so the visuals can never
 * drift from `app/globals.css`. When you add or change a theme token, update it
 * here too so humans and the AI keep styling consistently.
 *
 * Rule of thumb: reach for a SEMANTIC token first (primary, muted, border…).
 * Only drop to the raw brand ramp for bespoke accents the semantics can't cover.
 */

import { BRAND_RAMPS } from "./seed/brand-ramps"

export interface ColorToken {
  /** Token name (matches the CSS var and Tailwind color, e.g. "primary"). */
  name: string
  /** Class that fills a swatch, e.g. "bg-primary". */
  bg: string
  /** Documented light-mode value. */
  value: string
  /** When to reach for it — written to be AI-actionable. */
  usage: string
  /** Render a hairline on the swatch (for near-white fills). */
  outline?: boolean
}

export interface ColorGroup {
  id: string
  label: string
  hint?: string
  tokens: ColorToken[]
}

/**
 * The portable token vocabulary (semantic + status + chart) — Synclair's OWN
 * chrome. In existing-project/companion mode these style SYNCLAIR, not the
 * product (the host's palette lives in `BRAND_RAMPS`); Foundations labels them
 * accordingly. In new-project mode the clone IS the product, so they're the
 * project's tokens directly.
 *
 * DUAL-SOURCE WARNING: each swatch renders from its `bg-*` CSS var (defined in
 * `app/globals.css`) while its `value` here is a documented hex LABEL. When you
 * RESEED the semantic theme (new-project mode), change BOTH — the var in
 * globals.css AND the `value` below — or the swatch and its label drift apart.
 * (Brand ramps sidestep this: they use `bg-[#hex]`, so swatch and label share
 * one source. Companion mode never reseeds these, so it can't drift.)
 */
export const BASE_COLOR_GROUPS: ColorGroup[] = [
  {
    id: "semantic",
    label: "Semantic",
    hint: "reach for these first",
    tokens: [
      { name: "background", bg: "bg-background", value: "#fafaf9", usage: "App canvas — one step tinted so white cards read as raised surfaces.", outline: true },
      { name: "foreground", bg: "bg-foreground", value: "#0c0a09", usage: "High-emphasis text: headings, key labels, active values." },
      { name: "body-content", bg: "bg-body-content", value: "#44403ccc", usage: "Softer body/reading text — one step gentler than foreground. Prefer for long-form copy and paragraph text." },
      { name: "card", bg: "bg-card", value: "#ffffff", usage: "Raised surfaces: cards, panels, popover bodies.", outline: true },
      { name: "card-foreground", bg: "bg-card-foreground", value: "#0c0a09", usage: "Text on card surfaces." },
      { name: "popover", bg: "bg-popover", value: "#ffffff", usage: "Floating surfaces: dropdowns, tooltips, menus.", outline: true },
      { name: "popover-foreground", bg: "bg-popover-foreground", value: "#0c0a09", usage: "Text inside popovers." },
      { name: "primary", bg: "bg-primary", value: "#1c1917", usage: "Primary actions, active nav, key emphasis. Pair with text-primary-foreground." },
      { name: "primary-foreground", bg: "bg-primary-foreground", value: "#fafaf9", usage: "Text/icons on a primary fill.", outline: true },
      { name: "secondary", bg: "bg-secondary", value: "#f5f5f4", usage: "Secondary emphasis, highlights, brand accents — the slot a project's brand color reseeds into. Pair with text-secondary-foreground.", outline: true },
      { name: "secondary-foreground", bg: "bg-secondary-foreground", value: "#1c1917", usage: "Text/icons on a secondary fill." },
      { name: "muted", bg: "bg-muted", value: "#f5f5f4", usage: "Subtle fills: hover states, disabled, zebra rows.", outline: true },
      { name: "muted-foreground", bg: "bg-muted-foreground", value: "#78716c", usage: "Secondary/help text, placeholders, muted icons." },
      { name: "accent", bg: "bg-accent", value: "#f5f5f4", usage: "Hover / selected background for interactive items.", outline: true },
      { name: "accent-foreground", bg: "bg-accent-foreground", value: "#1c1917", usage: "Text on an accent background." },
      { name: "destructive", bg: "bg-destructive", value: "#dc2626", usage: "Errors and destructive actions (delete, remove)." },
      { name: "destructive-foreground", bg: "bg-destructive-foreground", value: "#fef2f2", usage: "Text/icons on a destructive fill.", outline: true },
      { name: "border", bg: "bg-border", value: "#e7e5e4", usage: "Hairlines, dividers, default input borders.", outline: true },
      { name: "input", bg: "bg-input", value: "#e7e5e4", usage: "Form-control borders.", outline: true },
      { name: "ring", bg: "bg-ring", value: "#a8a29e", usage: "Focus ring on interactive elements." },
    ],
  },
  {
    id: "status",
    label: "Status",
    hint: "each has a matching -foreground",
    tokens: [
      { name: "success", bg: "bg-success", value: "#16a34a", usage: "Success states, positive status dots, healthy." },
      { name: "warning", bg: "bg-warning", value: "#d97706", usage: "Warnings, at-risk, needs-attention." },
      { name: "info", bg: "bg-info", value: "#0284c7", usage: "Informational callouts and neutral status." },
    ],
  },
  {
    id: "chart",
    label: "Chart",
    hint: "data-viz series, in order",
    tokens: [
      { name: "chart-1", bg: "bg-chart-1", value: "#0d9488", usage: "First data series (teal)." },
      { name: "chart-2", bg: "bg-chart-2", value: "#ea580c", usage: "Second data series (orange)." },
      { name: "chart-3", bg: "bg-chart-3", value: "#7c3aed", usage: "Third data series (violet)." },
      { name: "chart-4", bg: "bg-chart-4", value: "#e11d48", usage: "Fourth data series (rose)." },
      { name: "chart-5", bg: "bg-chart-5", value: "#0284c7", usage: "Fifth data series (sky)." },
    ],
  },
]

// ── SEED boundary ────────────────────────────────────────────────────────────
// The brand ramps are project-specific (the project's brand ramps, in
// `lib/system/seed/`) and live in `./seed/brand-ramps.ts`. A new project swaps
// that ONE file; the portable vocabulary above stays put. See §8.
//
// `COLOR_GROUPS` is the combined list (base + brand) for anything that wants the
// whole palette flat; Foundations renders `BASE_COLOR_GROUPS` and `BRAND_RAMPS`
// separately so companion-mode can frame the project's palette distinctly from
// the Synclair chrome.
export const COLOR_GROUPS: ColorGroup[] = [...BASE_COLOR_GROUPS, ...BRAND_RAMPS]

// ── Radius ───────────────────────────────────────────────────────────────────
export interface RadiusToken {
  name: string
  /** Utility class, e.g. "rounded-md". */
  className: string
  px: string
  usage: string
}

export const RADIUS_TOKENS: RadiusToken[] = [
  { name: "xs", className: "rounded-xs", px: "2px", usage: "Tiny — tags, inline chips." },
  { name: "sm", className: "rounded-sm", px: "4px", usage: "Small controls, badges." },
  { name: "md", className: "rounded-md", px: "8px", usage: "Buttons, inputs, most controls." },
  { name: "lg", className: "rounded-lg", px: "12px", usage: "Cards, panels (the anchor, --radius)." },
  { name: "xl", className: "rounded-xl", px: "16px", usage: "Large cards, modals." },
  { name: "2xl", className: "rounded-2xl", px: "24px", usage: "Hero surfaces, feature tiles." },
  { name: "full", className: "rounded-full", px: "9999px", usage: "Pills, avatars, status dots." },
]

// ── Typography ────────────────────────────────────────────────────────────────
export interface TypeToken {
  name: string
  className: string
  size: string
  line: string
  usage: string
}

export const TYPE_SCALE: TypeToken[] = [
  { name: "3xl", className: "text-3xl", size: "30px", line: "36px", usage: "Page titles / hero." },
  { name: "2xl", className: "text-2xl", size: "24px", line: "32px", usage: "Section titles." },
  { name: "xl", className: "text-xl", size: "20px", line: "28px", usage: "Card / group headings." },
  { name: "lg", className: "text-lg", size: "18px", line: "28px", usage: "Emphasized body, subheads." },
  { name: "base", className: "text-base", size: "16px", line: "24px", usage: "Default body copy." },
  { name: "sm", className: "text-sm", size: "14px", line: "20px", usage: "Dense UI text, labels, table cells." },
  { name: "xs", className: "text-xs", size: "12px", line: "16px", usage: "Captions, metadata, badges." },
  { name: "2xs", className: "text-2xs", size: "11px", line: "16px", usage: "Dense tool UI: mono hints, table metadata, token values." },
  { name: "3xs", className: "text-3xs", size: "10px", line: "14px", usage: "Smallest step: kbd shortcuts, micro badges, status chips." },
]

export const FONT_WEIGHTS = [
  { name: "regular", className: "font-normal", value: "400", usage: "Body copy." },
  { name: "medium", className: "font-medium", value: "500", usage: "Labels, subtle emphasis." },
  { name: "semibold", className: "font-semibold", value: "600", usage: "Headings, active nav." },
  { name: "bold", className: "font-bold", value: "700", usage: "Strong emphasis, brand mark." },
]

export const FONT_FAMILIES = [
  { name: "sans", className: "font-sans", value: "Geist", usage: "All UI and body text (default)." },
  { name: "mono", className: "font-mono", value: "Geist Mono", usage: "Code, token values, keyboard shortcuts, IDs." },
]

// ── Spacing ───────────────────────────────────────────────────────────────────
// The whole scale derives from one base token (--spacing); every p-*, gap-*,
// m-*, size-* step is `n × --spacing`. Change the base to rescale the app.
// NOTE: `w` classes are LITERAL so Tailwind's JIT generates them (never build a
// utility class name at runtime — the scanner can't see it).
export const SPACING_STEPS = [
  { step: "0.5", w: "w-0.5", value: "2px" },
  { step: "1", w: "w-1", value: "4px" },
  { step: "2", w: "w-2", value: "8px" },
  { step: "3", w: "w-3", value: "12px" },
  { step: "4", w: "w-4", value: "16px" },
  { step: "6", w: "w-6", value: "24px" },
  { step: "8", w: "w-8", value: "32px" },
  { step: "12", w: "w-12", value: "48px" },
]

// ── Opacity ───────────────────────────────────────────────────────────────────
// The "opacity" tokens map 1:1 onto Tailwind's native `/N` modifier
// on any color token — e.g. `bg-primary/10` == opacity-primary-lighter. Use the
// modifier; don't add separate opacity tokens.
export const OPACITY_STEPS = [
  { label: "lighter", mod: "/10", pct: "10%" },
  { label: "light", mod: "/20", pct: "20%" },
  { label: "main", mod: "/30", pct: "30%" },
  { label: "dark", mod: "/40", pct: "40%" },
  { label: "darker", mod: "/50", pct: "50%" },
]

// ── Foundation groups ─────────────────────────────────────────────────────────
// The token groups the Foundations page documents in new-project mode. The
// page builds its tabs from this list and the Overview counts it — one source,
// so the count can never drift from the tabs (it used to be hardcoded).
export const FOUNDATION_GROUPS = [
  "Colors",
  "Typography",
  "Spacing",
  "Radius",
  "Opacity",
  "Motion",
] as const

// ── Motion ────────────────────────────────────────────────────────────────────
// The hub-chrome motion vocabulary (utilities defined in app/globals.css).
// Two entrance moves only — opacity plus a small translate; never animate
// layout properties. Overlay primitives (dialog/sheet/tooltip) keep their
// vendored tw-animate-css enters. Everything flattens under
// prefers-reduced-motion.
export interface MotionToken {
  name: string
  className: string
  timing: string
  usage: string
}

export const MOTION_TOKENS: MotionToken[] = [
  {
    name: "page enter",
    className: "page-enter",
    timing: "350ms · ease-out",
    usage: "Whole-page entrance — every PageBody fades in and rises 6px on load.",
  },
  {
    name: "stagger children",
    className: "stagger-children",
    timing: "300ms · ease-out · 40ms steps",
    usage:
      "Grid/list entrance — direct children cascade in; delays cap at 240ms so long lists never read as slow.",
  },
  {
    name: "hover feedback",
    className: "transition-colors",
    timing: "150ms",
    usage: "Hover/focus color feedback on links, rows, and interactive cards.",
  },
  {
    name: "in-place resize",
    className: "transition-[width] duration-200 ease-out",
    timing: "200ms · ease-out",
    usage: "Width/size shifts that keep context — e.g. the doc-preview viewport frame.",
  },
]
