import type { ColorGroup } from "./tokens"
import type {
  FoundationFont,
  FoundationIcons,
  FoundationMotion,
  FoundationScaleStep,
  FoundationShadowStep,
  FoundationTypeRole,
  FoundationTypeStep,
} from "./seed/foundation"

/**
 * Token SYSTEMS — the mechanism behind a multi-system Foundations page.
 *
 * Some hosts run more than one design-token vocabulary at once (a production
 * package, a prototype's own set, a designers' style guide in Figma). Blending
 * them into one consolidated guide hides exactly what a team needs to see: the
 * DRIFT between them, and which one should win. When the seed declares systems
 * (`lib/system/seed/token-systems.ts`), /synclair/foundations renders each one
 * SEPARATELY — its own ramps, type, shape, motion — plus a Compare view of the
 * same design slots across systems, as the decision aid.
 *
 * Empty seed (the default) = the classic consolidated Foundations page; zero
 * extra chrome. The comparison rows are CURATED data, not fuzzy matching —
 * the token dig decides which slots correspond; the page just renders truth.
 */
export interface TokenSystem {
  id: string
  /** Display name, e.g. "@acme/ui (production)". */
  label: string
  /** What this system is to the project: "production" | "prototype" | "design reference" | free text. */
  role?: string
  /** Where it's defined — a repo path or a design-tool location. */
  source: string
  /** Optional link for `source` (e.g. the Figma page URL). */
  sourceHref?: string
  /** One-line orientation for the system tab. */
  hint?: string
  /** Does the system define a dark mode? */
  darkMode?: boolean
  ramps: ColorGroup[]
  fonts?: FoundationFont[]
  type?: FoundationTypeStep[]
  typeRoles?: FoundationTypeRole[]
  radii?: FoundationScaleStep[]
  spacing?: FoundationScaleStep[]
  elevation?: FoundationShadowStep[]
  motion?: FoundationMotion
  /** Alpha steps the system defines — text emphasis, state overlays. Rendered
   *  as live chips over a patterned ground so the alpha is actually visible. */
  opacity?: SystemAlphaStep[]
  /** Responsive breakpoints, rendered as a proportional ladder. */
  breakpoints?: SystemBreakpoint[]
  /** The system's icon set — brand mark plus sample glyphs, rendered as live
   *  inline SVG rather than described. Absent → no Iconography tab. */
  icons?: FoundationIcons
  /** The Theme frame — this system's values mapped into the STANDARD
   *  `--sys-*` slots SystemExamplesBlock composes (copied verbatim from the
   *  system's source). Absent → no Examples tab for the system. */
  sample?: SystemSample
  /** Markdown — caveats/flags specific to this system. */
  notes?: string
}

/**
 * A named alpha step. `value` is a bare CSS opacity (`"0.45"`) or a percentage
 * (`"12%"`) — whatever the system itself writes, rendered verbatim.
 */
export interface SystemAlphaStep {
  name: string
  value: string
  usage?: string
}

/** A responsive breakpoint. `min` is the CSS min-width the system declares. */
export interface SystemBreakpoint {
  name: string
  min: string
  usage?: string
}

/**
 * The Theme frame for one system. `vars` fills the standard slots the
 * generic composed screen reads: --sys-primary / --sys-on-primary /
 * --sys-primary-soft / --sys-accent / --sys-on-accent / --sys-bg /
 * --sys-surface / --sys-sunken / --sys-line / --sys-text / --sys-text-muted /
 * --sys-info / --sys-danger / --sys-danger-soft / --sys-ok / --sys-ok-soft /
 * --sys-radius / --sys-shadow. Missing slots fall back to sibling slots in the
 * layout — fill only what the system truly defines.
 *
 * `--sys-primary` is the system's PRIMARY ACTION fill, not its brand hue. When
 * a system's brand color is an accent rather than its button fill (a gold brand
 * with ink buttons, say), put the button fill in `--sys-primary` and the brand
 * hue in `--sys-accent` — otherwise every system's screen renders the same
 * brand-colored button and the comparison shows nothing.
 */
export interface SystemSample {
  vars: Record<string, string>
  /** The same slots at the system's own DARK values. Present only for systems
   *  that genuinely define a dark theme — it drives the Theme tab's light/dark
   *  toggle, so an absent set means the toggle is correctly hidden. */
  darkVars?: Record<string, string>
  /** Font stack applied within the frame (degrades to system sans). */
  fontFamily?: string
  /**
   * RECIPE CSS — the part of a system's look that a color slot cannot carry.
   * A highlighter swipe behind a heading, a glass bar, a chamfered corner, a
   * neumorphic press are `background-image` / `box-shadow` / `clip-path`
   * structures, not values; skinning a generic layout with hexes reproduces a
   * system's palette while losing its signature. Copy the rules VERBATIM from
   * the system's own stylesheet and they render here for real.
   *
   * Injected into the Theme frame as-is, so the selectors must be the system's
   * OWN prefixed classes (`.ds-highlight`, never a bare `.highlight`) — an
   * unprefixed rule here could collide with the hub's chrome. The frame carries
   * `data-theme="light|dark"`, so a rule the source already scopes that way
   * (`[data-theme='dark'] .ds-highlight { … }`) keeps working unchanged.
   */
  css?: string
  /** Which classes from `css` to hang on the composed screen's named slots. */
  classes?: {
    /** The page's H1 — e.g. a highlighter swipe. */
    heading?: string
    /** Small uppercase section labels. */
    kicker?: string
  }
}

/** One cell of the Compare table. `hex` renders a swatch beside `text`. */
export interface DriftValue {
  text: string
  hex?: string
  /** Flag the cell (e.g. "diverges", "unwired") — rendered as a subtle warning. */
  flag?: string
}

/**
 * One row of the Compare table: the SAME design slot across every system.
 * `values` keys are TokenSystem ids; a missing/null entry renders as "—"
 * (the honest "this system doesn't define it").
 */
export interface DriftRow {
  slot: string
  hint?: string
  values: Record<string, DriftValue | null>
}

export interface DriftSection {
  id: string
  label: string
  rows: DriftRow[]
}
