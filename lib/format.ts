/** "3h ago", "2d ago", "4mo ago" — compact relative time for dense tables. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return "—"
  const s = Math.max(0, (now.getTime() - then) / 1000)
  if (s < 60) return "just now"
  const m = s / 60
  if (m < 60) return `${Math.floor(m)}m ago`
  const h = m / 60
  if (h < 24) return `${Math.floor(h)}h ago`
  const d = h / 24
  if (d < 30) return `${Math.floor(d)}d ago`
  const mo = d / 30
  if (mo < 12) return `${Math.floor(mo)}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

export function shortDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
