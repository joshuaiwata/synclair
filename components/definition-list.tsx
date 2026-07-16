import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * DefinitionList — key/value facts as a real `<dl>`, the standard, accessible
 * way to render them.
 *
 * Replaces the pattern where key/value data was forced into a headerless
 * two-column `<Table>` (a definition list wearing a data-table's clothes — no
 * column headers, no sortable rows, just term → value). A `<dl>` says exactly
 * what the data is. Use this for settings, run commands, "about" facts — any
 * label-to-value list. Reach for a real `<Table>` only when the data is
 * genuinely tabular (multiple columns you'd scan or sort).
 */
export interface DefinitionItem {
  term: ReactNode
  description: ReactNode
}

export interface DefinitionListProps {
  items: DefinitionItem[]
  /** Width of the term column. Default `11rem`. */
  termWidth?: string
  className?: string
}

export function DefinitionList({ items, termWidth = "11rem", className }: DefinitionListProps) {
  return (
    <dl className={cn("divide-y rounded-lg border", className)}>
      {items.map((item, i) => (
        <div
          key={i}
          className="grid gap-4 px-4 py-2.5"
          style={{ gridTemplateColumns: `minmax(0, ${termWidth}) 1fr` }}
        >
          <dt className="text-muted-foreground text-sm font-medium">{item.term}</dt>
          <dd className="text-sm">{item.description}</dd>
        </div>
      ))}
    </dl>
  )
}
