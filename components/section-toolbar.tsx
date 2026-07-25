"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

export interface ToolbarTab {
  value: string
  label: string
  /** Optional count rendered as tabular digits after the label. */
  count?: number
}

export interface ToolbarView {
  value: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

/**
 * The COMBO TOOLBAR every tabbed section shares — a tab strip on the left,
 * and on the right an optional inline search, optional extra actions, and an
 * optional icon view-switcher (table/cards, list/grid). One bar, composed by
 * variants: Knowledge uses tabs + search + views + an archived toggle; Pages
 * uses tabs + search. It exists so "tabs with tools beside them" is one
 * component with one rhythm instead of a hand-rolled flex row per section.
 *
 * Renders a `TabsList`, so it must sit inside a `<Tabs>` root — the section
 * keeps owning tab state and content panels. Search is controlled (Escape
 * clears); the view switcher is a display preference, not a filter.
 */
export function SectionToolbar({
  tabs,
  search,
  views,
  children,
  className,
}: {
  /** Tab triggers, in order. Rendered as a TabsList inside the host `<Tabs>`. */
  tabs: ToolbarTab[]
  /** Inline filter — controlled value; Escape clears. */
  search?: {
    value: string
    onValueChange: (value: string) => void
    placeholder?: string
    label?: string
  }
  /** Icon view-switcher (e.g. table/cards) — controlled. */
  views?: {
    options: ToolbarView[]
    value: string
    onValueChange: (value: string) => void
  }
  /** Extra right-side actions, rendered between search and the view switcher. */
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
            {t.count != null && (
              <span className="text-muted-foreground ml-1.5 text-xs tabular-nums">
                {t.count}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {(search || views || children) && (
        <div className="flex items-center gap-1.5">
          {search && (
            <Input
              value={search.value}
              onChange={(e) => search.onValueChange(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && search.onValueChange("")}
              placeholder={search.placeholder ?? "Search…"}
              aria-label={search.label ?? "Search"}
              className="bg-card h-7 w-56 text-xs"
            />
          )}
          {children}
          {views && (
            <div
              className="flex items-center gap-0.5 rounded-md border p-0.5"
              role="group"
              aria-label="View"
            >
              {views.options.map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn("size-6", views.value === value && "bg-muted")}
                  aria-pressed={views.value === value}
                  title={label}
                  onClick={() => views.onValueChange(value)}
                >
                  <Icon className="size-3.5" />
                  <span className="sr-only">{label}</span>
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
