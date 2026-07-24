import type { Metadata } from "next"
import { ShieldCheck } from "lucide-react"

import { HubPage } from "@/components/hub-page"
import { SectionHeader } from "@/components/section-header"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDay } from "@/lib/system/format-date"
import {
  getHostHygiene,
  HYGIENE_RULES,
  type HygieneRuleId,
} from "@/lib/system/host-hygiene"

export const metadata: Metadata = {
  title: "Foundation hygiene",
  description:
    "Where the host codebase steps outside its own design foundation — inline styles, raw colors, arbitrary values, bypassed primitives.",
}

/**
 * Foundation hygiene — the drift a component catalog can't see: not "is the
 * catalog current with the code" but "is the code current with its own
 * foundation". Scanned from the live host source by `npm run scan:hygiene`
 * (scripts/scan-host-hygiene.mjs); schema in lib/system/host-hygiene.ts.
 * Advisory readout for the team, never a build gate on the host.
 */
export default async function HygienePage() {
  const report = await getHostHygiene()

  if (!report) {
    return (
      <HubPage
        title="Foundation hygiene"
        lead={
          <>
            Where the codebase steps outside its own design foundation — inline
            styles, raw hex colors, arbitrary Tailwind values, native elements
            where a design-system primitive exists.
          </>
        }
      >
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldCheck />
            </EmptyMedia>
            <EmptyTitle>No hygiene scan yet</EmptyTitle>
            <EmptyDescription>
              Run <code>npm run scan:hygiene</code> to scan the host codebase.
              Requires a host declared in <code>data/external-catalog.json</code>{" "}
              (companion mode), or pass <code>--host &lt;path&gt;</code> ad-hoc.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </HubPage>
    )
  }

  const ruleMeta = (id: HygieneRuleId) => HYGIENE_RULES[id] ?? { label: id, description: "" }
  const findingsByRule = new Map<HygieneRuleId, typeof report.findings>()
  for (const f of report.findings) {
    const list = findingsByRule.get(f.rule) ?? []
    list.push(f)
    findingsByRule.set(f.rule, list)
  }

  return (
    <HubPage
      title="Foundation hygiene"
      meta={
        <span className="text-muted-foreground font-mono text-xs">
          {report.totals.findings} findings · {report.totals.files} of{" "}
          {report.totals.scannedFiles} scanned files · {formatDay(report.scannedAt)}
        </span>
      }
      lead={
        <>
          Where the codebase steps outside its own design foundation. Advisory —
          a readout for the team, not a build gate. Re-run with{" "}
          <code>npm run scan:hygiene</code> after the host moves. Scanned:{" "}
          <span className="font-mono text-xs">
            {report.hosts
              .map((h) => (h.commit ? `${h.name}@${h.commit}` : h.name))
              .join(" · ")}
          </span>
          .
        </>
      }
    >
      {/* Per-rule summary tiles */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {report.rules.map((r) => {
          const meta = ruleMeta(r.rule)
          return (
            <Card key={r.rule} className="gap-1.5 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{meta.label}</h3>
                <Badge
                  variant={r.count > 0 ? "secondary" : "outline"}
                  className="font-mono text-xs"
                >
                  {r.count}
                </Badge>
              </div>
              <p className="text-muted-foreground text-xs">{meta.description}</p>
              <p className="text-muted-foreground/70 text-2xs">
                {r.files} file{r.files === 1 ? "" : "s"}
              </p>
            </Card>
          )
        })}
      </section>

      {/* Top offenders */}
      {report.topFiles.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Top files" hint="where the drift concentrates" />
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead className="w-24 text-right">Findings</TableHead>
                  <TableHead>By rule</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.topFiles.map((f) => (
                  <TableRow key={f.hostPath}>
                    <TableCell className="font-mono text-xs">{f.hostPath}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{f.count}</TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-normal">
                      {Object.entries(f.byRule)
                        .map(([rule, n]) => `${ruleMeta(rule as HygieneRuleId).label} ${n}`)
                        .join(" · ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* Findings per rule, collapsed */}
      <section className="flex flex-col gap-3">
        <SectionHeader title="Findings" hint="sampled per rule" />
        <div className="flex flex-col gap-2">
          {report.rules
            .filter((r) => r.count > 0)
            .map((r) => {
              const meta = ruleMeta(r.rule)
              const findings = findingsByRule.get(r.rule) ?? []
              return (
                <details key={r.rule} className="group rounded-lg border bg-card">
                  <summary className="hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded-lg p-3 text-sm font-medium">
                    {meta.label}
                    <span className="text-muted-foreground font-mono text-xs">
                      {r.count}
                      {r.truncated > 0 && ` (showing ${findings.length})`}
                    </span>
                  </summary>
                  <div className="flex flex-col gap-1 px-3 pb-3">
                    {findings.map((f, i) => (
                      <div
                        key={`${f.hostPath}:${f.line}:${i}`}
                        className="flex flex-col gap-0.5 border-t py-2 first:border-t-0"
                      >
                        <span className="text-muted-foreground font-mono text-2xs">
                          {f.hostPath}:{f.line}
                        </span>
                        <code className="text-xs break-all">{f.snippet}</code>
                      </div>
                    ))}
                  </div>
                </details>
              )
            })}
        </div>
      </section>
    </HubPage>
  )
}
