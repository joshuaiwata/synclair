import { ArrowUpRight } from "lucide-react"

import { DefinitionList } from "@/components/definition-list"
import { HubPage } from "@/components/hub-page"
import { PillToggle } from "@/components/pill-toggle"
import { SectionHeader } from "@/components/section-header"
import { StatGrid } from "@/components/stat-grid"
import { StatusBadge } from "@/components/status-badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { stack } from "@/lib/synclair-data"
import { getExternalCatalog } from "@/lib/system/external"
import { formatDay } from "@/lib/system/format-date"
import { getFoundationStatus, MOTHER_REPO, MOTHER_URL } from "@/lib/system/mother"
import { synclair } from "@/lib/system/routes"
import { project } from "@/lib/system/seed/project"
import { getSystemMap } from "@/lib/system/system-map"

export const dynamic = "force-dynamic"

export default async function EnvironmentPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const { view } = await searchParams
  // Default to the project — no one starts here to read Synclair's own runtime.
  const active = view === "synclair" ? "synclair" : "project"

  const [{ stackFacts, integrations, repo }, catalog, foundation] = await Promise.all([
    getSystemMap(),
    getExternalCatalog(),
    // Only calls home when the clone opted in (data/mother.json) — otherwise
    // resolves locally to "off" with zero network.
    active === "synclair" ? getFoundationStatus() : Promise.resolve(null),
  ])
  const host = catalog.hosts[0]
  const companion = Boolean(host)
  const projectHasData = stackFacts.length > 0 || integrations.length > 0

  // Same pill vocabulary as the library FilterBar / AI Setup Origin filter, so
  // every Project↔Synclair toggle across the app reads identically.
  const pills = [
    { value: "project", label: project.name, href: synclair("/environment") },
    { value: "synclair", label: "Synclair", href: `${synclair("/environment")}?view=synclair` },
  ]

  // Synclair's own runtime — operational facts (framework versions live in the
  // Stack table below, so these stay drift-free).
  const server: { setting: string; value: React.ReactNode }[] = [
    { setting: "Dev server", value: <code className="font-mono text-xs">npm run dev</code> },
    {
      setting: "URL",
      value: <code className="font-mono text-xs">http://localhost:4100{synclair()}</code>,
    },
    {
      setting: "Port",
      value: companion
        ? "4100 — dedicated to Synclair; the host app reserves 3000"
        : "4100 — dedicated to this project",
    },
    { setting: "Verify", value: <code className="font-mono text-xs">npm run verify-ui</code> },
    {
      setting: "Deploy target",
      value: companion
        ? "Local companion — runs on your machine beside the host repo; nothing is deployed into the host"
        : "Not configured — local dev only",
    },
  ]

  return (
    <HubPage
      title="Environment"
      meta={<span className="text-muted-foreground font-mono text-xs">stack &amp; services</span>}
      lead={
        <>
          The environment this runs in — {project.name} itself, and Synclair beside it. The full
          architecture (areas, APIs, data model, jobs) is in the{" "}
          <a href={synclair("/system")} className="underline-offset-2 hover:underline">
            System Map
          </a>
          .
        </>
      }
    >
      <PillToggle aria-label="Environment view" value={active} options={pills} />

      {/* Project — the product's own environment, pulled live from the System Map. */}
      {active === "project" &&
        (!projectHasData ? (
          <div className="text-muted-foreground rounded-lg border p-4 text-sm">
            No environment digest yet — run the{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">codebase-map</code>{" "}
            skill to generate the System Map, and {project.name}&rsquo;s stack &amp; services show
            up here.
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {stackFacts.length > 0 && (
              <section className="flex flex-col gap-3">
                <SectionHeader title="Stack" hint="what it's built on" />
                <StatGrid items={stackFacts} />
              </section>
            )}

            {integrations.length > 0 && (
              <section className="flex flex-col gap-3">
                <SectionHeader title="Services" hint="external systems it runs against" />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-56">Service</TableHead>
                      <TableHead className="w-32">Kind</TableHead>
                      <TableHead>Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {integrations.map((s, i) => (
                      <TableRow key={`${s.name}-${i}`}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {s.kind ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-normal">
                          {s.summary ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            )}

            {repo?.digestedAt && (
              <p className="text-muted-foreground/70 text-xs">
                From the System Map digest
                {repo.commit ? ` at ${repo.commit.slice(0, 7)}` : ""}, {formatDay(repo.digestedAt)}.
              </p>
            )}
          </div>
        ))}

      {/* Synclair — the companion's own runtime. */}
      {active === "synclair" && (
        <div className="flex flex-col gap-8">
          {foundation && (
            <section className="flex flex-col gap-3">
              <SectionHeader title="Foundation" hint="freshness against the mother repo" />
              <DefinitionList
                items={[
                  {
                    term: "Mother repo",
                    description: (
                      <a
                        href={MOTHER_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="group inline-flex items-center gap-1 underline-offset-2 hover:underline"
                      >
                        {MOTHER_REPO}
                        <ArrowUpRight className="text-muted-foreground/60 size-3" />
                      </a>
                    ),
                  },
                  {
                    term: "Baseline",
                    description: foundation.record.commit ? (
                      <span>
                        <code className="font-mono text-xs">
                          {foundation.record.commit.slice(0, 7)}
                        </code>
                        {foundation.record.syncedAt && (
                          <span className="text-muted-foreground">
                            {" "}
                            · synced {formatDay(foundation.record.syncedAt)}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        not recorded — anchor with{" "}
                        <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                          npm run call-home -- --anchor latest
                        </code>
                      </span>
                    ),
                  },
                  {
                    term: "Updates",
                    description:
                      foundation.state === "off" ? (
                        <span className="text-muted-foreground">
                          call-home is off (the default) — this clone never checks. Opt in with{" "}
                          <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                            npm run call-home -- --enable
                          </code>
                        </span>
                      ) : foundation.state === "unanchored" ? (
                        <span className="text-muted-foreground">
                          opted in, but no baseline to compare against yet.
                        </span>
                      ) : foundation.state === "unreachable" ? (
                        <StatusBadge status="neutral">mother repo unreachable</StatusBadge>
                      ) : foundation.state === "current" ? (
                        <StatusBadge status="success">up to date</StatusBadge>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <div>
                            <StatusBadge status="warning">
                              {foundation.behindBy} update
                              {foundation.behindBy === 1 ? "" : "s"} available
                            </StatusBadge>
                          </div>
                          <ul className="flex flex-col gap-1">
                            {foundation.commits.slice(0, 5).map((c) => (
                              <li key={c.sha} className="text-muted-foreground text-xs">
                                <code className="font-mono">{c.sha.slice(0, 7)}</code>{" "}
                                <a
                                  href={c.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline-offset-2 hover:underline"
                                >
                                  {c.title}
                                </a>
                              </li>
                            ))}
                            {foundation.behindBy > 5 && (
                              <li className="text-muted-foreground/70 text-xs">
                                …and {foundation.behindBy - 5} more —{" "}
                                <a
                                  href={foundation.compareUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline-offset-2 hover:underline"
                                >
                                  full diff
                                </a>
                              </li>
                            )}
                          </ul>
                          <p className="text-muted-foreground text-xs">
                            Pull deliberately with the{" "}
                            <code className="bg-muted rounded px-1 py-0.5 font-mono">
                              synclair-sync
                            </code>{" "}
                            skill — the seed never syncs.
                          </p>
                        </div>
                      ),
                  },
                ]}
              />
            </section>
          )}

          <section className="flex flex-col gap-3">
            <SectionHeader title="Server" hint="how & where Synclair runs" />
            <DefinitionList
              items={server.map((row) => ({ term: row.setting, description: row.value }))}
            />
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader title="Stack" hint="what Synclair is built on" />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Layer</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stack.map((row) => (
                  <TableRow key={row.layer}>
                    <TableCell className="font-medium">
                      {row.href ? (
                        <a
                          href={row.href}
                          target={row.href.startsWith("http") ? "_blank" : undefined}
                          rel={row.href.startsWith("http") ? "noreferrer" : undefined}
                          className="group inline-flex items-center gap-1 underline-offset-2 hover:underline"
                        >
                          {row.layer}
                          <ArrowUpRight className="text-muted-foreground/60 size-3" />
                        </a>
                      ) : (
                        row.layer
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status}>{row.statusLabel}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-normal">
                      {row.notes}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </div>
      )}
    </HubPage>
  )
}
