"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  Archive,
  ArchiveRestore,
  BookOpen,
  ClipboardList,
  ExternalLink,
  FileText,
  FolderGit2,
  Frame,
  LayoutGrid,
  LayoutList,
  MoreHorizontal,
  PanelRightOpen,
  Presentation,
} from "lucide-react"

import { SectionToolbar } from "@/components/section-toolbar"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { setSourceArchived } from "@/lib/system/knowledge/source-actions"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { isExternalUrl, resolveInAppDoc } from "@/lib/system/knowledge/in-app-doc"
import type {
  KnowledgeAccess,
  KnowledgeSource,
  KnowledgeSourceKind,
} from "@/lib/system/knowledge/types"
import { isMultiSurface, surfaceLabel } from "@/lib/system/surfaces"
import { cn } from "@/lib/utils"

import { KnowledgeDocDrawer } from "./doc-drawer"
import { SummarySection, type SummaryItem } from "./summary-section"

// The badge answers "what's the best way to access this knowledge?" — prefer a
// distilled digest, else the raw-source mechanism. Distillation is read from
// `distilledInto` (the source of truth), NOT from `access`: a Figma row can be
// connector-reached *and* distilled, and "distilled" is the salient fact.
function accessBadge(
  s: KnowledgeSource
): { tone: "success" | "info" | "warning"; label: string } {
  if (s.distilledInto) return { tone: "success", label: "distilled" }
  const fallback: Record<KnowledgeAccess, { tone: "info" | "warning" | "success"; label: string }> = {
    connector: { tone: "info", label: "connector" }, // fetchable via MCP connector
    linked: { tone: "warning", label: "link only" }, // link only, no connector wired
    repo: { tone: "success", label: "in repo" }, // raw lives in-repo, no digest yet
  }
  return fallback[s.access]
}

// Doc-type tabs: label + priority order. Only kinds present in the data render.
const KIND_LABEL: Record<KnowledgeSourceKind, string> = {
  prd: "PRDs",
  spec: "Specs",
  figma: "Figma",
  deck: "Decks",
  doc: "Docs",
  repo: "Digests",
}
const KIND_ORDER: KnowledgeSourceKind[] = ["prd", "spec", "figma", "deck", "doc", "repo"]

// Document-manager iconography: one glyph per kind, so a scan of the list
// answers "what is this" before any text is read.
const KIND_ICON: Record<KnowledgeSourceKind, React.ComponentType<{ className?: string }>> = {
  prd: BookOpen,
  spec: ClipboardList,
  figma: Frame,
  deck: Presentation,
  doc: FileText,
  repo: FolderGit2,
}

function KindGlyph({ kind, className }: { kind: KnowledgeSourceKind; className?: string }) {
  const Icon = KIND_ICON[kind]
  return (
    <span
      className={cn(
        "bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md",
        className
      )}
      title={KIND_LABEL[kind]}
    >
      <Icon className="size-4" />
    </span>
  )
}

type ViewMode = "table" | "cards"

export function SourcesTable({
  sources,
  archivedIds,
  summaryItems,
}: {
  sources: KnowledgeSource[]
  /** Ids of soft-removed sources — hidden until the Archived toggle reveals them. */
  archivedIds: string[]
  summaryItems: SummaryItem[]
}) {
  const [active, setActive] = useState<KnowledgeSource | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [view, setView] = useState<ViewMode>("table")
  const [query, setQuery] = useState("")
  const [pending, start] = useTransition()
  const router = useRouter()

  const multiSurface = isMultiSurface()

  // Archived sources are soft-removed: hidden by default, revealed by the toggle.
  const archivedSet = new Set(archivedIds)
  const archivedCount = sources.filter((s) => archivedSet.has(s.id)).length
  const visible = showArchived ? sources : sources.filter((s) => !archivedSet.has(s.id))

  // Search narrows ROWS only — the tab set and counts stay put so the active
  // tab can't vanish under you; a tab whose rows all miss says so instead.
  const q = query.trim().toLowerCase()
  const matches = (s: KnowledgeSource) =>
    !q ||
    `${s.title} ${s.notes ?? ""} ${s.area} ${s.kind} ${KIND_LABEL[s.kind]} ${s.distilledInto ?? ""}`
      .toLowerCase()
      .includes(q)
  const shown = q ? visible.filter(matches) : visible

  const presentKinds = KIND_ORDER.filter((k) => visible.some((s) => s.kind === k))
  const tabs = [
    { value: "all", label: "All", count: visible.length },
    ...presentKinds.map((k) => ({
      value: k as string,
      label: KIND_LABEL[k],
      count: visible.filter((s) => s.kind === k).length,
    })),
  ]

  // Lead with the distilled brief only once one exists; otherwise land on the
  // sources you actually have (e.g. right after an intake) instead of an empty
  // "no summaries yet" state.
  const hasSummary = summaryItems.some((s) => !s.archived && s.current)
  const defaultTab = hasSummary ? "summary" : "all"

  function toggleArchived(id: string, archived: boolean) {
    start(async () => {
      await setSourceArchived(id, archived)
      router.refresh()
    })
  }

  const rowProps = {
    archivedSet,
    onOpen: setActive,
    onSetArchived: toggleArchived,
    pending,
    showSurfaces: multiSurface,
    view,
  }

  return (
    <>
      <Tabs defaultValue={defaultTab} className="gap-6">
        {/* The shared combo toolbar: the distilled onboarding brief leads;
            source-kind filters follow; search + archived + view on the right. */}
        <SectionToolbar
          tabs={[{ value: "summary", label: "Summary" }, ...tabs]}
          search={{
            value: query,
            onValueChange: setQuery,
            placeholder: "Search sources…",
            label: "Search sources",
          }}
          views={{
            options: [
              { value: "table", label: "Table view", icon: LayoutList },
              { value: "cards", label: "Card view", icon: LayoutGrid },
            ],
            value: view,
            onValueChange: (v) => setView(v as ViewMode),
          }}
        >
          {archivedCount > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground/70"
              aria-pressed={showArchived}
              onClick={() => setShowArchived((v) => !v)}
            >
              <Archive />
              <span className="text-xs tabular-nums">{archivedCount}</span>
            </Button>
          )}
        </SectionToolbar>
        <TabsContent value="summary">
          <SummarySection items={summaryItems} />
        </TabsContent>
        {/* All: grouped by kind (document-manager folders); kind tabs: flat.
            While searching, kinds with no matches drop their section. */}
        <TabsContent value="all">
          {visible.length === 0 ? (
            <SourcesEmpty />
          ) : shown.length === 0 ? (
            <SearchMiss query={query} onClear={() => setQuery("")} />
          ) : (
            <div className="flex flex-col gap-8">
              {presentKinds
                .filter((k) => shown.some((s) => s.kind === k))
                .map((k) => (
                  <section key={k} className="flex flex-col gap-3">
                    <div className="flex items-baseline gap-2">
                      <h2 className="text-sm font-semibold tracking-tight">{KIND_LABEL[k]}</h2>
                      <span className="text-muted-foreground font-mono text-xs tabular-nums">
                        {shown.filter((s) => s.kind === k).length}
                      </span>
                    </div>
                    <SourceRows sources={shown.filter((s) => s.kind === k)} {...rowProps} />
                  </section>
                ))}
            </div>
          )}
        </TabsContent>
        {presentKinds.map((k) => (
          <TabsContent key={k} value={k}>
            {q && !shown.some((s) => s.kind === k) ? (
              <SearchMiss query={query} onClear={() => setQuery("")} />
            ) : (
              <SourceRows sources={shown.filter((s) => s.kind === k)} {...rowProps} />
            )}
          </TabsContent>
        ))}
      </Tabs>
      <KnowledgeDocDrawer source={active} onClose={() => setActive(null)} />
    </>
  )
}

function SearchMiss({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <p className="text-muted-foreground bg-card rounded-lg border border-dashed px-4 py-6 text-sm">
      No sources match &ldquo;{query.trim()}&rdquo;.{" "}
      <button type="button" onClick={onClear} className="underline underline-offset-2">
        Clear search
      </button>
    </p>
  )
}

function SourcesEmpty() {
  // The standard empty treatment, not a headerless table: every other section
  // educates when it's blank (Reports, Pages, Hygiene) — Knowledge does too.
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BookOpen />
        </EmptyMedia>
        <EmptyTitle>No knowledge sources yet</EmptyTitle>
        <EmptyDescription>
          Knowledge is the project&rsquo;s sources of truth — specs, PRDs, Figma files, decks —
          linked here so agents never start blank. Add entries to{" "}
          <code>lib/system/knowledge/sources.ts</code> as you locate them, or run the{" "}
          <code>existing-project-intake</code> skill to harvest a host codebase&rsquo;s docs
          automatically.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

interface RowProps {
  sources: KnowledgeSource[]
  /** Ids of soft-removed sources — rendered dimmed, with Restore in the menu. */
  archivedSet: Set<string>
  onOpen: (s: KnowledgeSource) => void
  onSetArchived: (id: string, archived: boolean) => void
  pending: boolean
  /** Multi-surface projects: show which surfaces a tagged source is scoped to. */
  showSurfaces?: boolean
  view: ViewMode
}

function SourceRows({ sources, view, ...rest }: RowProps) {
  if (sources.length === 0) return <SourcesEmpty />
  if (view === "cards") return <SourceCards sources={sources} view={view} {...rest} />
  return (
    <div className="bg-card overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Source</TableHead>
            <TableHead className="w-36">Area</TableHead>
            <TableHead className="w-28">Access</TableHead>
            <TableHead className="w-64">Distilled into</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.map((s) => {
            const doc = resolveInAppDoc(s)
            const isArchived = rest.archivedSet.has(s.id)
            return (
              <TableRow
                key={s.id}
                // A distilled digest opens in-app; the whole row is the target.
                onClick={doc ? () => rest.onOpen(s) : undefined}
                role={doc ? "button" : undefined}
                tabIndex={doc ? 0 : undefined}
                onKeyDown={
                  doc
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          rest.onOpen(s)
                        }
                      }
                    : undefined
                }
                className={cn(
                  doc && "hover:bg-muted/40 cursor-pointer",
                  isArchived && "opacity-55"
                )}
              >
                <TableCell className="font-medium">
                  <span className="flex min-w-0 items-center gap-3">
                    <KindGlyph kind={s.kind} />
                    <span className="min-w-0">
                      <span className={cn("block truncate", isArchived && "line-through")}>
                        {s.title}
                      </span>
                      {/* One line, full text on hover — scan first, prose in
                          the drawer. The old multi-line previews drowned the
                          list. */}
                      {s.notes && (
                        <span
                          className="text-muted-foreground block max-w-xl truncate text-xs font-normal"
                          title={s.notes}
                        >
                          {s.notes}
                        </span>
                      )}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {s.area}
                  {rest.showSurfaces && s.surfaces && s.surfaces.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {s.surfaces.map((id) => (
                        <Badge key={id} variant="outline" className="text-muted-foreground text-3xs">
                          {surfaceLabel(id)}
                        </Badge>
                      ))}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {(() => {
                    const badge = accessBadge(s)
                    return <StatusBadge status={badge.tone}>{badge.label}</StatusBadge>
                  })()}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-64 text-xs">
                  {s.distilledInto ? (
                    <span className="block truncate font-mono" title={s.distilledInto}>
                      {s.distilledInto}
                    </span>
                  ) : (
                    <span className="text-warning">not distilled yet</span>
                  )}
                </TableCell>
                <TableCell>
                  <SourceMenu source={s} isArchived={isArchived} {...rest} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function SourceCards({ sources, ...rest }: RowProps) {
  return (
    <div className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sources.map((s) => {
        const doc = resolveInAppDoc(s)
        const isArchived = rest.archivedSet.has(s.id)
        const badge = accessBadge(s)
        return (
          <Card
            key={s.id}
            onClick={doc ? () => rest.onOpen(s) : undefined}
            role={doc ? "button" : undefined}
            tabIndex={doc ? 0 : undefined}
            onKeyDown={
              doc
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      rest.onOpen(s)
                    }
                  }
                : undefined
            }
            className={cn(
              "flex h-full flex-col gap-3 p-4",
              doc && "hover:border-foreground/20 card-lift cursor-pointer",
              isArchived && "opacity-55"
            )}
          >
            <div className="flex items-start gap-3">
              <KindGlyph kind={s.kind} />
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-medium", isArchived && "line-through")}>
                  {s.title}
                </span>
                <span className="text-muted-foreground font-mono text-2xs">{s.area}</span>
              </span>
              <SourceMenu source={s} isArchived={isArchived} {...rest} />
            </div>
            {s.notes && (
              <p className="text-muted-foreground line-clamp-3 text-xs" title={s.notes}>
                {s.notes}
              </p>
            )}
            <div className="mt-auto flex flex-wrap items-center gap-2">
              <StatusBadge status={badge.tone} className="text-3xs">
                {badge.label}
              </StatusBadge>
              {rest.showSurfaces &&
                s.surfaces?.map((id) => (
                  <Badge key={id} variant="outline" className="text-muted-foreground text-3xs">
                    {surfaceLabel(id)}
                  </Badge>
                ))}
              {s.distilledInto && (
                <span
                  className="text-muted-foreground/70 min-w-0 flex-1 truncate text-right font-mono text-2xs"
                  title={s.distilledInto}
                >
                  {s.distilledInto}
                </span>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function SourceMenu({
  source: s,
  isArchived,
  onOpen,
  onSetArchived,
  pending,
}: {
  source: KnowledgeSource
  isArchived: boolean
} & Pick<RowProps, "onOpen" | "onSetArchived" | "pending">) {
  const doc = resolveInAppDoc(s)
  const external = isExternalUrl(s.url)
  const hasOpen = doc || (s.url && external)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          // The row/card click opens the drawer — keep the menu from
          // triggering it too.
          onClick={(e) => e.stopPropagation()}
          aria-label={`Actions for ${s.title}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {doc && (
          <DropdownMenuItem onSelect={() => onOpen(s)}>
            <PanelRightOpen />
            Open digest
          </DropdownMenuItem>
        )}
        {s.url && external && (
          <DropdownMenuItem asChild>
            <a href={s.url} target="_blank" rel="noreferrer">
              <ExternalLink />
              Open source
            </a>
          </DropdownMenuItem>
        )}
        {hasOpen && <DropdownMenuSeparator />}
        <DropdownMenuItem
          disabled={pending}
          onSelect={() => onSetArchived(s.id, !isArchived)}
        >
          {isArchived ? <ArchiveRestore /> : <Archive />}
          {isArchived ? "Restore" : "Remove from knowledge"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
