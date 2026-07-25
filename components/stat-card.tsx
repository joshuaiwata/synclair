import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface StatCardProps {
  value: string
  label: string
  /** Optional qualifier under the label (e.g. "12 files", "not in the library yet"). */
  note?: string
  className?: string
}

/**
 * StatCard — THE numeric-census unit, hub-wide: an at-a-glance figure with its
 * label (Figma Manifest's files/projects row, the Pages census, Hygiene's
 * per-rule counts). Deliberately plain — figure + label + optional note, no
 * icon chip — and non-interactive: a reading surface, unlike the library's
 * clickable cards. Use `StatGrid` instead when the values are labeled TEXT
 * facts (a stack sheet, environment info) rather than numbers.
 */
export function StatCard({ value, label, note, className }: StatCardProps) {
  return (
    <Card className={cn("py-4", className)}>
      <CardContent className="flex min-w-0 flex-col px-4">
        <span className="text-xl leading-tight font-semibold tracking-tight">{value}</span>
        <span className="text-muted-foreground truncate text-xs">{label}</span>
        {note && <span className="text-muted-foreground/70 text-2xs">{note}</span>}
      </CardContent>
    </Card>
  )
}
