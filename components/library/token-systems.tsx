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
import { fontStack } from "@/components/library/font-stack"
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
  category:
    | "theme"
    | "colors"
    | "typography"
    | "spacing"
    | "shape"
    | "motion"
    | "icons"
    | "depth"
    | "scale"
): boolean {
  switch (category) {
    case "theme":
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
    case "icons":
      return Boolean(system.icons?.markSvg || system.icons?.glyphs?.length)
    case "depth":
      return Boolean(system.opacity?.length || system.breakpoints?.length)
    // The combined dimensional tab — spacing, shape, motion, alpha,
    // breakpoints. Any one of them is enough to earn it.
    case "scale":
      return (
        systemHas(system, "spacing") ||
        systemHas(system, "shape") ||
        systemHas(system, "motion") ||
        systemHas(system, "depth")
      )
  }
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
                return (
                <div key={r.role} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                  <p
                    className="min-w-0 flex-1 break-words"
                    style={{
                      fontSize: r.size,
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
                  <p className="min-w-0 flex-1 break-words font-medium" style={{ fontSize: t.size, lineHeight: t.line, fontFamily: fontStack(sansFamily) }}>
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

/**
 * The system's motion vocabulary, shown IN ACTION — one live eased demo per
 * duration at the system's own timing function, so a 140ms and a 320ms are
 * distinguishable by eye rather than by reading two numbers. CSS-only and
 * flattened under prefers-reduced-motion, which is itself part of the spec.
 */
export function SystemMotionBlock({ system }: { system: TokenSystem }) {
  const motion = system.motion
  if (!motion) return null
  const ease = motion.ease[0]?.value ?? "ease"
  return (
        <section className="bg-card flex flex-col gap-5 rounded-xl border p-5 shadow-sm">
          {/* Scoped demo keyframes — a bounded slide, never hub chrome. */}
          <style>{`
            @keyframes tbs-motion-slide { from { left: 0; } to { left: calc(100% - 1.25rem); } }
            .tbs-motion-dot { animation-name: tbs-motion-slide; animation-iteration-count: infinite; animation-direction: alternate; }
            @media (prefers-reduced-motion: reduce) { .tbs-motion-dot { animation: none !important; } }
          `}</style>
          <div className="flex flex-col gap-3">
            <SystemSectionHeader
              label="Easing × duration"
              hint={`${motion.ease.map((e) => e.name).join(", ")} · ${ease}`}
            />
            {motion.durations.map((d) => (
              <div key={d.name} className="flex items-center gap-4">
                <code className="w-24 shrink-0 font-mono text-2xs text-muted-foreground">
                  {d.name}
                </code>
                <div className="bg-muted relative h-5 flex-1 rounded-full">
                  <span
                    className="tbs-motion-dot bg-primary absolute top-1/2 size-5 -translate-y-1/2 rounded-full"
                    style={{ animationDuration: `${d.ms}ms`, animationTimingFunction: ease }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right font-mono text-2xs text-muted-foreground">
                  {d.ms}ms
                </span>
              </div>
            ))}
          </div>
          {motion.moves && motion.moves.length > 0 && (
            <div className="flex flex-col gap-3">
              <SystemSectionHeader label="Named moves" hint="defined in the system's own CSS" />
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {motion.moves.map((m) => (
                  <div key={m.name} className="flex flex-col gap-0.5 rounded-lg border p-3">
                    <code className="font-mono text-2xs font-medium">{m.name}</code>
                    <span className="text-2xs text-muted-foreground">{m.usage}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
  )
}

/**
 * The system's icon set, RENDERED — the brand mark at a legible size plus the
 * glyph grid, from inline SVG in the seed. `currentColor` markup inherits the
 * hub's text color, so a set authored for theming proves it here.
 */
export function SystemIconsBlock({ system }: { system: TokenSystem }) {
  const icons = system.icons
  if (!icons) return null
  return (
    <div className="flex flex-col gap-6">
      {icons.markSvg && (
        <section className="bg-card flex flex-col gap-4 rounded-xl border p-5 shadow-sm">
          <SystemSectionHeader label="Brand mark" hint={icons.markLabel} />
          <div
            className="[&>svg]:h-16 [&>svg]:w-auto"
            /* Seed-authored inline SVG — trusted project data, not user input. */
            dangerouslySetInnerHTML={{ __html: icons.markSvg }}
          />
        </section>
      )}
      {icons.glyphs && icons.glyphs.length > 0 && (
        <section className="bg-card flex flex-col gap-4 rounded-xl border p-5 shadow-sm">
          <SystemSectionHeader
            label="Glyphs"
            hint={`${icons.glyphs.length} shown · currentColor`}
          />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {icons.glyphs.map((g) => (
              <div
                key={g.name}
                className="flex flex-col items-center gap-2 rounded-lg border p-3 text-center"
              >
                <span
                  className="[&>svg]:size-6"
                  dangerouslySetInnerHTML={{ __html: g.svg }}
                />
                <code className="font-mono text-2xs text-muted-foreground break-all">
                  {g.name}
                </code>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/**
 * Alpha steps and breakpoints — the two "how it scales" categories. Alpha chips
 * sit over a checkerboard so the transparency is actually visible instead of
 * being a number; breakpoints render as a proportional ladder.
 */
export function SystemScalingBlock({ system }: { system: TokenSystem }) {
  const { opacity, breakpoints } = system
  const widest = Math.max(...(breakpoints ?? []).map((b) => parseFloat(b.min) || 0), 1)
  return (
    <div className="flex flex-col gap-6">
      {opacity && opacity.length > 0 && (
        <section className="bg-card flex flex-col gap-4 rounded-xl border p-5 shadow-sm">
          <SystemSectionHeader label="Alpha" hint="text emphasis · state overlays" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {opacity.map((o) => (
              <div key={o.name} className="flex flex-col gap-2">
                {/* Checkerboard ground — alpha is meaningless over flat white. */}
                <div
                  className="h-14 overflow-hidden rounded-lg border"
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg, var(--muted) 25%, transparent 25% 75%, var(--muted) 75%), linear-gradient(45deg, var(--muted) 25%, transparent 25% 75%, var(--muted) 75%)",
                    backgroundPosition: "0 0, 8px 8px",
                    backgroundSize: "16px 16px",
                  }}
                >
                  <div className="bg-foreground size-full" style={{ opacity: o.value }} />
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <code className="font-mono text-2xs font-medium">{o.name}</code>
                  <span className="font-mono text-2xs text-muted-foreground">{o.value}</span>
                </div>
                {o.usage && (
                  <span className="text-2xs text-muted-foreground">{o.usage}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {breakpoints && breakpoints.length > 0 && (
        <section className="bg-card flex flex-col gap-4 rounded-xl border p-5 shadow-sm">
          <SystemSectionHeader label="Breakpoints" hint="min-width, to scale" />
          <div className="flex flex-col gap-2">
            {breakpoints.map((b) => (
              <div key={b.name} className="flex items-center gap-3">
                <code className="w-24 shrink-0 font-mono text-2xs font-medium">{b.name}</code>
                <div className="flex-1">
                  <span
                    className="bg-primary/70 block h-3 rounded-sm"
                    style={{ width: `${((parseFloat(b.min) || 0) / widest) * 100}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right font-mono text-2xs text-muted-foreground">
                  {b.min}
                </span>
              </div>
            ))}
          </div>
          {breakpoints.some((b) => b.usage) && (
            <div className="flex flex-col gap-1">
              {breakpoints
                .filter((b) => b.usage)
                .map((b) => (
                  <span key={b.name} className="text-2xs text-muted-foreground">
                    <code className="font-mono">{b.name}</code> — {b.usage}
                  </span>
                ))}
            </div>
          )}
        </section>
      )}
    </div>
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
