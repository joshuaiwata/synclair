/**
 * Format an ISO date for display as a short day ("Jul 12, 2026").
 *
 * A date-only string like "2026-07-12" is parsed by `new Date()` as UTC
 * midnight, which in a timezone behind UTC renders as the PREVIOUS day
 * ("Jul 11"). To keep a bare calendar date stable, parse date-only strings as
 * LOCAL midnight (append a local time); full timestamps (with a `T`) are left
 * as-is. Returns "unknown" for empty/invalid input.
 */
export function formatDay(iso?: string): string {
  if (!iso) return "unknown"
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso)
  const d = new Date(dateOnly ? `${iso}T00:00:00` : iso)
  return Number.isNaN(d.getTime())
    ? "unknown"
    : d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
}
