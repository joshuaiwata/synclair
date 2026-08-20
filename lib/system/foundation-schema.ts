/**
 * BRAIN: the schema of the project foundation — every type the Foundations
 * page and token exports read. The VALUES live in `seed/foundation.ts`
 * (project-specific, blanked by synclair-reset); the TYPES live here, owned
 * by the Brain, so the reset template and the reader can never disagree about
 * the shape again. (They did: the blank seed's inlined copy of these types
 * drifted behind the page's `section.group` read, and the first scripted
 * fresh-clone sim failed to build. One owner per shape — see
 * docs/hardening-battery.md.)
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
