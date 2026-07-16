import { HubPage } from "@/components/hub-page"
import {
  ColorsFoundation,
  ExamplesShowcase,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Markdown } from "@/components/markdown"
import { isExistingProjectMode } from "@/lib/system/external"
import { PROJECT_FOUNDATION } from "@/lib/system/seed/foundation"
import { project } from "@/lib/system/seed/project"

type FoundationTab = {
  value: string
  label: string
  content: React.ReactNode
  /** Skip the white content panel — the tab supplies its own cards (Color). */
  bare?: boolean
}

/** New-project mode: the clone IS the product, so its own tokens are shown. */
const NEW_PROJECT_TABS: FoundationTab[] = [
  { value: "colors", label: "Colors", content: <ColorsFoundation /> },
  {
    value: "typography",
    label: "Typography",
    content: <TypographyFoundation />,
  },
  { value: "spacing", label: "Spacing", content: <SpacingFoundation /> },
  { value: "radius", label: "Radius", content: <RadiusFoundation /> },
  { value: "opacity", label: "Opacity", content: <OpacityFoundation /> },
]

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

export default async function FoundationsPage() {
  const existingProject = await isExistingProjectMode()
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
