"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Archive, ArchiveRestore, ExternalLink, MoreHorizontal, PanelRightOpen } from "lucide-react"

import { PillToggle } from "@/components/pill-toggle"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isExternalUrl, resolveInAppDoc } from "@/lib/system/knowledge/in-app-doc"
import type {
  KnowledgeAccess,
  KnowledgeSource,
  KnowledgeSourceKind,
} from "@/lib/system/knowledge/types"
import { getSurfaces, isMultiSurface, surfaceLabel } from "@/lib/system/surfaces"
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
  const [pending, start] = useTransition()
  const router = useRouter()

  // Surface scope (multi-surface projects). Knowledge is SHARED by default: an
  // untagged source applies to every surface, so it shows in every scope —
  // scoping only hides sources explicitly tagged to OTHER surfaces.
  const multiSurface = isMultiSurface()
  const [scope, setScope] = useState<string>("all")
  const inScope = (s: KnowledgeSource) =>
    scope === "all" || !s.surfaces?.length || s.surfaces.includes(scope)
  const scoped = sources.filter(inScope)

  // Archived sources are soft-removed: hidden by default, revealed by the toggle.
  const archivedSet = new Set(archivedIds)
  const archivedCount = scoped.filter((s) => archivedSet.has(s.id)).length
  const visible = showArchived ? scoped : scoped.filter((s) => !archivedSet.has(s.id))

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

  return (
    <>
      <Tabs defaultValue={defaultTab} className="gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            {/* The distilled onboarding brief leads; source-kind filters follow. */}
            <TabsTrigger value="summary">Summary</TabsTrigger>
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                <span className="text-muted-foreground ml-1.5 text-xs tabular-nums">
                  {t.count}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex items-center gap-3">
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
            {multiSurface && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">Surface</span>
                <PillToggle
                  aria-label="Surface"
                  value={scope}
                  onValueChange={setScope}
                  options={[{ id: "all", label: "All" }, ...getSurfaces()].map((s) => ({
                    value: s.id,
                    label: s.label,
                  }))}
                />
              </div>
            )}
          </div>
        </div>
        <TabsContent value="summary">
          <SummarySection items={summaryItems} />
        </TabsContent>
        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            <SourceRows
              sources={t.value === "all" ? visible : visible.filter((s) => s.kind === t.value)}
              archivedSet={archivedSet}
              onOpen={setActive}
              onSetArchived={toggleArchived}
              pending={pending}
              showSurfaces={multiSurface}
            />
          </TabsContent>
        ))}
      </Tabs>
      <KnowledgeDocDrawer source={active} onClose={() => setActive(null)} />
    </>
  )
}

function SourceRows({
  sources,
  archivedSet,
  onOpen,
  onSetArchived,
  pending,
  showSurfaces = false,
}: {
  sources: KnowledgeSource[]
  /** Ids of soft-removed sources — rendered dimmed, with Restore in the menu. */
  archivedSet: Set<string>
  onOpen: (s: KnowledgeSource) => void
  onSetArchived: (id: string, archived: boolean) => void
  pending: boolean
  /** Multi-surface projects: show which surfaces a tagged source is scoped to. */
  showSurfaces?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-64">Source</TableHead>
            <TableHead className="w-24">Kind</TableHead>
            <TableHead className="w-32">Area</TableHead>
            <TableHead className="w-28">Access</TableHead>
            <TableHead>Distilled into</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.map((s) => {
            const doc = resolveInAppDoc(s)
            const external = isExternalUrl(s.url)
            const isArchived = archivedSet.has(s.id)
            const hasOpen = doc || (s.url && external)
            return (
              <TableRow
                key={s.id}
                // A distilled digest opens in-app; the whole row is the target.
                onClick={doc ? () => onOpen(s) : undefined}
                role={doc ? "button" : undefined}
                tabIndex={doc ? 0 : undefined}
                onKeyDown={
                  doc
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          onOpen(s)
                        }
                      }
                    : undefined
                }
                className={cn(
                  doc && "hover:bg-muted/40 cursor-pointer",
                  isArchived && "opacity-55"
                )}
              >
                <TableCell className={cn("align-top font-medium", isArchived && "line-through")}>
                  {s.title}
                  {s.notes && (
                    <p className="text-muted-foreground mt-1 text-xs font-normal whitespace-normal">
                      {s.notes}
                    </p>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  <Badge variant="outline" className="text-muted-foreground">
                    {s.kind}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground align-top font-mono text-xs">
                  {s.area}
                  {showSurfaces && s.surfaces && s.surfaces.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {s.surfaces.map((id) => (
                        <Badge key={id} variant="outline" className="text-muted-foreground text-3xs">
                          {surfaceLabel(id)}
                        </Badge>
                      ))}
                    </span>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  {(() => {
                    const badge = accessBadge(s)
                    return <StatusBadge status={badge.tone}>{badge.label}</StatusBadge>
                  })()}
                </TableCell>
                <TableCell className="text-muted-foreground align-top text-xs whitespace-normal">
                  {s.distilledInto ?? (
                    <span className="text-warning">not distilled yet</span>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        // Pull the taller button up so its glyph tops-aligns with
                        // the align-top row content beside it.
                        className="-mt-1.5"
                        // The row click opens the drawer — keep the menu from
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
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
