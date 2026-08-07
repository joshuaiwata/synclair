"use client"

import * as React from "react"

import { Puzzle } from "lucide-react"

import { PillToggle } from "@/components/pill-toggle"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { CapabilityLayer } from "@/lib/system/capability-categories"
import type { McpServerEntry } from "@/lib/system/mcp-servers"
import { project } from "@/lib/system/seed/project"

/**
 * The MCP servers tab — the same Origin filter the Skills/Agents tabs use
 * (a server either ships with Synclair or is this project's connected
 * service), and clicking a server opens a sheet with everything it serves.
 * The synclair server's tool list is live from the shared registry, so what
 * this drawer shows IS what an agent's tools/list returns.
 */
export function McpServerTables({ servers }: { servers: McpServerEntry[] }) {
  const [filter, setFilter] = React.useState<CapabilityLayer>("project")
  const [open, setOpen] = React.useState<McpServerEntry | null>(null)

  const counts = {
    foundation: servers.filter((s) => s.layer === "foundation").length,
    project: servers.filter((s) => s.layer === "project").length,
  }
  const filtered = servers.filter((s) => s.layer === filter)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Origin</span>
        <PillToggle
          aria-label="Origin"
          value={filter}
          onValueChange={(v) => setFilter(v as CapabilityLayer)}
          options={[
            { value: "project", label: project.name, count: counts.project },
            {
              value: "foundation",
              label: "Synclair",
              count: counts.foundation,
            },
          ]}
        />
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-52">Server</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead>Role in the flow</TableHead>
              <TableHead className="w-20 text-right">Tools</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((server) => (
              <TableRow
                key={server.name}
                className="cursor-pointer"
                onClick={() => setOpen(server)}
              >
                <TableCell className="font-mono text-xs font-medium">
                  {server.name}
                </TableCell>
                <TableCell>
                  <StatusBadge status={server.status}>
                    {server.statusLabel}
                  </StatusBadge>
                </TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  {server.role}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                  {server.tools ? server.tools.length : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet
        open={open !== null}
        onOpenChange={(next) => !next && setOpen(null)}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-lg"
        >
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono">{open.name}</SheetTitle>
                <SheetDescription>{open.role}</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-1 px-4 pb-6">
                {open.tools ? (
                  <>
                    <p className="pb-2 text-xs text-muted-foreground">
                      {open.tools.length} tools, live from the registry —
                      identical over stdio and the hosted endpoint. Extension
                      tools appear while their extension is enabled.
                    </p>
                    {open.tools.map((tool) => (
                      <div key={tool.name} className="rounded-md border p-3">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-xs font-medium">
                            {tool.name}
                          </p>
                          {tool.fromExtension && (
                            <Badge
                              variant="outline"
                              className="gap-1 text-muted-foreground"
                            >
                              <Puzzle className="size-3" />
                              extension
                            </Badge>
                          )}
                        </div>
                        <p className="pt-1 text-xs whitespace-normal text-muted-foreground">
                          {tool.description}
                        </p>
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This server&rsquo;s tools are discovered by the agent at
                    runtime — the hub doesn&rsquo;t introspect external
                    services.
                  </p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
