/**
 * Multi-token-system Foundations views (mechanism: lib/system/token-systems.ts).
 *
 * `TokenSystemView` renders ONE system as a complete, self-contained style
 * sheet — ramps, type, shape, motion — so parallel systems stay separated
 * instead of blended. `DriftView` renders the curated Compare table: the same
 * design slot across every system, the page's decision aid for converging on
 * one. Both are data-driven from the seed; nothing here names a project.
 */
import { Fragment, type CSSProperties } from "react"

import { Markdown } from "@/components/markdown"
import { fontStack, specimenSize } from "@/components/library/font-stack"
import { SpecimenFonts } from "@/components/library/specimen-fonts"
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

/** Does a system carry anything for a given category? Drives which tabs render. */
export function systemHas(
  system: TokenSystem,
  category: "examples" | "colors" | "typography" | "spacing" | "shape" | "motion"
): boolean {
  switch (category) {
    case "examples":
      return Boolean(system.sample)
    case "colors":
      return system.ramps.length > 0
    case "typography":
      return Boolean(system.fonts?.length || system.typeRoles?.length || system.type?.length)
    case "spacing":
      return Boolean(system.spacing?.length)
    case "shape":
      return Boolean(system.radii?.length || system.elevation?.length)
    case "motion":
      return Boolean(system.motion)
  }
}

/* ------------------------- Examples (composed layout) ---------------------- */

const exTile: CSSProperties = {
  background: "var(--sys-surface)",
  border: "1px solid var(--sys-line)",
  borderRadius: "var(--sys-radius)",
  boxShadow: "var(--sys-shadow, none)",
  color: "var(--sys-text)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 16,
}

const exLabel: CSSProperties = {
  color: "var(--sys-text-muted)",
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
}

function exPill(fg: string, bg: string): CSSProperties {
  return {
    background: bg,
    borderRadius: 999,
    color: fg,
    fontSize: 12,
    fontWeight: 600,
    padding: "2px 10px",
  }
}

/**
 * The system's vocabulary COMPOSED — a basic layout (page header, button
 * hierarchy, status pills, card + field) built from the STANDARD `--sys-*`
 * slots the seed's `sample` fills with the system's verbatim values. One
 * generic layout in the Brain; every system renders it in its own skin, so
 * the same patterns become directly comparable across systems.
 */
export function SystemExamplesBlock({ system }: { system: TokenSystem }) {
  const sample = system.sample
  if (!sample) return null
  const family = sample.fontFamily?.split(",")[0]?.replace(/["']/g, "").trim()
  const frame: CSSProperties = {
    ...(sample.vars as CSSProperties),
    fontFamily: sample.fontFamily,
  }
  return (
    <div className="flex flex-col gap-3">
      <SpecimenFonts families={[family]} />
      <p className="text-muted-foreground max-w-2xl text-xs">
        The system&rsquo;s tokens applied to the same basic patterns every
        system renders — a sandboxed preview scoped to this frame, not the
        hub&rsquo;s own styling.
      </p>
      <div className="grid gap-4 sm:grid-cols-2" style={frame}>
        {/* Page header — title on the app ground, primary CTA. */}
        <div style={{ ...exTile, background: "var(--sys-bg, var(--sys-surface))" }}>
          <span style={exLabel}>Page header</span>
          <div style={{ alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 20, fontWeight: 600 }}>Overview</span>
              <span style={{ color: "var(--sys-text-muted)", fontSize: 13 }}>
                12 active · 3 pending this week
              </span>
            </div>
            <button
              type="button"
              style={{
                background: "var(--sys-primary)",
                border: "none",
                borderRadius: "var(--sys-radius)",
                color: "var(--sys-on-primary, var(--sys-text))",
                fontSize: 13,
                fontWeight: 600,
                padding: "8px 14px",
              }}
            >
              New item
            </button>
          </div>
        </div>

        {/* Button hierarchy — primary, outline, ghost, link. */}
        <div style={exTile}>
          <span style={exLabel}>Buttons</span>
          <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" style={{ background: "var(--sys-primary)", border: "none", borderRadius: "var(--sys-radius)", color: "var(--sys-on-primary, var(--sys-text))", fontSize: 13, fontWeight: 600, padding: "8px 14px" }}>
              Primary
            </button>
            <button type="button" style={{ background: "var(--sys-surface)", border: "1px solid var(--sys-line)", borderRadius: "var(--sys-radius)", color: "var(--sys-text)", fontSize: 13, fontWeight: 500, padding: "8px 14px" }}>
              Secondary
            </button>
            <button type="button" style={{ background: "transparent", border: "none", borderRadius: "var(--sys-radius)", color: "var(--sys-text-muted)", fontSize: 13, fontWeight: 500, padding: "8px 14px" }}>
              Ghost
            </button>
            <span style={{ color: "var(--sys-info, var(--sys-text))", fontSize: 13, fontWeight: 500 }}>Link →</span>
          </div>
        </div>

        {/* Status vocabulary. */}
        <div style={exTile}>
          <span style={exLabel}>Status</span>
          <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span style={exPill("var(--sys-on-primary, var(--sys-text))", "var(--sys-primary-soft, var(--sys-bg))")}>Featured</span>
            <span style={exPill("var(--sys-text-muted)", "var(--sys-bg, var(--sys-surface))")}>Neutral</span>
            <span style={exPill("var(--sys-danger, var(--sys-text))", "var(--sys-danger-soft, var(--sys-bg))")}>Error</span>
            <span style={exPill("var(--sys-info, var(--sys-text))", "var(--sys-bg, var(--sys-surface))")}>Info</span>
          </div>
        </div>

        {/* Card + field. */}
        <div style={exTile}>
          <span style={exLabel}>Card · field</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Label</span>
            <div
              style={{
                alignItems: "center",
                background: "var(--sys-surface)",
                border: "1px solid var(--sys-line)",
                borderRadius: "var(--sys-radius)",
                color: "var(--sys-text-muted)",
                display: "flex",
                fontSize: 13,
                justifyContent: "space-between",
                padding: "8px 10px",
              }}
            >
              Placeholder value
              <span style={exPill("var(--sys-on-primary, var(--sys-text))", "var(--sys-primary-soft, var(--sys-bg))")}>
                hint
              </span>
            </div>
            <span style={{ color: "var(--sys-text-muted)", fontSize: 12 }}>
              Helper text under the field.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The system's color ramps — each ramp its own card (bare, no extra panel). */
export function SystemColorsBlock({ system }: { system: TokenSystem }) {
  return (
    <div className="flex flex-col gap-6">
      {system.ramps.map((group) => (
        <ColorGroupBlock key={group.id} group={group} />
      ))}
    </div>
  )
}

/** The system's typography — fonts, roles, and scale in one paneled section. */
export function SystemTypographyBlock({ system }: { system: TokenSystem }) {
  const sansFamily = system.fonts?.find((f) => !/mono/i.test(f.role))?.family
  const monoFamily = system.fonts?.find((f) => /mono/i.test(f.role))?.family
  if (!systemHas(system, "typography")) return null
  return (
        <section className="bg-card flex flex-col gap-4 rounded-xl border p-5 shadow-sm">
          {/* Load the REAL faces for the specimens — a bare fontFamily of an
              unbundled font silently rendered the browser's default serif. */}
          <SpecimenFonts families={(system.fonts ?? []).map((f) => f.family)} />
          <SystemSectionHeader label="Typography" />
          {system.fonts && system.fonts.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {system.fonts.map((f) => (
                <div key={f.role} className="bg-card flex flex-col gap-2 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <code className="font-mono text-xs font-medium">{f.role}</code>
                    <span className="text-xs text-muted-foreground">{f.family}</span>
                  </div>
                  <p className="text-2xl" style={{ fontFamily: fontStack(f.family, /mono/i.test(f.role)) }}>
                    Ag 123
                  </p>
                  {f.usage && <p className="text-xs text-muted-foreground">{f.usage}</p>}
                </div>
              ))}
            </div>
          )}
          {system.typeRoles && system.typeRoles.length > 0 && (
            <div className="flex flex-col gap-1">
            <SystemSectionHeader label="Type specimen" hint="semantic roles — headers, body, captions" />
            <div className="flex flex-col divide-y">
              {system.typeRoles.map((r) => {
                const display = specimenSize(r.size)
                return (
                <div key={r.role} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                  <p
                    className="min-w-0 flex-1 truncate"
                    title={display.capped ? `Shown at reduced size — true size ${r.size}` : undefined}
                    style={{
                      fontSize: display.fontSize,
                      lineHeight: r.line,
                      fontWeight: r.weight ? (Number(r.weight) as React.CSSProperties["fontWeight"]) : undefined,
                      fontFamily: fontStack(r.mono ? monoFamily : sansFamily, r.mono),
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
                )
              })}
            </div>
            </div>
          )}
          {system.type && system.type.length > 0 && (
            <div className="flex flex-col gap-1">
            <SystemSectionHeader label="Scale" hint="numeric ladder" />
            <div className="flex flex-col divide-y">
              {system.type.map((t) => (
                <div key={t.name} className="flex items-baseline gap-4 py-3">
                  <p className="min-w-0 flex-1 truncate font-medium" style={{ fontSize: specimenSize(t.size).fontSize, lineHeight: t.line, fontFamily: fontStack(sansFamily) }}>
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
            </div>
          )}
        </section>
  )
}

/** The system's spacing scale, paneled. */
export function SystemSpacingBlock({ system }: { system: TokenSystem }) {
  if (!systemHas(system, "spacing")) return null
  return (
    <section className="bg-card flex flex-col gap-5 rounded-xl border p-5 shadow-sm">
      <SystemSectionHeader label="Spacing" />
      <div className="flex flex-col gap-1.5">
        {system.spacing!.map((s) => (
          <div key={s.name} className="flex items-center gap-3">
            <code className="w-20 shrink-0 font-mono text-2xs">{s.name}</code>
            <span className="bg-primary/70 h-3 rounded-sm" style={{ width: s.px }} />
            <span className="text-2xs text-muted-foreground">{s.px}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/** The system's radii + elevation, paneled. */
export function SystemShapeBlock({ system }: { system: TokenSystem }) {
  if (!systemHas(system, "shape")) return null
  return (
        <section className="bg-card flex flex-col gap-5 rounded-xl border p-5 shadow-sm">
          <SystemSectionHeader label="Shape & elevation" />
          {system.radii && system.radii.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {system.radii.map((s) => (
                <div key={s.name} className="bg-card flex items-center gap-3 rounded-lg border p-3">
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
  )
}

/** The system's motion vocabulary, paneled. */
export function SystemMotionBlock({ system }: { system: TokenSystem }) {
  if (!system.motion) return null
  return (
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
  )
}

/** The system's freeform notes (seed markdown). */
export function SystemNotesBlock({ system }: { system: TokenSystem }) {
  if (!system.notes) return null
  return (
    <div className="text-xs text-muted-foreground max-w-3xl">
      <Markdown>{system.notes}</Markdown>
    </div>
  )
}

/**
 * One token system as a complete, sequential style sheet — the category
 * blocks stacked. The scoped Foundations view tabs the same blocks instead.
 */
export function TokenSystemView({ system }: { system: TokenSystem }) {
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
      <SystemColorsBlock system={system} />
      <SystemTypographyBlock system={system} />
      <SystemSpacingBlock system={system} />
      <SystemShapeBlock system={system} />
      <SystemMotionBlock system={system} />
      <SystemNotesBlock system={system} />
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
      <div className="bg-card overflow-x-auto rounded-lg border">
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
