"use client"

import * as React from "react"

import { Sparkles } from "lucide-react"

import { PillToggle } from "@/components/pill-toggle"
import { SourceRow, type SourceItem } from "@/components/blocks/source-editor"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { groupByCategory, type CapabilityLayer } from "@/lib/system/capability-categories"
import { project } from "@/lib/system/seed/project"
import type { SourceKind } from "@/lib/system/types"

export type CapabilityRow = {
  name: string
  source: string
  layer: CapabilityLayer
  summary: string
  file: string
  category?: string
}

type LayerFilter = CapabilityLayer

const FILTERS: { value: LayerFilter; label: string }[] = [
  { value: "project", label: project.name },
  { value: "foundation", label: "Synclair" },
]

/**
 * Skills / agents grouped by capability category, with an Origin filter
 * (Project / Synclair) that narrows the set in place — Project is the default
 * since a repo's own capabilities are what a maintainer looks at first.
 * Client-side on purpose: the AI Setup tabs aren't URL-driven, so a navigating
 * (URL) filter would snap back to the first tab — this keeps the active tab.
 * Pills match the library's FilterBar so filtering reads the same across
 * Synclair.
 */
export function CapabilityTables({
  kind,
  label,
  rows,
}: {
  kind: SourceKind
  label: string
  rows: CapabilityRow[]
}) {
  const [filter, setFilter] = React.useState<LayerFilter>("project")

  const counts: Record<LayerFilter, number> = {
    foundation: rows.filter((r) => r.layer === "foundation").length,
    project: rows.filter((r) => r.layer === "project").length,
  }
  const filtered = rows.filter((r) => r.layer === filter)
  const groups = groupByCategory(filtered, (r) => r.category)
  const activeLabel = FILTERS.find((f) => f.value === filter)?.label ?? project.name

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">Origin</span>
        <PillToggle
          aria-label="Origin"
          value={filter}
          onValueChange={(v) => setFilter(v as LayerFilter)}
          options={FILTERS.map((f) => ({
            value: f.value,
            label: f.label,
            count: counts[f.value],
          }))}
        />
      </div>

      {groups.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Sparkles />
            </EmptyMedia>
            <EmptyTitle>
              No {activeLabel} {label.toLowerCase()}s yet
            </EmptyTitle>
            <EmptyDescription>
              {filter === "project" ? (
                <>
                  This repo hasn&rsquo;t added its own {label.toLowerCase()}s.{" "}
                  {project.name} {label.toLowerCase()}s live in{" "}
                  <code>.claude/{label.toLowerCase()}s/</code> with{" "}
                  <code>layer: project</code>; the ones that ship with Synclair
                  are under the <strong>Synclair</strong> filter.
                </>
              ) : (
                <>
                  No foundation {label.toLowerCase()}s here yet — these sync in
                  from the Synclair mother repo.
                </>
              )}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        groups.map(({ category, items }) => (
          <section key={category.id} className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-2">
                <h3 className="text-sm font-medium">{category.label}</h3>
                <span className="text-muted-foreground text-xs tabular-nums">{items.length}</span>
              </div>
              <p className="text-muted-foreground text-xs">{category.description}</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-56">{label}</TableHead>
                  <TableHead className="w-36">Origin</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <SourceRow
                    key={row.name}
                    item={
                      {
                        kind,
                        name: row.name,
                        source: row.source,
                        layer: row.layer,
                        summary: row.summary,
                        file: row.file,
                      } satisfies SourceItem
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </section>
        ))
      )}
    </div>
  )
}
