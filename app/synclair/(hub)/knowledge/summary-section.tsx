"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Archive, ArchiveRestore, FileText, History, MoreHorizontal, Plus, RefreshCw, Sparkles, X } from "lucide-react"

import { AgentAsk } from "@/components/agent-ask"
import { SummaryShell } from "@/components/summary-shell"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  dequeueSummary,
  queueSummary,
  restoreSummary,
  setSummaryArchived,
} from "@/lib/system/knowledge/summary-actions"
import {
  type SummaryKind,
  type SummaryVersion,
} from "@/lib/system/knowledge/summary-types"

/** The ask a user hands their agent to get a new summary. */
const NEW_SUMMARY_PROMPT = `Add a new project summary to Synclair and write it from the project knowledge: [what it should cover, and who for]`

/** One summary with everything the section needs, resolved server-side. */
export interface SummaryItem {
  id: string
  title: string
  kind: SummaryKind
  instructions: string
  archived: boolean
  /** Current version + its markdown; null = never generated (or file missing). */
  current: { version: SummaryVersion; content: string } | null
  /** All versions, newest first (includes current). */
  versions: SummaryVersion[]
  queued: boolean
  /** Knowledge inputs changed in git after the current version was generated. */
  stale: boolean
}

// The hub UI stays neutral — no brand color on selection states.
function chip(active: boolean, archived = false) {
  return cn(
    active ? "bg-muted text-foreground" : "text-muted-foreground",
    archived && "line-through"
  )
}

export function SummarySection({ items }: { items: SummaryItem[] }) {
  const [pending, start] = useTransition()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const router = useRouter()

  const active = items.filter((s) => !s.archived)
  const archived = items.filter((s) => s.archived)
  const visible = showArchived ? [...active, ...archived] : active
  const selected = visible.find((s) => s.id === selectedId) ?? visible[0] ?? null

  function run(action: () => Promise<unknown>) {
    start(async () => {
      await action()
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* One row: the views on the left, actions for the selected view on the right. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {visible.map((s) => (
          <Button
            key={s.id}
            type="button"
            size="sm"
            variant="ghost"
            className={chip(selected?.id === s.id, s.archived)}
            onClick={() => {
              setShowHistory(false)
              setSelectedId(s.id)
            }}
          >
            {s.title}
            {s.queued && <span className="bg-info size-1.5 rounded-full" aria-hidden />}
          </Button>
        ))}
        {/* Not a form — the agent writes summaries (product-summary skill), so
            the control hands over the ask instead of pretending to create one. */}
        <AgentAsk
          label="New"
          icon={<Plus />}
          variant="ghost"
          className="text-muted-foreground"
          title="New summary"
          prompt={NEW_SUMMARY_PROMPT}
          note="product-summary skill"
        />
        {archived.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground/70"
            onClick={() => setShowArchived((v) => !v)}
          >
            <Archive />
            <span className="text-xs tabular-nums">{archived.length}</span>
          </Button>
        )}

        {selected && (
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" aria-label="Summary actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {selected.queued ? (
                  <DropdownMenuItem
                    disabled={pending}
                    onSelect={() => run(() => dequeueSummary(selected.id))}
                  >
                    <X />
                    Cancel generation
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    disabled={pending}
                    onSelect={() => run(() => queueSummary(selected.id))}
                  >
                    {selected.current ? <RefreshCw /> : <Sparkles />}
                    {selected.current ? "Reprocess" : "Generate"}
                  </DropdownMenuItem>
                )}
                {selected.versions.length > 0 && (
                  <DropdownMenuItem onSelect={() => setShowHistory((v) => !v)}>
                    <History />
                    History
                    <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                      {selected.versions.length}
                    </span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={pending}
                  onSelect={() => run(() => setSummaryArchived(selected.id, !selected.archived))}
                >
                  {selected.archived ? <ArchiveRestore /> : <Archive />}
                  {selected.archived ? "Unarchive" : "Archive"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {selected ? (
        <>
          {showHistory && (
            <div className="rounded-lg border bg-card">
              {selected.versions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0"
                >
                  <span className="text-muted-foreground font-mono text-xs">{v.id}</span>
                  <span className="text-muted-foreground text-xs">
                    {v.createdAt.slice(0, 10)} · {v.note}
                  </span>
                  <span className="ml-auto">
                    {v.id === selected.current?.version.id ? (
                      <StatusBadge status="success">current</StatusBadge>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => restoreSummary(selected.id, v.id))}
                      >
                        Restore
                      </Button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          {selected.current ? (
            <SummaryShell
              content={selected.current.content}
              fallbackTitle={selected.title}
              meta={selected.current.version.createdAt.slice(0, 10)}
              html
            />
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>
                  {selected.queued ? "Queued for generation" : "Not generated yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {selected.queued
                    ? "An agent will generate this from the project knowledge — see the product-summary skill."
                    : "Use the ⋯ menu to generate it — an agent writes it from the project knowledge."}
                </EmptyDescription>
              </EmptyHeader>
              {selected.instructions && (
                <EmptyContent>
                  <p className="text-muted-foreground/70 text-xs">
                    Spec: {selected.instructions}
                  </p>
                </EmptyContent>
              )}
            </Empty>
          )}
        </>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Sparkles />
            </EmptyMedia>
            <EmptyTitle>No summaries yet</EmptyTitle>
            <EmptyDescription>
              A summary is a brief for an audience, a diagram, or any custom cut
              of the project knowledge — and an agent writes it, via the{" "}
              <code>product-summary</code> skill. <strong>New</strong> gives you
              the ask to hand over.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
