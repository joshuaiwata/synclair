/**
 * Foundations sections — the live style guide behind /synclair/foundations,
 * registered as the `foundations-sections` block (layer: foundation, like the
 * rest of the hub skin). All swatches render LIVE from the theme via Tailwind
 * classes, so they can't drift from `app/globals.css`.
 */
import {
  BASE_COLOR_GROUPS,
  FONT_FAMILIES,
  FONT_WEIGHTS,
  MOTION_TOKENS,
  OPACITY_STEPS,
  RADIUS_TOKENS,
  SPACING_STEPS,
  TYPE_SCALE,
  type ColorGroup,
} from "@/lib/system/tokens"
import { BRAND_RAMPS } from "@/lib/system/seed/brand-ramps"
import {
  PROJECT_FOUNDATION,
  type FoundationSection,
} from "@/lib/system/seed/foundation"
import { isExistingProjectMode } from "@/lib/system/external"
import { sanitizeSvg } from "@/lib/system/sanitize-svg"
import { project } from "@/lib/system/seed/project"
import { FoundationExampleTiles } from "@/lib/system/seed/foundation-tiles"
import { Markdown } from "@/components/markdown"
import { ColorSwatch, RampStrip } from "@/components/library/color-swatch"
import { cn } from "@/lib/utils"

export function ColorGroupBlock({ group }: { group: ColorGroup }) {
  // Step-scaled ramps (50…950) render as ONE continuous strip — the
  // Storybook/Radix idiom — instead of a wall of per-step cards. Discrete
  // semantic/status/chart tokens keep individual (compact) chips, where the
  // name matters more than the position in a scale.
  const isRamp =
    group.tokens.length >= 6 &&
    group.tokens.every((t) => /^\d{2,4}$/.test(t.name.split("-").pop() ?? ""))
  return (
    <section className="bg-card flex flex-col gap-4 rounded-xl border p-5 shadow-sm">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          {!isRamp && (
            /* A continuous ramp bead — reads the group at a glance. */
            <span className="flex h-4 overflow-hidden rounded-full ring-1 ring-black/10 ring-inset">
              {group.tokens.map((t) => (
                <span key={t.name} className={cn("w-4", t.bg)} />
              ))}
            </span>
          )}
          <h3 className="text-sm font-semibold tracking-tight">{group.label}</h3>
        </div>
        {group.hint && (
          <p className="text-muted-foreground max-w-3xl text-xs leading-relaxed">{group.hint}</p>
        )}
      </header>
      {isRamp ? (
        <RampStrip tokens={group.tokens} />
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
          {group.tokens.map((t) => (
            <ColorSwatch key={t.name} name={t.name} value={t.value} usage={t.usage} bg={t.bg} />
          ))}
        </div>
      )}
    </section>
  )
}

export async function ColorsFoundation() {
  const existingProject = await isExistingProjectMode()

  // Companion mode: show ONLY the project's palette (the host's real colors,
  // documented as data). Synclair's own semantic/status/chart tokens style
  // Synclair itself, not the product — they only confuse a stakeholder, so
  // they're not surfaced here at all. Empty state if the token
  // dig hasn't seeded any ramps yet.
  // New-project mode: the clone IS the product, so its semantic tokens + brand
  // ramps are all the project's — render them together.
  if (existingProject) {
    if (BRAND_RAMPS.length === 0) {
      return (
        <p className="max-w-2xl text-sm text-muted-foreground">
          No project palette documented yet. Run the token dig (the{" "}
          <code className="font-mono text-xs">token-archaeologist</code> in{" "}
          <code className="font-mono text-xs">existing-project-intake</code>) to
          extract {project.name}&rsquo;s colors from the host codebase into{" "}
          <code className="font-mono text-xs">
            lib/system/seed/brand-ramps.ts
          </code>
          .
        </p>
      )
    }
    return (
      <div className="flex flex-col gap-6">
        {BRAND_RAMPS.map((group) => (
          <ColorGroupBlock key={group.id} group={group} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {[...BASE_COLOR_GROUPS, ...BRAND_RAMPS].map((group) => (
        <ColorGroupBlock key={group.id} group={group} />
      ))}
    </div>
  )
}

/** Companion-mode note when a category wasn't captured / is a framework default. */
function NotCaptured({ what }: { what: string }) {
  return (
    <p className="max-w-2xl text-sm text-muted-foreground">
      No custom {what} documented for {project.name}
      {" — "}it uses its framework&rsquo;s default scale, or the token dig
      didn&rsquo;t capture one. Add it in{" "}
      <code className="font-mono text-xs">lib/system/seed/foundation.ts</code>.
    </p>
  )
}

/** Companion-mode Typography: the host's fonts + type scale, documented as data. */
export function ProjectTypography() {
  const { fonts, type, typeRoles } = PROJECT_FOUNDATION
  const roles = typeRoles ?? []
  const sansFamily = fonts.find((f) => !/mono/i.test(f.role))?.family
  const monoFamily = fonts.find((f) => /mono/i.test(f.role))?.family
  if (fonts.length === 0 && type.length === 0 && roles.length === 0)
    return <NotCaptured what="typography" />
  return (
    <div className="flex flex-col gap-8">
      {roles.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <h3 className="text-xs font-medium">Type specimen</h3>
            <span className="font-mono text-2xs text-muted-foreground">
              semantic roles — de-facto, mined from usage
            </span>
          </div>
          <div className="flex flex-col divide-y">
            {roles.map((r) => (
              <div
                key={r.role}
                className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:gap-4"
              >
                <p
                  className="min-w-0 flex-1 truncate"
                  style={{
                    fontSize: r.size,
                    lineHeight: r.line,
                    fontWeight: r.weight
                      ? (Number(r.weight) as React.CSSProperties["fontWeight"])
                      : undefined,
                    fontFamily: r.mono ? monoFamily : sansFamily,
                  }}
                >
                  {r.sample ?? "The quick brown fox"}
                </p>
                <div className="flex shrink-0 flex-col gap-0.5 sm:w-56 sm:text-right">
                  <code className="font-mono text-2xs font-medium">
                    {r.role}
                  </code>
                  <span className="text-2xs text-muted-foreground">
                    {r.size}
                    {r.line ? ` / ${r.line}` : ""}
                    {r.weight ? ` · ${r.weight}` : ""}
                  </span>
                  {r.usage && (
                    <span className="text-2xs text-muted-foreground">
                      {r.usage}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {fonts.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {fonts.map((f) => (
            <div
              key={f.role}
              className="flex flex-col gap-2 rounded-lg border bg-card p-4"
            >
              <div className="flex items-center justify-between">
                <code className="font-mono text-xs font-medium">{f.role}</code>
                <span className="text-xs text-muted-foreground">
                  {f.family}
                </span>
              </div>
              <p className="text-2xl" style={{ fontFamily: f.family }}>
                Ag 123
              </p>
              {f.usage && (
                <p className="text-xs text-muted-foreground">{f.usage}</p>
              )}
            </div>
          ))}
        </div>
      )}
      {type.length > 0 ? (
        <div className="flex flex-col divide-y">
          {type.map((t) => (
            <div key={t.name} className="flex items-baseline gap-4 py-3">
              <p
                className="min-w-0 flex-1 truncate font-medium"
                style={{ fontSize: t.size, lineHeight: t.line }}
              >
                The quick brown fox
              </p>
              <code className="shrink-0 font-mono text-2xs text-muted-foreground">
                {t.name}
              </code>
              <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
                {t.size}
                {t.line ? ` / ${t.line}` : ""}
              </span>
            </div>
          ))}
        </div>
      ) : (
        fonts.length > 0 &&
        roles.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Type scale is the framework default (no custom scale in the host).
          </p>
        )
      )}
    </div>
  )
}

/** Companion-mode Radius/Spacing: host scale as data (inline styles, any value). */
export function ProjectScale({ kind }: { kind: "radii" | "spacing" }) {
  const steps = PROJECT_FOUNDATION[kind]
  if (steps.length === 0)
    return (
      <NotCaptured what={kind === "radii" ? "radius scale" : "spacing scale"} />
    )
  return (
    <div
      className={cn(
        kind === "radii"
          ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          : "flex flex-col divide-y"
      )}
    >
      {steps.map((s) =>
        kind === "radii" ? (
          <div
            key={s.name}
            className="flex items-center gap-3 rounded-lg border bg-card p-3"
          >
            <div
              className="size-12 shrink-0 border-2 border-secondary bg-secondary/15"
              style={{ borderRadius: s.px }}
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-baseline gap-2">
                <code className="font-mono text-xs font-medium">{s.name}</code>
                <span className="text-2xs text-muted-foreground">{s.px}</span>
              </div>
              {s.usage && (
                <span className="text-xs text-muted-foreground">{s.usage}</span>
              )}
            </div>
          </div>
        ) : (
          <div key={s.name} className="flex items-center gap-4 py-2">
            <code className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
              {s.name}
            </code>
            <div
              className="h-3 rounded-sm bg-secondary"
              style={{ width: s.px }}
            />
            <span className="ml-auto shrink-0 font-mono text-2xs text-muted-foreground">
              {s.px}
            </span>
          </div>
        )
      )}
    </div>
  )
}

/** One prose foundation section (label + summary + markdown body). */
function FoundationSectionBlock({ section }: { section: FoundationSection }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-medium">{section.label}</h3>
      </div>
      {section.summary && (
        <p className="max-w-2xl text-sm text-muted-foreground">
          {section.summary}
        </p>
      )}
      <div className="max-w-3xl text-sm">
        <Markdown>{section.body}</Markdown>
      </div>
    </div>
  )
}

/**
 * Renders the prose sections bucketed into one style-guide tab (Motion,
 * Iconography, or the "More" catch-all). Several sections can share a tab now
 * that each isn't its own top-level tab — so each shows its own label heading.
 * Renders nothing when the bucket is empty.
 */
export function SectionsView({ sections }: { sections: FoundationSection[] }) {
  if (sections.length === 0) return null
  return (
    <div className="flex flex-col gap-8">
      {sections.map((s) => (
        <FoundationSectionBlock key={s.id} section={s} />
      ))}
    </div>
  )
}

/**
 * Companion-mode "Shape & elevation": the host's radius scale + shadow tokens in
 * one place (they're small, related, and used to sprawl into two thin tabs), plus
 * any prose sections grouped under "shape".
 */
export function ShapeElevationFoundation() {
  const { radii } = PROJECT_FOUNDATION
  const elevation = PROJECT_FOUNDATION.elevation ?? []
  const shapeSections = PROJECT_FOUNDATION.sections.filter(
    (s) => s.group === "shape"
  )
  if (radii.length === 0 && elevation.length === 0 && shapeSections.length === 0)
    return <NotCaptured what="shape or elevation scale" />
  return (
    <div className="flex flex-col gap-8">
      {radii.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-medium">Radius</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {radii.map((s) => (
              <div
                key={s.name}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <div
                  className="size-12 shrink-0 border-2 border-secondary bg-secondary/15"
                  style={{ borderRadius: s.px }}
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-baseline gap-2">
                    <code className="font-mono text-xs font-medium">
                      {s.name}
                    </code>
                    <span className="text-2xs text-muted-foreground">
                      {s.px}
                    </span>
                  </div>
                  {s.usage && (
                    <span className="text-xs text-muted-foreground">
                      {s.usage}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {elevation.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-medium">Elevation</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {elevation.map((s) => (
              <div key={s.name} className="flex flex-col gap-2">
                <div
                  className="flex h-16 items-center justify-center rounded-lg border bg-card"
                  style={{ boxShadow: s.value }}
                >
                  <code className="font-mono text-2xs text-muted-foreground">
                    {s.value}
                  </code>
                </div>
                <div className="flex flex-col gap-0.5">
                  <code className="font-mono text-xs font-medium">{s.name}</code>
                  {s.usage && (
                    <span className="text-xs text-muted-foreground">
                      {s.usage}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <SectionsView sections={shapeSections} />
    </div>
  )
}

/**
 * Companion-mode "Motion": the easing + durations shown IN ACTION — a live eased
 * demo per duration (CSS-only, flattened under prefers-reduced-motion) — plus the
 * named moves and any motion prose. Falls back to prose if no typed motion.
 */
export function MotionFoundation() {
  const motion = PROJECT_FOUNDATION.motion
  const motionSections = PROJECT_FOUNDATION.sections.filter(
    (s) => s.group === "motion"
  )
  if (!motion) return <SectionsView sections={motionSections} />
  const ease = motion.ease[0]?.value ?? "ease"
  return (
    <div className="flex flex-col gap-8">
      {/* Scoped demo keyframes — a bounded slide, not hub chrome. */}
      <style>{`
        @keyframes tbf-motion-slide { from { left: 0; } to { left: calc(100% - 1.25rem); } }
        .tbf-motion-dot { animation-name: tbf-motion-slide; animation-iteration-count: infinite; animation-direction: alternate; }
        @media (prefers-reduced-motion: reduce) { .tbf-motion-dot { animation: none !important; } }
      `}</style>
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <h3 className="text-xs font-medium">Easing × duration</h3>
          <span className="font-mono text-2xs text-muted-foreground">
            {motion.ease.map((e) => e.name).join(", ")} · {ease}
          </span>
        </div>
        <div className="flex flex-col gap-3">
          {motion.durations.map((d) => (
            <div key={d.name} className="flex items-center gap-4">
              <code className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                {d.name}
              </code>
              <div className="relative h-5 flex-1 rounded-full bg-secondary/15">
                <span
                  className="tbf-motion-dot absolute top-1/2 size-5 -translate-y-1/2 rounded-full bg-secondary"
                  style={{
                    animationDuration: `${d.ms}ms`,
                    animationTimingFunction: ease,
                  }}
                />
              </div>
              <span className="w-14 shrink-0 text-right font-mono text-2xs text-muted-foreground">
                {d.ms}ms
              </span>
            </div>
          ))}
        </div>
      </div>
      {motion.moves && motion.moves.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-medium">Named moves</h3>
          <div className="flex flex-wrap gap-2">
            {motion.moves.map((m) => (
              <div
                key={m.name}
                className="flex flex-col gap-0.5 rounded-lg border bg-card px-3 py-2"
              >
                <code className="font-mono text-xs font-medium">{m.name}</code>
                <span className="text-2xs text-muted-foreground">{m.usage}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <SectionsView sections={motionSections} />
    </div>
  )
}

/**
 * Companion-mode "Iconography": the actual brand mark + sample glyphs RENDERED
 * (inline SVG from the host, currentColor), not described in prose. Falls back to
 * prose if no typed icons.
 */
export function IconographyFoundation() {
  const icons = PROJECT_FOUNDATION.icons
  const iconSections = PROJECT_FOUNDATION.sections.filter(
    (s) => s.group === "icon"
  )
  if (!icons) return <SectionsView sections={iconSections} />
  return (
    <div className="flex flex-col gap-8">
      {icons.markSvg && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-medium">Brand mark</h3>
          <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
            <div
              className="size-16 shrink-0 [&>svg]:size-full"
              // Trusted seed SVG (self-colored brand mark).
              dangerouslySetInnerHTML={{ __html: sanitizeSvg(icons.markSvg) }}
            />
            {icons.markLabel && (
              <span className="text-xs text-muted-foreground">
                {icons.markLabel}
              </span>
            )}
          </div>
        </div>
      )}
      {icons.glyphs && icons.glyphs.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <h3 className="text-xs font-medium">Icon set</h3>
            <span className="font-mono text-2xs text-muted-foreground">
              currentColor · 24×24 duotone
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {icons.glyphs.map((g) => (
              <div
                key={g.name}
                className="flex flex-col items-center gap-2 rounded-lg border bg-card p-3"
              >
                <div
                  className="size-6 text-foreground [&>svg]:size-full"
                  // Trusted seed SVG (host icon glyph, currentColor).
                  dangerouslySetInnerHTML={{ __html: sanitizeSvg(g.svg) }}
                />
                <code className="max-w-full truncate text-2xs text-muted-foreground">
                  {g.name}
                </code>
              </div>
            ))}
          </div>
        </div>
      )}
      <SectionsView sections={iconSections} />
    </div>
  )
}

/**
 * Companion-mode "Examples": the HOST's tokens (PROJECT_FOUNDATION.sample)
 * applied as INLINE, scoped CSS custom properties to a gallery of composed UI
 * tiles — the color/radius/shadow/type vocabulary seen working together, not
 * another swatch list. Scoped to the grid below only; it must not restyle the
 * hub's own chrome (companion rule). Fonts degrade to system sans if the host
 * typeface isn't loaded here.
 *
 * The tiles are PROJECT content: when the token dig captures `sample`, intake
 * composes them here against the seed's own var names — the module page
 * header, the button hierarchy, status badges, a form field, a card. Capture
 * `sample` and write the tiles together; with no sample the tab never shows.
 */
export function ExamplesShowcase() {
  const sample = PROJECT_FOUNDATION.sample
  if (!sample)
    return <NotCaptured what="examples (no tokens captured to compose)" />
  // Scoped vars ride the grid itself — no visual chrome of its own, so the
  // tiles sit directly on the tab panel (two layers, not three).
  const frameStyle: React.CSSProperties = {
    ...(sample.vars as React.CSSProperties),
    fontFamily: sample.fontFamily,
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-2xl text-xs text-muted-foreground">
        {project.name}&rsquo;s tokens applied to real UI patterns — a sandboxed
        preview, not the hub&rsquo;s own styling. Color, radius, shadow, and
        type are set as scoped CSS variables; the live product may differ in
        fonts not loaded here.
      </p>
      {/* isolate: the scoped vars never cascade past this frame */}
      <div className="grid gap-4 sm:grid-cols-2" style={frameStyle}>
        {/* Intake composes the project's example tiles here (see doc above);
            they live in seed (foundation-tiles), never in this Brain file. */}
        <FoundationExampleTiles />
      </div>
    </div>
  )
}

export function TypographyFoundation() {
  return (
    <div className="flex flex-col gap-8">
      {/* Families */}
      <div className="grid gap-3 sm:grid-cols-2">
        {FONT_FAMILIES.map((f) => (
          <div
            key={f.name}
            className="flex flex-col gap-2 rounded-lg border bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <code className="font-mono text-xs font-medium">
                {f.className}
              </code>
              <span className="text-xs text-muted-foreground">{f.value}</span>
            </div>
            <p className={cn("text-2xl", f.className)}>Ag 123</p>
            <p className="text-xs text-muted-foreground">{f.usage}</p>
          </div>
        ))}
      </div>

      {/* Type scale */}
      <div className="flex flex-col divide-y">
        {TYPE_SCALE.map((t) => (
          <div key={t.name} className="flex items-baseline gap-4 py-3">
            <p
              className={cn("min-w-0 flex-1 truncate font-medium", t.className)}
            >
              The quick brown fox
            </p>
            <code className="shrink-0 font-mono text-2xs text-muted-foreground">
              {t.className}
            </code>
            <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
              {t.size} / {t.line}
            </span>
          </div>
        ))}
      </div>

      {/* Weights */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FONT_WEIGHTS.map((w) => (
          <div
            key={w.name}
            className="flex flex-col gap-1 rounded-lg border bg-card p-4"
          >
            <p className={cn("text-lg", w.className)}>Aa</p>
            <code className="font-mono text-xs font-medium">{w.className}</code>
            <span className="text-xs text-muted-foreground">
              {w.value} · {w.usage}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SpacingFoundation() {
  return (
    <div className="flex flex-col gap-2">
      <p className="max-w-2xl text-xs text-muted-foreground">
        Every spacing utility is{" "}
        <code className="font-mono">n × --spacing</code>. Change the one base
        token to rescale the whole app proportionally.
      </p>
      <div className="flex flex-col divide-y">
        {SPACING_STEPS.map((s) => (
          <div key={s.step} className="flex items-center gap-4 py-2">
            <code className="w-10 shrink-0 font-mono text-xs text-muted-foreground">
              {s.step}
            </code>
            <div className={cn("h-3 rounded-sm bg-secondary", s.w)} />
            <span className="ml-auto shrink-0 font-mono text-2xs text-muted-foreground">
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function RadiusFoundation() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {RADIUS_TOKENS.map((r) => (
        <div
          key={r.name}
          className="flex items-center gap-3 rounded-lg border bg-card p-3"
        >
          <div
            className={cn(
              "size-12 shrink-0 border-2 border-secondary bg-secondary/15",
              r.className
            )}
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-baseline gap-2">
              <code className="font-mono text-xs font-medium">
                {r.className}
              </code>
              <span className="text-2xs text-muted-foreground">{r.px}</span>
            </div>
            <p className="text-xs leading-snug text-muted-foreground">
              {r.usage}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

export function OpacityFoundation() {
  // Literal classes so Tailwind's JIT generates them. Each equals the Figma
  // "opacity-primary-*" token; use the modifier instead of a separate token.
  const cells: { mod: string; cls: string }[] = [
    { mod: "/10", cls: "bg-primary/10" },
    { mod: "/20", cls: "bg-primary/20" },
    { mod: "/30", cls: "bg-primary/30" },
    { mod: "/40", cls: "bg-primary/40" },
    { mod: "/50", cls: "bg-primary/50" },
  ]
  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-2xl text-xs text-muted-foreground">
        The opacity tokens map 1:1 to Tailwind&rsquo;s <code>/N</code> modifier
        on any color token — e.g.{" "}
        <code className="font-mono">bg-primary/10</code> is
        <code className="font-mono"> opacity-primary-lighter</code>. Use the
        modifier; don&rsquo;t add separate opacity tokens.
      </p>
      <div className="grid grid-cols-5 gap-3">
        {cells.map((c, i) => (
          <div key={c.mod} className="flex flex-col gap-1.5">
            <div className={cn("h-12 rounded-lg border", c.cls)} />
            <code className="font-mono text-2xs font-medium">{c.mod}</code>
            <span className="text-2xs text-muted-foreground">
              {OPACITY_STEPS[i].label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * New-project mode "Motion": the hub's own chrome-motion vocabulary from
 * `lib/system/tokens.ts` MOTION_TOKENS, with hover-replayed specimens for the
 * two entrance moves. Demos are scoped CSS (replay = animation re-applies on
 * hover) and flatten under prefers-reduced-motion, like everything they document.
 */
export function HubMotionFoundation() {
  return (
    <div className="flex flex-col gap-6">
      {/* Demo timings mirror .stagger-children in app/globals.css (0.3s ease-out,
          40ms steps) — keep the two in lockstep if the vocabulary changes. */}
      <style>{`
        .tbf-hub-motion-demo:hover .tbf-hub-motion-item { animation: hub-enter 0.3s ease-out both; }
        .tbf-hub-motion-demo:hover .tbf-hub-motion-item:nth-child(2) { animation-delay: 40ms; }
        .tbf-hub-motion-demo:hover .tbf-hub-motion-item:nth-child(3) { animation-delay: 80ms; }
        .tbf-hub-motion-demo:hover .tbf-hub-motion-item:nth-child(4) { animation-delay: 120ms; }
        .tbf-hub-motion-demo:hover .tbf-hub-motion-item:nth-child(5) { animation-delay: 160ms; }
        @media (prefers-reduced-motion: reduce) { .tbf-hub-motion-demo:hover .tbf-hub-motion-item { animation: none !important; } }
      `}</style>
      <p className="max-w-2xl text-xs text-muted-foreground">
        Two entrance moves — a page-level fade-rise and a short child stagger — plus fast
        hover/resize transitions. Opacity and small translates only; layout properties never
        animate, and everything flattens under{" "}
        <code className="font-mono">prefers-reduced-motion</code>. Utilities live in{" "}
        <code className="font-mono">app/globals.css</code>.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="tbf-hub-motion-demo flex flex-col gap-3 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <code className="font-mono text-xs font-medium">page-enter</code>
            <span className="text-2xs text-muted-foreground">hover to replay</span>
          </div>
          <div className="tbf-hub-motion-item bg-muted flex h-20 flex-col gap-2 rounded-md border p-3">
            <div className="bg-border h-2 w-1/3 rounded-full" />
            <div className="bg-border h-2 w-2/3 rounded-full" />
            <div className="bg-border h-2 w-1/2 rounded-full" />
          </div>
        </div>
        <div className="tbf-hub-motion-demo flex flex-col gap-3 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <code className="font-mono text-xs font-medium">stagger-children</code>
            <span className="text-2xs text-muted-foreground">hover to replay</span>
          </div>
          <div className="flex h-20 items-stretch gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="tbf-hub-motion-item bg-muted flex-1 rounded-md border" />
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col divide-y">
        {MOTION_TOKENS.map((m) => (
          <div key={m.name} className="flex items-baseline gap-4 py-3">
            <span className="w-32 shrink-0 text-xs font-medium">{m.name}</span>
            <code className="shrink-0 font-mono text-2xs text-muted-foreground">
              {m.className}
            </code>
            <span className="min-w-0 flex-1 text-xs text-muted-foreground">{m.usage}</span>
            <span className="shrink-0 font-mono text-2xs text-muted-foreground">{m.timing}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
