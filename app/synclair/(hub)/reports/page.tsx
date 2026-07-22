import {
  ClipboardList,
  LayoutGrid,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { SectionHeader } from "@/components/section-header"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { synclair } from "@/lib/system/routes"
import {
  getLatestReport,
  getReport,
  listReports,
  liveReportCounts,
  verifyReportCounts,
  type RecommendationStatus,
} from "@/lib/system/reports"

export const dynamic = "force-dynamic"

/**
 * The Reports surface — renders build/coverage reports from `data/reports/*.json`
 * (see `lib/system/reports.ts`), never from inlined content. Shows the latest by
 * default with an archive of past runs; numeric stats are re-derived + verified
 * against the hub's own catalog so they can't drift. Reports themselves are seed,
 * written by the `build-report` skill.
 */

const AREA_STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  mapped: { label: "mapped", cls: "text-success", dot: "bg-success" },
  partial: { label: "partial", cls: "text-warning", dot: "bg-warning" },
  gap: { label: "gap", cls: "text-destructive", dot: "bg-destructive" },
  missing: { label: "missing", cls: "text-destructive", dot: "bg-destructive" },
}

const REC_STATUS: Record<RecommendationStatus, { label: string; variant: "secondary" | "outline"; cls: string }> = {
  open: { label: "open", variant: "outline", cls: "text-muted-foreground" },
  "in-progress": { label: "in progress", variant: "secondary", cls: "text-warning" },
  done: { label: "done", variant: "secondary", cls: "text-success" },
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id } = await searchParams
  const all = await listReports()
  const r = id ? await getReport(id) : await getLatestReport()

  if (!r) {
    return (
      <>
        <PageHeader title="Reports" />
        <main className="mx-auto w-full max-w-6xl p-6">
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClipboardList />
              </EmptyMedia>
              <EmptyTitle>No reports yet</EmptyTitle>
              <EmptyDescription>
                Run the <code className="font-mono text-xs">build-report</code> skill to generate a
                build/coverage report. Each run writes a dated{" "}
                <code className="font-mono text-xs">data/reports/*.json</code> — they archive, they
                don&rsquo;t overwrite.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </main>
      </>
    )
  }

  // Re-derive counts from the hub's own data; flag any stat that disagrees.
  const live = await liveReportCounts()
  const mismatches = await verifyReportCounts(r)
  const statValue = (s: { value: string; derivedFrom?: "components" | "blocks" | "templates" }) =>
    s.derivedFrom ? String(live[s.derivedFrom]) : s.value

  return (
    <>
      <PageHeader title="Reports">
        <Badge
          variant="secondary"
          className={`gap-1.5 font-mono font-normal ${mismatches.length ? "text-warning" : ""}`}
        >
          {mismatches.length ? <ShieldAlert className="size-3" /> : <ShieldCheck className="size-3" />}
          {mismatches.length ? `${mismatches.length} count mismatch` : "verified"} · {r.date}
        </Badge>
      </PageHeader>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 p-6 md:p-8">
        {/* Archive — past runs, never destroyed */}
        {all.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground font-mono text-2xs uppercase tracking-wider">
              archive
            </span>
            {all.map((doc) => (
              <a
                key={doc.id}
                href={doc.id === (id ?? all[0].id) ? synclair("/reports") : `${synclair("/reports")}?id=${doc.id}`}
                className={`rounded-md border px-2 py-1 font-mono text-2xs ${
                  doc.id === r.id
                    ? "border-primary text-primary"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {doc.date}
              </a>
            ))}
          </div>
        )}

        {mismatches.length > 0 && (
          <Card className="text-warning flex gap-3 border-l-4 border-l-warning p-4 text-sm">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-foreground font-medium">This report&rsquo;s counts disagree with the hub.</p>
              <ul className="text-muted-foreground mt-1 font-mono text-2xs">
                {mismatches.map((m) => (
                  <li key={m.label}>
                    {m.label}: report says {m.claimed}, hub has {m.actual}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        )}

        {/* Hero */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1.5">
              <ClipboardList className="size-3" />
              {r.type}
            </Badge>
            <span className="text-muted-foreground font-mono text-xs">
              subject: {r.subject}
              {r.lens ? ` · ${r.lens}` : ""} · {r.date}
            </span>
          </div>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-balance md:text-4xl">
            {r.headline}
          </h1>
          {r.dek && (
            <p className="text-muted-foreground max-w-2xl text-base leading-relaxed">{r.dek}</p>
          )}
          {r.stats && r.stats.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-3">
              {r.stats.map((s) => (
                <Card key={s.label} className="flex flex-col gap-1 px-4 py-3">
                  <span
                    className={`font-mono text-2xl font-bold tabular-nums tracking-tight ${s.accent ? "text-primary" : ""}`}
                  >
                    {statValue(s)}
                  </span>
                  <span className="text-muted-foreground font-mono text-2xs uppercase tracking-wider">
                    {s.label}
                  </span>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Surfaces */}
        {r.surfaces && r.surfaces.length > 0 && (
          <section className="flex flex-col gap-4">
            <SectionHeader title="The shape of things" />
            <div className="grid gap-3 sm:grid-cols-3">
              {r.surfaces.map((s) => (
                <Card key={s.name} className="flex flex-col gap-2 p-4">
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="text-muted-foreground size-4" />
                    <span className="font-semibold">{s.name}</span>
                  </div>
                  {s.note && <span className="text-muted-foreground text-xs">{s.note}</span>}
                  {s.scope && (
                    <Badge variant="outline" className="mt-1 w-fit font-mono text-2xs font-normal">
                      {s.scope}
                    </Badge>
                  )}
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Readiness pillars */}
        {r.pillars && r.pillars.length > 0 && (
          <section className="flex flex-col gap-4">
            <SectionHeader title="How ready is it — and for what?" hint={r.lens} />
            <Card className="flex flex-col gap-4 p-5">
              {r.pillars.map((p) => (
                <div key={p.name} className="flex items-center gap-4">
                  <div className="w-44 shrink-0">
                    <div className="text-sm font-semibold">{p.name}</div>
                    {p.hint && <div className="text-muted-foreground font-mono text-2xs">{p.hint}</div>}
                  </div>
                  <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                    {/* score is a 0–5 rubric (ReportPillar) — map to bar fill. */}
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${Math.min(Math.max(p.score, 0), 5) * 20}%` }}
                    />
                  </div>
                  <div className="text-muted-foreground w-12 shrink-0 text-right font-mono text-sm font-bold tabular-nums">
                    {p.score}/5
                  </div>
                </div>
              ))}
            </Card>
          </section>
        )}

        {/* Findings by area */}
        <section className="flex flex-col gap-4">
          <SectionHeader title="What was found in each area" hint="click into any tab" />
          <div className="flex flex-col gap-3">
            {r.areas.map((a) => {
              const st = AREA_STATUS[a.status] ?? AREA_STATUS.partial
              return (
                <Card key={a.id} className="flex flex-col gap-3 p-5">
                  <div className="flex items-center gap-3">
                    {a.href ? (
                      <a href={a.href} className="font-semibold tracking-tight hover:underline">
                        {a.name}
                      </a>
                    ) : (
                      <span className="font-semibold tracking-tight">{a.name}</span>
                    )}
                    <span className={`flex items-center gap-1.5 font-mono text-xs font-semibold ${st.cls}`}>
                      <span className={`size-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                    {a.href && (
                      <a
                        href={a.href}
                        className="text-primary ml-auto font-mono text-xs font-medium hover:underline"
                      >
                        open tab →
                      </a>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="text-sm">
                      <div className="text-success mb-1 font-mono text-2xs font-semibold uppercase tracking-wider">
                        ✓ found
                      </div>
                      <p className="text-muted-foreground">{a.found}</p>
                    </div>
                    {a.gap && (
                      <div className="text-sm">
                        <div className="text-warning mb-1 font-mono text-2xs font-semibold uppercase tracking-wider">
                          ○ not yet
                        </div>
                        <p className="text-muted-foreground">{a.gap}</p>
                      </div>
                    )}
                  </div>
                  {a.next && (
                    <div className="text-muted-foreground border-t pt-2 text-xs">
                      <span className="text-foreground font-mono text-2xs uppercase tracking-wider">
                        next
                      </span>{" "}
                      {a.next}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </section>

        {/* Recommendations */}
        {r.recommendations.length > 0 && (
          <section className="flex flex-col gap-4">
            <SectionHeader title="Recommendations" hint="what to do, in plain terms" />
            <div className="flex flex-col gap-2.5">
              {r.recommendations.map((rec) => {
                const rs = REC_STATUS[rec.status ?? "open"]
                return (
                  <Card key={rec.id} className="flex items-start gap-4 p-4">
                    <span className="text-primary mt-0.5 font-mono text-xs font-bold">{rec.id}</span>
                    <div className="flex-1">
                      <div className="font-semibold tracking-tight">{rec.title}</div>
                      <p className="text-muted-foreground mt-1 text-sm">{rec.detail}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="font-mono text-2xs font-normal">
                          {rec.track}
                        </Badge>
                        <Badge variant={rs.variant} className={`font-mono text-2xs font-normal ${rs.cls}`}>
                          {rs.label}
                        </Badge>
                        {rec.area && (
                          <span className="text-muted-foreground font-mono text-2xs">→ {rec.area} tab</span>
                        )}
                      </div>
                    </div>
                    {rec.delta && (
                      <span className="text-success shrink-0 font-mono text-sm font-bold tabular-nums">
                        {rec.delta}
                      </span>
                    )}
                  </Card>
                )
              })}
            </div>
          </section>
        )}

        <footer className="text-muted-foreground flex items-center gap-2 border-t pt-4 font-mono text-2xs">
          <Sparkles className="size-3" />
          Synclair · report verified against hub data · {r.date}
          {all.length > 1 ? ` · ${all.length} in archive` : ""}
        </footer>
      </main>
    </>
  )
}
