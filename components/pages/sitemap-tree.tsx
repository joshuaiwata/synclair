"use client"

import * as React from "react"
import Link from "next/link"
import { Minus, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { synclair } from "@/lib/system/routes"
import { cn } from "@/lib/utils"

/**
 * One node of the sitemap tree, in a serializable shape the server builds and
 * passes down (no PageNode functions cross the boundary). Grouping nodes (route
 * groups / index-less folders) have no `id`; page nodes do.
 */
export interface SitemapDatum {
  /** route — unique, the react key + collapse-state key. */
  key: string
  /** path segment shown as the mono crumb ("system", "[name]", "/"). */
  seg: string
  /** readable page name — what the row LEADS with. */
  title?: string
  /** detail-route slug; present only for real page nodes. */
  id?: string
  route: string
  dynamic?: boolean
  /** own composed-item counts, by tier. */
  counts: { component: number; block: number; template: number }
  /** number of page descendants (shown on collapsed parents). */
  descendantPages: number
  children: SitemapDatum[]
}

/** Expand the first two levels by default — enough to orient, not a wall. */
function initialExpanded(nodes: SitemapDatum[], depth = 0, acc = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.children.length > 0 && depth < 1) acc.add(n.key)
    initialExpanded(n.children, depth + 1, acc)
  }
  return acc
}

export function SitemapTree({ nodes }: { nodes: SitemapDatum[] }) {
  const [expanded, setExpanded] = React.useState<Set<string>>(() => initialExpanded(nodes))

  const toggle = React.useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const allKeys = React.useMemo(() => collectParents(nodes), [nodes])
  const allOpen = expanded.size >= allKeys.length

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setExpanded(allOpen ? new Set() : new Set(allKeys))}
          className="text-muted-foreground hover:text-foreground text-2xs font-medium"
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <Rows nodes={nodes} depth={0} expanded={expanded} toggle={toggle} />
    </div>
  )
}

function collectParents(nodes: SitemapDatum[], acc: string[] = []): string[] {
  for (const n of nodes) {
    if (n.children.length > 0) acc.push(n.key)
    collectParents(n.children, acc)
  }
  return acc
}

function Rows({
  nodes,
  depth,
  expanded,
  toggle,
}: {
  nodes: SitemapDatum[]
  depth: number
  expanded: Set<string>
  toggle: (key: string) => void
}) {
  return (
    <ul className={cn(depth > 0 && "border-border/60 ml-[1.15rem] border-l pl-2")}>
      {nodes.map((n) => {
        const hasKids = n.children.length > 0
        const open = expanded.has(n.key)
        return (
          <li key={n.key} className="py-px">
            <div className="group flex items-center gap-1">
              {hasKids ? (
                <button
                  type="button"
                  onClick={() => toggle(n.key)}
                  aria-label={open ? "Collapse" : "Expand"}
                  aria-expanded={open}
                  className="text-muted-foreground/60 hover:text-foreground hover:bg-muted flex size-5 shrink-0 items-center justify-center rounded"
                >
                  {open ? <Minus className="size-3.5" /> : <Plus className="size-3.5" />}
                </button>
              ) : (
                <span className="size-5 shrink-0" />
              )}
              <Row n={n} />
            </div>
            {hasKids && open && (
              <Rows nodes={n.children} depth={depth + 1} expanded={expanded} toggle={toggle} />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Row({ n }: { n: SitemapDatum }) {
  const primary = n.title || (n.seg === "/" ? "Home" : n.seg)
  const crumb = n.seg === "/" ? "/" : `/${n.seg}`
  const inner = (
    <>
      <span className="truncate font-medium">{primary}</span>
      <code className="text-muted-foreground/60 shrink-0 font-mono text-xs">{crumb}</code>
      {n.dynamic && (
        <Badge variant="outline" className="text-3xs text-muted-foreground shrink-0">
          dynamic
        </Badge>
      )}
      <span className="ml-auto shrink-0 pl-2">
        <Counts n={n} />
      </span>
    </>
  )
  if (n.id) {
    return (
      <Link
        href={synclair(`/pages/${n.id}`)}
        className="hover:bg-muted/60 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1"
      >
        {inner}
      </Link>
    )
  }
  return (
    <div className="text-muted-foreground/80 flex min-w-0 flex-1 items-center gap-2 px-2 py-1">
      {inner}
    </div>
  )
}

function Counts({ n }: { n: SitemapDatum }) {
  const parts = [
    n.counts.component && `${n.counts.component} comp`,
    n.counts.block && `${n.counts.block} block`,
    n.counts.template && `${n.counts.template} tmpl`,
  ].filter(Boolean)
  if (parts.length > 0) return <span className="text-muted-foreground text-2xs">{parts.join(" · ")}</span>
  if (n.descendantPages > 0)
    return <span className="text-muted-foreground/60 text-2xs tabular-nums">{n.descendantPages} pages</span>
  return null
}
