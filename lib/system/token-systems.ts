import type { ColorGroup } from "./tokens"
import type {
  FoundationFont,
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
  /** The Examples frame — this system's values mapped into the STANDARD
   *  `--sys-*` slots SystemExamplesBlock composes (copied verbatim from the
   *  system's source). Absent → no Examples tab for the system. */
  sample?: SystemSample
  /** Markdown — caveats/flags specific to this system. */
  notes?: string
}

/**
 * The Examples frame for one system. `vars` fills the standard slots the
 * generic composed layout reads: --sys-primary / --sys-on-primary /
 * --sys-primary-soft / --sys-bg / --sys-surface / --sys-line / --sys-text /
 * --sys-text-muted / --sys-info / --sys-danger / --sys-danger-soft /
 * --sys-radius / --sys-shadow. Missing slots fall back to sibling slots in
 * the layout — fill only what the system truly defines.
 */
export interface SystemSample {
  vars: Record<string, string>
  /** Font stack applied within the frame (degrades to system sans). */
  fontFamily?: string
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
