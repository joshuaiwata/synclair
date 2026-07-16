/**
 * SEED (project-specific): the project's design foundation BEYOND color — the
 * companion of `brand-ramps.ts`. In existing-project mode the token dig writes
 * the HOST's fonts, type/spacing/radius, elevation, and any extra foundation
 * categories (motion, iconography, brand guidelines…) here as DATA. Empty by
 * default.
 *
 * The Foundations page renders this as a CONSOLIDATED style guide — a small,
 * fixed set of tabs (Color · Typography · Spacing · Shape & elevation · Motion ·
 * Iconography), NOT one tab per entry. The typed fields (radii, elevation, …)
 * drive LIVE structured views (rendered specimens, not descriptions); prose
 * `sections` are bucketed into those tabs by `group`.
 */

export interface FoundationFont {
  role: string
  family: string
  usage?: string
}

export interface FoundationTypeStep {
  name: string
  size: string
  line?: string
  usage?: string
}

/**
 * A semantic type role (h1, h2, body, caption, mono…) rendered as a LIVE
 * specimen. Use when the host has no declared numeric ladder — the roles mined
 * from actual usage ARE the type system. `size`/`line`/`weight` render inline.
 */
export interface FoundationTypeRole {
  role: string
  size: string
  line?: string
  weight?: string
  mono?: boolean
  sample?: string
  usage?: string
}

export interface FoundationScaleStep {
  name: string
  px: string
  usage?: string
}

/** A named elevation/shadow token — `value` is a raw CSS box-shadow, rendered live. */
export interface FoundationShadowStep {
  name: string
  value: string
  usage?: string
}

/** Motion, shown in action: eased demos per duration, plus the named moves. */
export interface FoundationMotion {
  /** Easing curves — `value` is a raw CSS timing function, animated live. */
  ease: { name: string; value: string }[]
  /** Durations in milliseconds — each drives a live eased demo. */
  durations: { name: string; ms: number }[]
  /** Named keyframes/moves the host composes (described; they live in host CSS). */
  moves?: { name: string; usage: string }[]
}

/** A single inline SVG glyph (currentColor markup), rendered live. */
export interface FoundationIcon {
  name: string
  /** Raw inline SVG markup — trusted seed data, rendered as-is. */
  svg: string
}

/** Iconography, shown as rendered marks rather than described. */
export interface FoundationIcons {
  /** The brand mark as self-colored inline SVG. */
  markSvg?: string
  markLabel?: string
  /** Sample glyphs from the host icon set (currentColor). */
  glyphs?: FoundationIcon[]
}

/**
 * Which style-guide tab a prose section is bucketed under. Fixed set on purpose —
 * a new `group` means a new top-level tab, so add one only for a genuine style-guide
 * category. `"extra"` (or omitted) collects under a single "More" tab.
 */
export type FoundationGroup = "color" | "shape" | "motion" | "icon" | "extra"

export interface FoundationSection {
  id: string
  label: string
  summary?: string
  body: string
  group?: FoundationGroup
}

/**
 * A self-contained token bundle for the live "Examples" gallery. Applied as
 * INLINE CSS custom properties, scoped to the gallery frame only — it never
 * touches the hub's own chrome (companion mode must not restyle the hub).
 * Values are copied verbatim from the host so the sample matches the real
 * product. Capture it together with composing the gallery's tiles — see
 * `ExamplesShowcase` in components/library/foundations.tsx.
 */
export interface FoundationSample {
  /** CSS custom-property name → value, set inline on the gallery grid. */
  vars: Record<string, string>
  /** Optional font-family applied within the frame (degrades to system sans). */
  fontFamily?: string
}

export interface ProjectFoundation {
  fonts: FoundationFont[]
  type: FoundationTypeStep[]
  typeRoles?: FoundationTypeRole[]
  radii: FoundationScaleStep[]
  spacing: FoundationScaleStep[]
  elevation?: FoundationShadowStep[]
  motion?: FoundationMotion
  icons?: FoundationIcons
  sections: FoundationSection[]
  sample?: FoundationSample
  notes?: string
}

export const PROJECT_FOUNDATION: ProjectFoundation = {
  fonts: [],
  type: [],
  radii: [],
  spacing: [],
  sections: [],
}
