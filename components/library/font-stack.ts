/**
 * A specimen font-family with its truthful generic fallback — pairs with
 * `SpecimenFonts` (specimen-fonts.tsx): if the webfont can't load, the
 * specimen degrades to the right GENUS (sans/mono), never the browser's
 * default serif. Plain module so server components can call it.
 */
export function fontStack(family?: string, mono = false): string | undefined {
  if (!family) return undefined
  return `"${family}", ${mono ? "ui-monospace, SFMono-Regular, monospace" : "ui-sans-serif, system-ui, sans-serif"}`
}

/**
 * Specimens render at their TRUE size — a 96px H1 is shown at 96px. Scaling a
 * type specimen down defeats its purpose: the whole point is to feel the size.
 * Rows wrap rather than clip, so a display face is allowed to be big.
 */
