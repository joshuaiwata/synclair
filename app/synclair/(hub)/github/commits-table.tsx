"use client"

import { useState } from "react"

import { ExternalLink, PanelRightOpen } from "lucide-react"

import { StatusBadge } from "@/components/status-badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { CommitSummary } from "@/lib/system/git-log"

import { CommitDrawer } from "./commit-drawer"

export function CommitsTable({
  commits,
  webUrl,
}: {
  commits: CommitSummary[]
  webUrl: string | null
}) {
  const [active, setActive] = useState<CommitSummary | null>(null)

  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Commit</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead className="w-36">Author</TableHead>
              <TableHead className="w-36">When</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {commits.map((c) => (
              <TableRow
                key={c.hash}
                onClick={() => setActive(c)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setActive(c)
                  }
                }}
                className="hover:bg-muted/40 cursor-pointer"
              >
                <TableCell className="text-muted-foreground align-top font-mono text-xs">
                  {c.shortHash}
                </TableCell>
                <TableCell className="align-top font-medium whitespace-normal">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {c.subject}
                    {c.unpushed && <StatusBadge status="warning">not pushed</StatusBadge>}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground align-top text-xs">
                  {c.author}
                </TableCell>
                <TableCell className="text-muted-foreground align-top text-xs">
                  {c.relativeDate}
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex items-center gap-1.5">
                    <PanelRightOpen
                      className="text-muted-foreground size-3.5"
                      aria-hidden
                    />
                    {webUrl && !c.unpushed && (
                      <a
                        href={`${webUrl}/commit/${c.hash}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-muted-foreground hover:text-foreground inline-flex"
                        aria-label={`Open ${c.shortHash} on GitHub`}
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <CommitDrawer commit={active} webUrl={webUrl} onClose={() => setActive(null)} />
    </>
  )
}
