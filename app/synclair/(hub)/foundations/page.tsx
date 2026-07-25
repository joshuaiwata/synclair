import Link from "next/link"

import { HubPage, PageBody, PageTitle } from "@/components/hub-page"
import { PageHeader } from "@/components/page-header"
import { SectionHeader } from "@/components/section-header"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { synclair } from "@/lib/system/routes"
import { cn } from "@/lib/utils"
import {
  ColorsFoundation,
  ExamplesShowcase,
  HubMotionFoundation,
  IconographyFoundation,
  MotionFoundation,
  OpacityFoundation,
  ProjectScale,
  ProjectTypography,
  RadiusFoundation,
  SectionsView,
  ShapeElevationFoundation,
  SpacingFoundation,
  TypographyFoundation,
} from "@/components/library/foundations"
import {
  DriftView,
  SystemColorsBlock,
  SystemExamplesBlock,
  SystemMotionBlock,
  SystemNotesBlock,
  SystemShapeBlock,
  SystemSpacingBlock,
  SystemTypographyBlock,
  systemHas,
} from "@/components/library/token-systems"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Markdown } from "@/components/markdown"
import { isExistingProjectMode } from "@/lib/system/external"
import { FOUNDATION_GROUPS } from "@/lib/system/tokens"
import { PROJECT_FOUNDATION } from "@/lib/system/seed/foundation"
import { project } from "@/lib/system/seed/project"
import { TOKEN_DRIFT, TOKEN_SYSTEMS } from "@/lib/system/seed/token-systems"

type FoundationTab = {
  value: string
  label: string
  content: React.ReactNode
  /** Skip the white content panel — the tab supplies its own cards (Color). */
  bare?: boolean
}

/** New-project mode: the clone IS the product, so its own tokens are shown.
 *  Built from FOUNDATION_GROUPS (lib/system/tokens.ts) so the Overview's
 *  Foundations count and these tabs can never disagree. */
const NEW_PROJECT_CONTENT: Record<(typeof FOUNDATION_GROUPS)[number], React.ReactNode> = {
  Colors: <ColorsFoundation />,
  Typography: <TypographyFoundation />,
  Spacing: <SpacingFoundation />,
  Radius: <RadiusFoundation />,
  Opacity: <OpacityFoundation />,
  Motion: <HubMotionFoundation />,
}

const NEW_PROJECT_TABS: FoundationTab[] = FOUNDATION_GROUPS.map((g) => ({
  value: g.toLowerCase(),
  label: g,
  content: NEW_PROJECT_CONTENT[g],
}))

/**
 * Companion mode: describe the PROJECT's design language (from the host, as data)
 * as a CONSOLIDATED style guide — a small, fixed set of tabs modeled on how real
 * design systems document foundations (Examples · Color · Typography · Spacing ·
 * Shape & elevation · Motion · Iconography), NOT one tab per token or per
 * extra category. Prose `sections` are bucketed into these tabs by `group`; the
 * conditional tabs appear only when the token dig captured content for them.
 * Synclair's own tokens are never shown; they don't describe the product.
 */

function companionTabs(): FoundationTab[] {
  const byGroup = (g: string) =>
    PROJECT_FOUNDATION.sections.filter((s) => (s.group ?? "extra") === g)

  const tabs: FoundationTab[] = []

  // Examples leads — seeing the vocabulary COMPOSED beats reading swatches,
  // so the gallery is the landing tab when the token dig captured a sample.
  if (PROJECT_FOUNDATION.sample)
    tabs.push({
      value: "examples",
      label: "Examples",
      content: <ExamplesShowcase />,
    })

  tabs.push(
    {
      value: "color",
      label: "Color",
      bare: true,
      content: (
        <div className="flex flex-col gap-5">
          <ColorsFoundation />
          {byGroup("color").length > 0 && (
            <div className="bg-card rounded-xl border p-6 shadow-sm">
              <SectionsView sections={byGroup("color")} />
            </div>
          )}
        </div>
      ),
    },
    { value: "typography", label: "Typography", content: <ProjectTypography /> },
    {
      value: "spacing",
      label: "Spacing",
      content: <ProjectScale kind="spacing" />,
    },
    {
      value: "shape",
      label: "Shape & elevation",
      content: <ShapeElevationFoundation />,
    }
  )

  if (PROJECT_FOUNDATION.motion || byGroup("motion").length > 0)
    tabs.push({
      value: "motion",
      label: "Motion",
      content: <MotionFoundation />,
    })

  if (PROJECT_FOUNDATION.icons || byGroup("icon").length > 0)
    tabs.push({
      value: "iconography",
      label: "Iconography",
      content: <IconographyFoundation />,
    })

  const extra = byGroup("extra")
  if (extra.length > 0)
    tabs.push({
      value: "more",
      label: "More",
      content: <SectionsView sections={extra} />,
    })

  return tabs
}

export default async function FoundationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ system?: string }>
}) {
  const { system: activeSystem } = (await searchParams) ?? {}
  const existingProject = await isExistingProjectMode()
  const multiSystem = existingProject && TOKEN_SYSTEMS.length > 1

  // Multi-system companion mode follows the LIBRARY landing pattern: one
  // summary card per token system (entered by click, breadcrumb back), with
  // the comparison — the decision aid for converging on one — living right on
  // the landing beneath the cards.
  if (multiSystem) {
    const scopedSystem = activeSystem
      ? TOKEN_SYSTEMS.find((s) => s.id === activeSystem)
      : undefined

    if (scopedSystem) {
      // The SAME per-category tab set a single-vocabulary Foundations page
      // gets — Colors / Typography / Spacing / Shape / Motion — scoped to
      // this system; a category tab only renders when the dig captured it.
      const sysTabs: FoundationTab[] = [
        // Examples leads — seeing the vocabulary COMPOSED beats reading
        // swatches (the companion-mode ordering, per system here).
        ...(systemHas(scopedSystem, "examples")
          ? [{ value: "examples", label: "Examples", bare: true, content: <SystemExamplesBlock system={scopedSystem} /> }]
          : []),
        ...(systemHas(scopedSystem, "colors")
          ? [{ value: "colors", label: "Colors", bare: true, content: <SystemColorsBlock system={scopedSystem} /> }]
          : []),
        ...(systemHas(scopedSystem, "typography")
          ? [{ value: "typography", label: "Typography", bare: true, content: <SystemTypographyBlock system={scopedSystem} /> }]
          : []),
        ...(systemHas(scopedSystem, "spacing")
          ? [{ value: "spacing", label: "Spacing", bare: true, content: <SystemSpacingBlock system={scopedSystem} /> }]
          : []),
        ...(systemHas(scopedSystem, "shape")
          ? [{ value: "shape", label: "Shape & elevation", bare: true, content: <SystemShapeBlock system={scopedSystem} /> }]
          : []),
        ...(systemHas(scopedSystem, "motion")
          ? [{ value: "motion", label: "Motion", bare: true, content: <SystemMotionBlock system={scopedSystem} /> }]
          : []),
        ...(scopedSystem.notes
          ? [{ value: "notes", label: "Notes", content: <SystemNotesBlock system={scopedSystem} /> }]
          : []),
      ]
      return (
        <>
          <PageHeader
            title={
              <span className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
                <Link href={synclair("/foundations")} className="hover:text-foreground">
                  Foundations
                </Link>
                <span aria-hidden>/</span>
                <span>{scopedSystem.label}</span>
              </span>
            }
          />
          <PageBody>
            <PageTitle
              title={scopedSystem.label}
              meta={
                <span className="text-muted-foreground font-mono text-xs">
                  {scopedSystem.source}
                </span>
              }
              lead={scopedSystem.hint}
            />
            <Tabs defaultValue={sysTabs[0].value} className="gap-6">
              <TabsList>
                {sysTabs.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {sysTabs.map((t) => (
                <TabsContent key={t.value} value={t.value} className="mt-0">
                  {t.bare ? (
                    t.content
                  ) : (
                    <div className="bg-card rounded-xl border p-6 shadow-sm">{t.content}</div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </PageBody>
        </>
      )
    }

    return (
      <>
        <PageHeader title="Foundations" />
        <PageBody>
          <PageTitle
            title="Foundations"
            meta={<span className="text-muted-foreground font-mono text-xs">design tokens</span>}
            lead={
              <>
                {project.name} runs {TOKEN_SYSTEMS.length} parallel token systems. Enter one
                for its complete style sheet; the comparison below puts the same design slots
                side by side — the drift is the point: see where they disagree, then converge
                on one. Documented as data in{" "}
                <code className="font-mono text-xs">lib/system/seed/token-systems.ts</code>.
              </>
            }
          />
          {/* Same card anatomy as the Library and Pages landings: header row
              (label + role pill + right meta), big-number stat row, the
              system's own ramp strip (the foundations analog of area chips),
              mono source footer — on the same 2-col grid. */}
          <div className="stagger-children grid gap-4 sm:grid-cols-2">
            {TOKEN_SYSTEMS.map((system) => {
              const tokens = system.ramps.flatMap((r) => r.tokens)
              return (
                <div key={system.id} className="group relative">
                  <Card className="group-hover:border-foreground/20 card-lift flex h-full flex-col gap-4 p-5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <h2 className="text-lg font-semibold tracking-tight">{system.label}</h2>
                      {system.role && (
                        <Badge variant="secondary" className="text-3xs">
                          {system.role}
                        </Badge>
                      )}
                      {system.darkMode !== undefined && (
                        <span className="text-muted-foreground ml-auto text-xs">
                          {system.darkMode ? "light + dark" : "light only"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-8">
                      <span className="flex flex-col gap-0.5">
                        <span className="font-mono text-2xl tabular-nums">{system.ramps.length}</span>
                        <span className="text-muted-foreground text-xs">
                          Ramp{system.ramps.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="font-mono text-2xl tabular-nums">{tokens.length}</span>
                        <span className="text-muted-foreground text-xs">Tokens</span>
                      </span>
                      {(system.fonts?.length ?? 0) > 0 && (
                        <span className="flex flex-col gap-0.5">
                          <span className="font-mono text-2xl tabular-nums">{system.fonts!.length}</span>
                          <span className="text-muted-foreground text-xs">Fonts</span>
                        </span>
                      )}
                    </div>
                    {/* The system's palette at a glance — one compact ramp
                        bead per group, the same pill the color cards' headers
                        use, painted with the system's own token classes. */}
                    <div className="flex flex-wrap items-center gap-2" aria-hidden>
                      {system.ramps.map((ramp) => (
                        <span
                          key={ramp.id}
                          className="flex h-4 overflow-hidden rounded-full ring-1 ring-black/10 ring-inset"
                          title={ramp.label}
                        >
                          {ramp.tokens.map((t) => (
                            <span key={t.name} className={cn("w-4", t.bg)} />
                          ))}
                        </span>
                      ))}
                    </div>
                    <span className="text-muted-foreground/70 mt-auto font-mono text-2xs">
                      {system.source}
                    </span>
                  </Card>
                  <Link
                    href={`${synclair("/foundations")}?system=${system.id}`}
                    className="absolute inset-0"
                    aria-label={`Enter ${system.label}`}
                  >
                    <span className="sr-only">{system.label}</span>
                  </Link>
                </div>
              )
            })}
          </div>
          {TOKEN_DRIFT.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionHeader title="Compare" hint="the same design slot across every system" />
              <DriftView systems={TOKEN_SYSTEMS} sections={TOKEN_DRIFT} />
            </section>
          )}
          {PROJECT_FOUNDATION.sections.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionHeader title="Notes" />
              <div className="bg-card rounded-lg border p-6">
                <SectionsView sections={PROJECT_FOUNDATION.sections} />
              </div>
            </section>
          )}
        </PageBody>
      </>
    )
  }

  const tabs = existingProject ? companionTabs() : NEW_PROJECT_TABS
  return (
    <HubPage
      title="Foundations"
      meta={<span className="font-mono text-xs text-muted-foreground">design tokens</span>}
      lead={
        existingProject ? (
          <>
            {project.name}&rsquo;s design foundation, documented from the host codebase as data —
            the color, type, spacing, shape, and motion vocabulary its screens are built from (in{" "}
            <code className="font-mono text-xs">lib/system/seed/</code>), rendered as live
            specimens. Synclair&rsquo;s own tokens aren&rsquo;t shown here — they don&rsquo;t
            describe the product.
          </>
        ) : (
          <>
            The design tokens every screen is built from — the shared vocabulary that keeps humans
            and the AI styling consistently. Swatches render live from the theme, so this never
            drifts from what components actually use. Source of truth:{" "}
            <code className="font-mono text-xs">lib/system/tokens.ts</code> →{" "}
            <code className="font-mono text-xs">app/globals.css</code>.
          </>
        )
      }
    >
      {existingProject && PROJECT_FOUNDATION.notes && (
          <div className="max-w-2xl text-xs text-muted-foreground">
            <Markdown>{PROJECT_FOUNDATION.notes}</Markdown>
          </div>
        )}

        <Tabs defaultValue={tabs[0].value} className="gap-6">
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-0">
              {/* Color tabs supply their own per-ramp cards — don't double-wrap. */}
              {t.bare || t.value.startsWith("color") ? (
                t.content
              ) : (
                <div className="bg-card rounded-xl border p-6 shadow-sm">{t.content}</div>
              )}
            </TabsContent>
          ))}
        </Tabs>
    </HubPage>
  )
}
