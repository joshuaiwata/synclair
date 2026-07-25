/**
 * Cross-cutting per-item display metadata for the library — the APP AREA an
 * item belongs to and whether it was added recently. Pure and client-safe:
 * the explorer rail (client) and the tier galleries (server) both consume it,
 * so both groupings and the recency dot agree everywhere.
 */

function pretty(seg: string): string {
  const s = seg.replace(/[-_]/g, " ")
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * The app AREA of a catalog item, derived from its primary source file — the
 * host convention puts feature code under `features/<area>` or `screens/<area>`
 * (`src/features/billing/…` → "Billing", `src/screens/settings/…` →
 * "Settings"), with the app shell under `shell/`. Anything outside those
 * conventions (shared UI-kit primitives, generic components) is "General".
 */
export function itemArea(files: string[]): string {
  const f = files[0] ?? ""
  const m = f.match(/(?:^|\/)(?:features|screens|modules|views|domains)\/([^/]+)\//)
  if (m) return pretty(m[1])
  if (/(?:^|\/)shell\//.test(f)) return "Shell"
  return "General"
}

/** Recency window for the "new" dot. */
const NEW_WINDOW_MS = 48 * 60 * 60 * 1000

/**
 * True when the item entered the catalog within the last 48 hours. `addedAt`
 * is day-precision (`"2026-07-24"`, parsed as UTC midnight), so the window is
 * approximate by design — "added today or yesterday", not a stopwatch.
 */
export function isNewlyAdded(addedAt: string | undefined): boolean {
  if (!addedAt) return false
  const t = Date.parse(addedAt)
  return Number.isFinite(t) && Date.now() - t < NEW_WINDOW_MS
}
