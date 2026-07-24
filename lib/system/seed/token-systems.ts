import type { DriftSection, TokenSystem } from "../token-systems"

/**
 * SEED (project-specific): the project's parallel TOKEN SYSTEMS, when it runs
 * more than one design-token vocabulary at once (a production package, a
 * prototype's own set, a designers' style guide in Figma…). Declaring 2+
 * systems switches /synclair/foundations to the multi-system layout — each
 * system rendered separately as its own complete style sheet, plus a Compare
 * tab showing the same design slots across systems (mechanism:
 * lib/system/token-systems.ts).
 *
 * Empty (the default) = the classic consolidated Foundations page; a
 * single-vocabulary project never touches this file. The token dig
 * (token-archaeologist / figma-frame-reader) populates it in existing-project
 * mode; TOKEN_DRIFT rows are CURATED in the same change that adds a system,
 * so the Compare table never claims a comparison nobody made.
 */
export const TOKEN_SYSTEMS: TokenSystem[] = []

export const TOKEN_DRIFT: DriftSection[] = []
