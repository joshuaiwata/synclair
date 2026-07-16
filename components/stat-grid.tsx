import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * StatGrid — an at-a-glance panel of labeled facts (a "spec sheet").
 *
 * Supersedes the bordered `gap-px` cell grid that stack/environment facts used
 * to render in — the one that read as a "block table" of boxed cells. This is
 * the same information as one calm bordered panel: an uppercase label, a value,
 * and an optional note per fact, laid out on a responsive grid and separated by
 * whitespace rather than full-bleed borders. Use it for scannable overview
 * facts (stack, environment, a system-map summary); use `DefinitionList` when
 * the data reads better as sequential term → value rows.
 */
export interface StatGridItem {
  label: string
  value: ReactNode
  note?: ReactNode
}

export interface StatGridProps {
  items: StatGridItem[]
  className?: string
}

export function StatGrid({ items, className }: StatGridProps) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg border p-5 sm:grid-cols-3 lg:grid-cols-4",
        className
      )}
    >
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`} className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">
            {item.label}
          </dt>
          <dd className="text-sm font-medium">{item.value}</dd>
          {item.note ? <dd className="text-muted-foreground text-xs">{item.note}</dd> : null}
        </div>
      ))}
    </dl>
  )
}
