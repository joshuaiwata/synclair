import { revalidatePath } from "next/cache"
import {
  AlertTriangle,
  Camera,
  FileStack,
  FolderKanban,
  GitCompareArrows,
  RefreshCw,
} from "lucide-react"

import { synclair } from "@/lib/system/routes"

import { HubPage } from "@/components/hub-page"
import { SectionHeader } from "@/components/section-header"
import { StatCard } from "@/components/stat-card"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getManifestReport, type FileChange } from "@/lib/figma/manifest"
import { readStars } from "@/lib/figma/stars"
import { relativeTime, shortDateTime } from "@/lib/format"
import { getFileDistillStatuses } from "@/lib/system/knowledge/distill-status"

import { FilesTable } from "./files-table"

export const dynamic = "force-dynamic"

const changeStatus: Record<
  FileChange["kind"],
  { status: "success" | "info" | "warning"; label: string }
> = {
  added: { status: "success", label: "Added" },
  modified: { status: "info", label: "Modified" },
  removed: { status: "warning", label: "Removed" },
}

export default async function FigmaManifestPage() {
  const report = await getManifestReport()
  const distillStatuses = await getFileDistillStatuses(report.files)
  const starred = await readStars()

  async function refresh() {
    "use server"
    await getManifestReport({ force: true })
    revalidatePath(synclair("/figma-manifest"))
  }

  const syncedAt = new Date(report.takenAt).getTime()
  const recentlyEdited = report.files.filter(
    (f) => syncedAt - new Date(f.lastModified).getTime() < 7 * 24 * 3600 * 1000
  )
  const changeCount = report.diff
    ? report.diff.changes.length
    : recentlyEdited.length

  return (
    <HubPage
      title="Figma Manifest"
      meta={
        <>
          {report.takenAt && (
            <span className="font-mono text-xs text-muted-foreground">
              synced {shortDateTime(report.takenAt)}
            </span>
          )}
          <form action={refresh}>
            <Button type="submit" variant="outline" size="sm">
              <RefreshCw />
              Refresh
            </Button>
          </form>
        </>
      }
    >
        {!report.ok && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>
              Live sync failed — showing the last stored snapshot
            </AlertTitle>
            <AlertDescription>{report.error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            value={String(report.files.length)}
            label="Files"
            icon={FileStack}
          />
          <StatCard
            value={String(report.projects.length)}
            label="Projects"
            icon={FolderKanban}
          />
          <StatCard
            value={String(changeCount)}
            label={
              report.diff
                ? `Changes vs ${report.diff.baseDate}`
                : "Edited in last 7 days"
            }
            icon={GitCompareArrows}
          />
          <StatCard
            value={String(report.history.length)}
            label="Snapshots kept"
            icon={Camera}
          />
        </div>

        <Tabs defaultValue="changes" className="gap-6">
          <TabsList>
            <TabsTrigger value="changes">
              <GitCompareArrows />
              Changes
            </TabsTrigger>
            <TabsTrigger value="files">
              <FileStack />
              All files
            </TabsTrigger>
            <TabsTrigger value="snapshots">
              <Camera />
              Snapshots
            </TabsTrigger>
          </TabsList>

          <TabsContent value="changes" className="flex flex-col gap-3">
            {report.diff ? (
              <>
                <SectionHeader
                  title="Changed files"
                  hint={`live vs snapshot ${report.diff.baseDate}`}
                />
                <ChangesTable changes={report.diff.changes} />
              </>
            ) : (
              <>
                <SectionHeader
                  title="Recently edited"
                  hint="last 7 days — diffs start once a previous-day snapshot exists"
                />
                <ChangesTable
                  changes={recentlyEdited.map((file) => ({
                    kind: "modified" as const,
                    file,
                  }))}
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="files">
            <FilesTable
              files={report.files}
              statuses={distillStatuses}
              starred={starred}
            />
          </TabsContent>

          <TabsContent value="snapshots" className="flex flex-col gap-3">
            <SectionHeader
              title="Snapshot history"
              hint="data/figma-manifest/"
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Date</TableHead>
                  <TableHead className="w-40">Taken</TableHead>
                  <TableHead className="w-24">Files</TableHead>
                  <TableHead>Changes vs previous snapshot</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.history.map((s, i) => (
                  <TableRow key={s.date}>
                    <TableCell className="font-mono text-xs font-medium">
                      {s.date}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {shortDateTime(s.takenAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.fileCount}
                    </TableCell>
                    <TableCell>
                      {i === report.history.length - 1 ? (
                        <span className="text-xs text-muted-foreground">
                          baseline
                        </span>
                      ) : (
                        <div className="flex gap-1.5">
                          {s.added > 0 && (
                            <StatusBadge status="success">
                              +{s.added} added
                            </StatusBadge>
                          )}
                          {s.modified > 0 && (
                            <StatusBadge status="info">
                              ~{s.modified} modified
                            </StatusBadge>
                          )}
                          {s.removed > 0 && (
                            <StatusBadge status="warning">
                              −{s.removed} removed
                            </StatusBadge>
                          )}
                          {s.added + s.modified + s.removed === 0 && (
                            <span className="text-xs text-muted-foreground">
                              no changes
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground/70">
              The manifest live-syncs at most once an hour on load (and writes a
              snapshot when it does); hit Refresh to sync now. This keeps the view
              current without hammering Figma&rsquo;s rate limit.
            </p>
          </TabsContent>
        </Tabs>
    </HubPage>
  )
}

function ChangesTable({ changes }: { changes: FileChange[] }) {
  if (changes.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GitCompareArrows />
          </EmptyMedia>
          <EmptyTitle>No design changes</EmptyTitle>
          <EmptyDescription>
            Everything matches the previous snapshot.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">Change</TableHead>
          <TableHead>File</TableHead>
          <TableHead className="w-48">Project</TableHead>
          <TableHead className="w-40">Modified</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {changes.map((c) => {
          const meta = changeStatus[c.kind]
          return (
            <TableRow key={`${c.kind}-${c.file.key}`}>
              <TableCell>
                <StatusBadge status={meta.status}>{meta.label}</StatusBadge>
              </TableCell>
              <TableCell className="font-medium">
                {c.kind === "removed" ? (
                  c.file.name
                ) : (
                  <a
                    href={`https://www.figma.com/design/${c.file.key}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    {c.file.name}
                  </a>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {c.file.projectName}
              </TableCell>
              <TableCell
                className="text-muted-foreground"
                title={new Date(c.file.lastModified).toLocaleString()}
              >
                {relativeTime(c.file.lastModified)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
