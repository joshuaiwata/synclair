"use client"

/** Registry-exempt (infra): runtime webfont loading + honest fallback stacks for foundation SPECIMENS — plumbing for the style-guide pages, never product UI. */
import * as React from "react"

/**
 * Foundation specimens render fonts the PROJECT uses ("Libre Franklin",
 * "Geist"…) — families that are seed DATA, not fonts the hub bundles. A bare
 * `fontFamily: name` therefore fell through to the browser's default SERIF
 * when the family wasn't installed, silently misrepresenting every sans face.
 *
 * Two-part fix, both here:
 * - `SpecimenFonts` injects a Google Fonts stylesheet for the families a
 *   specimen page needs (display-only, weights 300–700, `display=swap`;
 *   de-duped by href). Offline or non-Google families degrade to…
 * - `fontStack()`, which appends an honest generic stack so a family that
 *   can't load falls back to the RIGHT genus (sans/mono), never serif.
 */
export function SpecimenFonts({ families }: { families: (string | undefined)[] }) {
  const unique = [...new Set(families.filter((f): f is string => Boolean(f)))].sort()
  const key = unique.join("|")
  React.useEffect(() => {
    if (!unique.length) return
    const href = `https://fonts.googleapis.com/css2?${unique
      .map((f) => `family=${f.trim().replace(/ /g, "+")}:wght@300;400;500;600;700`)
      .join("&")}&display=swap`
    if (document.querySelector(`link[data-specimen-fonts][href="${href}"]`)) return
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = href
    link.setAttribute("data-specimen-fonts", "")
    document.head.appendChild(link)
    // Deliberately not removed on unmount: fonts are cheap to keep and
    // removing mid-navigation would flash specimens back to the fallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}
