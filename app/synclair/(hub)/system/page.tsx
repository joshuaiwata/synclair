import { Badge } from "@/components/ui/badge"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Markdown } from "@/components/markdown"
import { SummaryShell } from "@/components/summary-shell"
import { HubPage } from "@/components/hub-page"
import { StatGrid } from "@/components/stat-grid"
import { DataModelDiagram } from "@/components/library/data-model-diagram"
import { formatDay } from "@/lib/system/format-date"
import { Network, TriangleAlert } from "lucide-react"

import {
  getSurfaces,
  isMultiSurface,
  surfaceLabel,
} from "@/lib/system/surfaces"
import {
  getSystemMap,
  hasSystemMap,
  type SystemArea,
} from "@/lib/system/system-map"

export const dynamic = "force-dynamic"

/**
 * The System Map: what this codebase consists of beyond the component library —
 * areas, API surface, data model, jobs, integrations. Rendered from the digest
 * in data/system-map.json (schema: lib/system/system-map.ts); regenerated via
 * the `codebase-map` skill / `system-mapper` agent.
 */
export default async function SystemMapPage() {
  const map = await getSystemMap()

  if (map.unreadable) {
    return (
      <HubPage title="System Map">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="warning">
              <TriangleAlert />
            </EmptyMedia>
            <EmptyTitle>A system map exists but couldn&rsquo;t be read</EmptyTitle>
            <EmptyDescription>
              <code>data/system-map.json</code> is present but failed to parse (details in the
              server log). Fix the JSON, or regenerate it with the <code>codebase-map</code> skill.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </HubPage>
    )
  }

  if (!hasSystemMap(map)) {
    return (
      <HubPage title="System Map">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Network />
            </EmptyMedia>
            <EmptyTitle>No system map yet</EmptyTitle>
            <EmptyDescription>
              The system map digests what this codebase consists of — areas, API surface, data
              model, background jobs, integrations — so humans and agents can orient without reading
              the source. Generate it by running the <code>codebase-map</code> skill, which sends
              the <code>system-mapper</code> agent through the repo and writes{" "}
              <code>data/system-map.json</code>.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </HubPage>
    )
  }

  const {
    repo,
    stack,
    stackFacts,
    overview,
    overviewSections,
    surfacesNote,
    areas,
    api,
    data,
    jobs,
    integrations,
  } = map

  // Multi-surface projects: group areas by frontend, shared backend first.
  // Untagged entries are shared (back-compat: pre-surfaces maps group as one).
  const multiSurface = isMultiSurface()
  const areaGroups: [string, SystemArea[]][] = multiSurface
    ? (
        [
          ["Shared", areas.filter((a) => !a.surface || a.surface === "shared")],
          ...getSurfaces().map(
            (s) =>
              [s.label, areas.filter((a) => a.surface === s.id)] as [
                string,
                SystemArea[],
              ]
          ),
        ] as [string, SystemArea[]][]
      ).filter(([, group]) => group.length > 0)
    : [["", areas]]
  const surfaceChip = (surface?: string) =>
    multiSurface && surface && surface !== "shared" ? (
      <Badge
        variant="outline"
        className="ml-1.5 text-3xs text-muted-foreground"
      >
        {surfaceLabel(surface)}
      </Badge>
    ) : null

  // Tabs (Summary first / default), each shown only when it has content. The
  // one-giant-page view is broken up so a reader lands on orientation, then digs
  // into the dimension they want — and each tab picks the mode that reads best
  // (the data model as a relationship diagram, not a flat table).
  // The distilled read renders exactly like the Knowledge summary, per the
  // `doc-quality` standard: one <Markdown> pass inside the shared artifact panel,
  // headings from `##` — no bespoke header treatment or ordinals — so every
  // distilled read across the hub is one system. Structured `overviewSections`
  // are composed into markdown here; a legacy prose `overview` is the fallback.
  const overviewMd = [
    surfacesNote && `## How the repo is divided\n\n${surfacesNote}`,
    ...overviewSections.map((s) => `## ${s.heading}\n\n${s.body}`),
  ]
    .filter(Boolean)
    .join("\n\n")

  // At-a-glance stack grid + the distilled read. Both live INSIDE the Summary
  // tab (not above the tab strip) — orientation you want when reading the
  // summary, not repeated over every other tab.
  const summaryTab = (
    <div className="flex flex-col gap-6">
      {stackFacts.length > 0 ? (
        <StatGrid items={stackFacts} />
      ) : (
        stack && (
          <div className="max-w-3xl text-sm">
            <Markdown>{stack}</Markdown>
          </div>
        )
      )}
      {(overviewMd || overview) && (
        <SummaryShell content={overviewMd || overview || ""} fallbackTitle="System overview" />
      )}
    </div>
  )

  const areasTab = (
    <div className="flex flex-col gap-4">
      {areaGroups.map(([label, group]) => (
        <div key={label || "areas"} className="flex flex-col gap-2">
          {label && (
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {label}
            </h3>
          )}
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Area</TableHead>
                  <TableHead className="w-56">Path</TableHead>
                  <TableHead>What lives here</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.map((a, i) => (
                  <TableRow key={`${a.path}-${i}`}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {a.path}
                    </TableCell>
                    <TableCell className="text-xs whitespace-normal text-muted-foreground">
                      {a.summary}
                      {a.details && (
                        <div className="mt-1 text-muted-foreground/80">
                          <Markdown>{a.details}</Markdown>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  )

  const apiTab = (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Method</TableHead>
            <TableHead className="w-72">Path</TableHead>
            <TableHead>Does</TableHead>
            <TableHead className="w-64">Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {api.map((e, i) => (
            <TableRow key={`${e.method} ${e.path} ${i}`}>
              <TableCell>
                <Badge variant="secondary" className="font-mono text-3xs">
                  {e.method}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {e.path}
                {surfaceChip(e.surface)}
              </TableCell>
              <TableCell className="text-xs whitespace-normal text-muted-foreground">
                {e.summary ?? ""}
              </TableCell>
              <TableCell className="font-mono text-2xs text-muted-foreground/80">
                {e.source ?? ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )

  const dataTab = (
    <div className="flex flex-col gap-4">
      <DataModelDiagram entities={data} />
      <Accordion type="multiple" className="rounded-lg border bg-card px-4">
        {data.map((d, i) => (
          <AccordionItem key={`${d.name}-${i}`} value={`${d.name}-${i}`}>
            <AccordionTrigger className="text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-medium">{d.name}</span>
                {d.kind && (
                  <Badge
                    variant="outline"
                    className="text-3xs text-muted-foreground"
                  >
                    {d.kind}
                  </Badge>
                )}
                {d.summary && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {d.summary}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-2">
              {d.fields?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-48">Field</TableHead>
                      <TableHead className="w-40">Type</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.fields.map((f) => (
                      <TableRow key={f.name}>
                        <TableCell className="font-mono text-xs">
                          {f.name}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {f.type ?? ""}
                        </TableCell>
                        <TableCell className="text-xs whitespace-normal text-muted-foreground">
                          {f.note ?? ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No fields digested.
                </p>
              )}
              {d.source && (
                <p className="font-mono text-2xs text-muted-foreground/80">
                  {d.source}
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )

  const jobsTab = (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-48">Job</TableHead>
            <TableHead className="w-48">Trigger</TableHead>
            <TableHead>Does</TableHead>
            <TableHead className="w-64">Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((j, i) => (
            <TableRow key={`${j.name}-${i}`}>
              <TableCell className="font-medium">
                {j.name}
                {surfaceChip(j.surface)}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {j.trigger}
              </TableCell>
              <TableCell className="text-xs whitespace-normal text-muted-foreground">
                {j.summary ?? ""}
              </TableCell>
              <TableCell className="font-mono text-2xs text-muted-foreground/80">
                {j.source ?? ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )

  const integrationsTab = (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-56">Service</TableHead>
            <TableHead className="w-32">Kind</TableHead>
            <TableHead>What it does</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {integrations.map((s, i) => (
            <TableRow key={`${s.name}-${i}`}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell>
                {s.kind && (
                  <Badge
                    variant="outline"
                    className="text-3xs text-muted-foreground"
                  >
                    {s.kind}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-xs whitespace-normal text-muted-foreground">
                {s.summary ?? ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )

  const hasSummary = Boolean(
    stackFacts.length > 0 ||
      stack ||
      overviewSections.length > 0 ||
      overview ||
      surfacesNote
  )
  const tabs = [
    hasSummary && { value: "summary", label: "Summary", node: summaryTab },
    areas.length > 0 && {
      value: "areas",
      label: "Areas",
      count: areas.length,
      node: areasTab,
    },
    api.length > 0 && {
      value: "api",
      label: "API",
      count: api.length,
      node: apiTab,
    },
    data.length > 0 && {
      value: "data",
      label: "Data model",
      count: data.length,
      node: dataTab,
    },
    jobs.length > 0 && {
      value: "jobs",
      label: "Jobs",
      count: jobs.length,
      node: jobsTab,
    },
    integrations.length > 0 && {
      value: "integrations",
      label: "Integrations",
      count: integrations.length,
      node: integrationsTab,
    },
  ].filter(Boolean) as {
    value: string
    label: string
    count?: number
    node: React.ReactNode
  }[]

  return (
    <HubPage
      title="System Map"
      meta={
        <>
          <span className="font-mono text-xs text-muted-foreground">{repo!.name}</span>
          <Badge variant="outline" className="text-2xs text-muted-foreground">
            {repo!.root === null ? "this repo" : "host repo"}
          </Badge>
        </>
      }
      lead={
        <>
          What this codebase consists of beyond the UI — areas, API surface, data model, background
          jobs, integrations — so humans and agents orient without reading the source.{" "}
          <span className="text-muted-foreground/70">
            A snapshot digested {formatDay(repo!.digestedAt)}
            {repo!.commit && (
              <>
                {" "}
                at commit{" "}
                <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                  {repo!.commit.slice(0, 7)}
                </code>
              </>
            )}
            , not live — regenerate via the{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">codebase-map</code> skill
            when it drifts.
          </span>
        </>
      }
    >
        {tabs.length > 0 && (
          <Tabs defaultValue={tabs[0].value} className="gap-5">
            <TabsList>
              {tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                  {typeof t.count === "number" && (
                    <span className="text-muted-foreground ml-1.5 text-xs tabular-nums">
                      {t.count}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            {tabs.map((t) => (
              <TabsContent key={t.value} value={t.value} className="mt-0">
                {t.node}
              </TabsContent>
            ))}
          </Tabs>
        )}
    </HubPage>
  )
}
