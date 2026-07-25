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

/** Specimens render at most this size — labels keep carrying the TRUE value. */
const SPECIMEN_MAX_PX = 44

/**
 * Display size for a type specimen row. Values are honest data (a Figma guide
 * really does define a 96px H1), but rendering display sizes literally blows
 * the row out — cap the RENDERED size and say so, never the labeled value.
 */
export function specimenSize(size?: string): { fontSize?: string; capped: boolean } {
  const n = parseFloat(size ?? "")
  if (!Number.isFinite(n) || n <= SPECIMEN_MAX_PX) return { fontSize: size, capped: false }
  return { fontSize: `${SPECIMEN_MAX_PX}px`, capped: true }
}
