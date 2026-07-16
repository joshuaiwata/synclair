"use client"

import { useMemo, useState } from "react"
import { ChevronRight, ExternalLink, Search, Star } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ManifestFile } from "@/lib/figma/manifest"
import { relativeTime } from "@/lib/format"
import type { FileDistillStatus } from "@/lib/system/knowledge/distill-status"
import { cn } from "@/lib/utils"

import { DistillControl } from "./distill-control"
import { StarToggle } from "./star-toggle"

interface ProjectGroup {
  id: string
  name: string
  files: ManifestFile[]
  /** newest lastModified in the group, for sorting + the header hint */
  latest: string
  /** the pinned favorites group, rendered first with a star header */
  favorites?: boolean
}

const EMPTY_STATUS: FileDistillStatus = { state: "none", pages: 0, queued: false }
const FAVORITES_ID = "__favorites__"

export function FilesTable({
  files,
  statuses,
  starred,
}: {
  files: ManifestFile[]
  statuses: Record<string, FileDistillStatus>
  starred: string[]
}) {
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const starredSet = useMemo(() => new Set(starred), [starred])

  const groups = useMemo<ProjectGroup[]>(() => {
    const q = query.trim().toLowerCase()
    const visible = q
      ? files.filter(
          (f) =>
            f.name.toLowerCase().includes(q) ||
            f.projectName.toLowerCase().includes(q)
        )
      : files

    const byProject = new Map<string, ProjectGroup>()
    for (const f of visible) {
      const g = byProject.get(f.projectId)
      if (g) {
        g.files.push(f)
        if (f.lastModified > g.latest) g.latest = f.lastModified
      } else {
        byProject.set(f.projectId, {
          id: f.projectId,
          name: f.projectName,
          files: [f],
          latest: f.lastModified,
        })
      }
    }
    const projectGroups = [...byProject.values()].sort((a, b) =>
      b.latest.localeCompare(a.latest)
    )

    // Pin a Favorites group first — starred files gathered across projects.
    const favFiles = visible
      .filter((f) => starredSet.has(f.key))
      .sort((a, b) => b.lastModified.localeCompare(a.lastModified))
    if (favFiles.length === 0) return projectGroups
    return [
      {
        id: FAVORITES_ID,
        name: "Favorites",
        files: favFiles,
        latest: favFiles[0].lastModified,
        favorites: true,
      },
      ...projectGroups,
    ]
  }, [files, query, starredSet])

  // Don't count the Favorites group (its files are duplicated from projects).
  const projectGroups = groups.filter((g) => !g.favorites)
  const projectCount = projectGroups.length
  const totalVisible = projectGroups.reduce((n, g) => n + g.files.length, 0)
  const allCollapsed = groups.length > 0 && collapsed.size === groups.length

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.id)))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by file or project…"
          className="h-8 w-64"
        />
        <span className="text-xs text-muted-foreground">
          {projectCount} project{projectCount === 1 ? "" : "s"} ·{" "}
          {totalVisible} file{totalVisible === 1 ? "" : "s"}
        </span>
        {groups.length > 0 && (
          <button
            type="button"
            onClick={toggleAll}
            className="ml-auto cursor-pointer text-xs text-muted-foreground hover:text-foreground"
          >
            {allCollapsed ? "Expand all" : "Collapse all"}
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>No files match the current filter</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.id)
            return (
              <div key={g.id} className="overflow-hidden rounded-lg border">
                <button
                  type="button"
                  onClick={() => toggle(g.id)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left",
                    g.favorites
                      ? "bg-warning/10 hover:bg-warning/15"
                      : "bg-muted/40 hover:bg-muted/60"
                  )}
                >
                  <ChevronRight
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      !isCollapsed && "rotate-90"
                    )}
                  />
                  {g.favorites && (
                    <Star className="text-warning size-4 shrink-0 fill-current" />
                  )}
                  <span className="text-sm font-medium">{g.name}</span>
                  <Badge variant="secondary" className="font-normal">
                    {g.files.length}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    updated {relativeTime(g.latest)}
                  </span>
                </button>

                {!isCollapsed && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File</TableHead>
                        <TableHead className="w-32">Modified</TableHead>
                        <TableHead className="w-44">Key</TableHead>
                        <TableHead className="w-56 text-right">Knowledge</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.files.map((f) => (
                        <TableRow key={f.key}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <StarToggle
                                fileKey={f.key}
                                starred={starredSet.has(f.key)}
                              />
                              <a
                                href={`https://www.figma.com/design/${f.key}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 hover:underline"
                              >
                                {f.name}
                                <ExternalLink className="size-3 opacity-40" />
                              </a>
                            </div>
                          </TableCell>
                          <TableCell
                            className="text-muted-foreground"
                            title={new Date(f.lastModified).toLocaleString()}
                          >
                            {relativeTime(f.lastModified)}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground/70">
                            {f.key}
                          </TableCell>
                          <TableCell className="text-right">
                            <DistillControl
                              fileKey={f.key}
                              fileName={f.name}
                              status={statuses[f.key] ?? EMPTY_STATUS}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
