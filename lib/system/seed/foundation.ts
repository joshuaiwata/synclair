/**
 * SEED (project-specific): the project's design foundation BEYOND color — the
 * companion of `brand-ramps.ts`. In existing-project mode the token dig writes
 * the HOST's fonts, type/spacing/radius, elevation, and any extra foundation
 * categories (motion, iconography, brand guidelines…) here as DATA. Empty by
 * default.
 *
 * VALUES ONLY — the shape lives in the Brain (lib/system/foundation-schema.ts),
 * which a reset never touches, so this template can't drift behind the readers
 * again. The re-export keeps existing imports working.
 */
import type { ProjectFoundation } from "../foundation-schema"

export type {
  FoundationFont,
  FoundationTypeStep,
  FoundationTypeRole,
  FoundationScaleStep,
  FoundationShadowStep,
  FoundationMotion,
  FoundationIcon,
  FoundationIcons,
  FoundationGroup,
  FoundationSection,
  FoundationSample,
  ProjectFoundation,
} from "../foundation-schema"

export const PROJECT_FOUNDATION: ProjectFoundation = {
  fonts: [],
  type: [],
  radii: [],
  spacing: [],
  sections: [],
}
