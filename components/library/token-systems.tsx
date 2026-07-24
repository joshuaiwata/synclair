/**
 * Multi-token-system Foundations views (mechanism: lib/system/token-systems.ts).
 *
 * `TokenSystemView` renders ONE system as a complete, self-contained style
 * sheet — ramps, type, shape, motion — so parallel systems stay separated
 * instead of blended. `DriftView` renders the curated Compare table: the same
 * design slot across every system, the page's decision aid for converging on
 * one. Both are data-driven from the seed; nothing here names a project.
 */
import { Fragment } from "react"

import { Markdown } from "@/components/markdown"
import { ColorGroupBlock } from "@/components/library/foundations"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  DriftSection,
  TokenSystem,
} from "@/lib/system/token-systems"

function SystemSectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <h3 className="text-xs font-medium">{label}</h3>
      {hint && <span className="font-mono text-2xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

/** One token system, rendered as its own complete style sheet. */
export function TokenSystemView({ system }: { system: TokenSystem }) {
  const sansFamily = system.fonts?.find((f) => !/mono/i.test(f.role))?.family
  const monoFamily = system.fonts?.find((f) => /mono/i.test(f.role))?.family
  return (
    <div className="flex flex-col gap-6">
      <div className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{system.label}</span>
        {system.role && <> · {system.role}</>}
        {" · "}
        {system.sourceHref ? (
          <a className="font-mono underline-offset-2 hover:underline" href={system.sourceHref} target="_blank" rel="noreferrer">
            {system.source}
          </a>
        ) : (
          <code className="font-mono">{system.source}</code>
        )}
        {system.darkMode !== undefined && <> · {system.darkMode ? "light + dark" : "light only"}</>}
        {system.hint && <p className="mt-1 max-w-3xl leading-relaxed">{system.hint}</p>}
      </div>

      {system.ramps.map((group) => (
        <ColorGroupBlock key={group.id} group={group} />
      ))}

      {(system.fonts?.length || system.typeRoles?.length || system.type?.length) ? (
        <section className="bg-card flex flex-col gap-4 rounded-xl border p-5 shadow-sm">
          <SystemSectionHeader label="Typography" />
          {system.fonts && system.fonts.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {system.fonts.map((f) => (
                <div key={f.role} className="flex flex-col gap-2 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <code className="font-mono text-xs font-medium">{f.role}</code>
                    <span className="text-xs text-muted-foreground">{f.family}</span>
                  </div>
                  <p className="text-2xl" style={{ fontFamily: f.family }}>
                    Ag 123
                  </p>
                  {f.usage && <p className="text-xs text-muted-foreground">{f.usage}</p>}
                </div>
              ))}
            </div>
          )}
          {system.typeRoles && system.typeRoles.length > 0 && (
            <div className="flex flex-col divide-y">
              {system.typeRoles.map((r) => (
                <div key={r.role} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                  <p
                    className="min-w-0 flex-1 truncate"
                    style={{
                      fontSize: r.size,
                      lineHeight: r.line,
                      fontWeight: r.weight ? (Number(r.weight) as React.CSSProperties["fontWeight"]) : undefined,
                      fontFamily: r.mono ? monoFamily : sansFamily,
                    }}
                  >
                    {r.sample ?? "The quick brown fox"}
                  </p>
                  <div className="flex shrink-0 flex-col gap-0.5 sm:w-56 sm:text-right">
                    <code className="font-mono text-2xs font-medium">{r.role}</code>
                    <span className="text-2xs text-muted-foreground">
                      {r.size}
                      {r.line ? ` / ${r.line}` : ""}
                      {r.weight ? ` · ${r.weight}` : ""}
                    </span>
                    {r.usage && <span className="text-2xs text-muted-foreground">{r.usage}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {system.type && system.type.length > 0 && (
            <div className="flex flex-col divide-y">
              {system.type.map((t) => (
                <div key={t.name} className="flex items-baseline gap-4 py-3">
                  <p className="min-w-0 flex-1 truncate font-medium" style={{ fontSize: t.size, lineHeight: t.line, fontFamily: sansFamily }}>
                    The quick brown fox
                  </p>
                  <code className="shrink-0 font-mono text-2xs text-muted-foreground">{t.name}</code>
                  <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
                    {t.size}
                    {t.line ? ` / ${t.line}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {((system.radii?.length ?? 0) > 0 || (system.spacing?.length ?? 0) > 0 || (system.elevation?.length ?? 0) > 0) && (
        <section className="bg-card flex flex-col gap-5 rounded-xl border p-5 shadow-sm">
          <SystemSectionHeader label="Shape & elevation" />
          {system.radii && system.radii.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {system.radii.map((s) => (
                <div key={s.name} className="flex items-center gap-3 rounded-lg border p-3">
                  <span
                    className="bg-muted block size-10 border"
                    style={{ borderRadius: s.px }}
                  />
                  <div className="flex flex-col">
                    <code className="font-mono text-2xs font-medium">{s.name}</code>
                    <span className="text-2xs text-muted-foreground">{s.px}</span>
                    {s.usage && <span className="max-w-48 text-2xs text-muted-foreground">{s.usage}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {system.spacing && system.spacing.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {system.spacing.map((s) => (
                <div key={s.name} className="flex items-center gap-3">
                  <code className="w-20 shrink-0 font-mono text-2xs">{s.name}</code>
                  <span className="bg-primary/70 h-3 rounded-sm" style={{ width: s.px }} />
                  <span className="text-2xs text-muted-foreground">{s.px}</span>
                </div>
              ))}
            </div>
          )}
          {system.elevation && system.elevation.length > 0 && (
            <div className="flex flex-wrap gap-4">
              {system.elevation.map((s) => (
                <div key={s.name} className="flex items-center gap-3">
                  <span className="bg-background block size-12 rounded-lg" style={{ boxShadow: s.value }} />
                  <div className="flex flex-col">
                    <code className="font-mono text-2xs font-medium">{s.name}</code>
                    {s.usage && <span className="max-w-56 text-2xs text-muted-foreground">{s.usage}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {system.motion && (
        <section className="bg-card flex flex-col gap-3 rounded-xl border p-5 shadow-sm">
          <SystemSectionHeader label="Motion" />
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            {system.motion.ease.map((e) => (
              <span key={e.name}>
                <code className="font-mono text-2xs font-medium">{e.name}</code>{" "}
                <span className="text-muted-foreground font-mono text-2xs">{e.value}</span>
              </span>
            ))}
            {system.motion.durations.map((d) => (
              <span key={d.name}>
                <code className="font-mono text-2xs font-medium">{d.name}</code>{" "}
                <span className="text-muted-foreground font-mono text-2xs">{d.ms}ms</span>
              </span>
            ))}
          </div>
          {system.motion.moves && system.motion.moves.length > 0 && (
            <p className="text-2xs text-muted-foreground">
              Moves: {system.motion.moves.map((m) => m.name).join(" · ")}
            </p>
          )}
        </section>
      )}

      {system.notes && (
        <div className="text-xs text-muted-foreground max-w-3xl">
          <Markdown>{system.notes}</Markdown>
        </div>
      )}
    </div>
  )
}

/** The Compare table: each row is one design slot across every system. */
export function DriftView({
  systems,
  sections,
}: {
  systems: TokenSystem[]
  sections: DriftSection[]
}) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground max-w-3xl text-sm">
        The same design slot across every system — where the values agree, where
        they diverge, and what only one system defines. Curated by the token
        dig; a &ldquo;—&rdquo; means the system simply doesn&rsquo;t define that slot.
      </p>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-52">Slot</TableHead>
              {systems.map((s) => (
                <TableHead key={s.id}>
                  <span className="flex flex-col">
                    <span>{s.label}</span>
                    {s.role && (
                      <span className="text-2xs text-muted-foreground font-normal">{s.role}</span>
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sections.map((section) => (
              <Fragment key={section.id}>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={systems.length + 1} className="py-2">
                    <span className="text-2xs font-semibold tracking-wide uppercase">{section.label}</span>
                  </TableCell>
                </TableRow>
                {section.rows.map((row) => (
                  <TableRow key={row.slot}>
                    <TableCell className="align-top">
                      <span className="flex flex-col">
                        <span className="text-xs font-medium">{row.slot}</span>
                        {row.hint && <span className="text-2xs text-muted-foreground">{row.hint}</span>}
                      </span>
                    </TableCell>
                    {systems.map((s) => {
                      const v = row.values[s.id]
                      if (!v)
                        return (
                          <TableCell key={s.id} className="text-muted-foreground/60 align-top text-xs">
                            —
                          </TableCell>
                        )
                      return (
                        <TableCell key={s.id} className="align-top">
                          <span className="flex items-center gap-2">
                            {v.hex && (
                              <span
                                className="inline-block size-4 shrink-0 rounded-sm ring-1 ring-black/10 ring-inset"
                                style={{ backgroundColor: v.hex }}
                              />
                            )}
                            <span className="text-xs">{v.text}</span>
                          </span>
                          {v.flag && (
                            <span className="text-warning mt-0.5 block text-2xs">{v.flag}</span>
                          )}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
