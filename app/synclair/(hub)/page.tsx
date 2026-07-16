import Link from "next/link"
import {
  ArrowUpRight,
  Blocks,
  BookOpen,
  Bot,
  Component,
  FileText,
  Frame,
  LayoutTemplate,
  Sparkles,
} from "lucide-react"

import { HubPage } from "@/components/hub-page"
import { SectionHeader } from "@/components/section-header"
import { StatusBadge } from "@/components/status-badge"
import { relativeTime } from "@/lib/format"
import { getAgents } from "@/lib/system/agents"
import { getRecentActivity, type ActivityKind } from "@/lib/system/activity"
import { getGlobalCapabilities } from "@/lib/system/global-skills"
import { getCatalog, isFoundationVisible, isLibraryVisible } from "@/lib/system/components"
import { getKnowledgeSources } from "@/lib/system/knowledge/sources"
import { getReferences } from "@/lib/system/references"
import { getRepoRootLabel } from "@/lib/system/git-log"
import { synclair } from "@/lib/system/routes"
import { getSkills } from "@/lib/system/skills"
import {
  defaultSurfaceId,
  getSurfaces,
  isMultiSurface,
  PLATFORM_BADGE,
} from "@/lib/system/surfaces"
import { getSystemMap } from "@/lib/system/system-map"
import { mcpServers, openItems, stack } from "@/lib/synclair-data"

export const dynamic = "force-dynamic"

const nextGroups = [
  { label: "Open", statusLabel: "Open" },
  { label: "Next", statusLabel: "Next" },
  { label: "Deferred", statusLabel: "Deferred" },
] as const

const KIND_ICON: Record<ActivityKind, React.ComponentType<{ className?: string }>> = {
  component: Component,
  block: Blocks,
  template: LayoutTemplate,
  skill: Sparkles,
  agent: Bot,
  doc: FileText,
  figma: Frame,
  reference: BookOpen,
}

/**
 * The "entire repo setup and how it's divided" view for multi-surface projects:
 * one card per app surface (label, platform, stack, its library size) plus the
 * shared backend line from the system map. Hidden for single-surface projects.
 */
async function ProjectShape() {
  const [catalog, map, foundationVisible] = await Promise.all([
    getCatalog(),
    getSystemMap(),
    isFoundationVisible(),
  ])
  const surfaces = getSurfaces()
  const items = catalog.filter((c) => isLibraryVisible(c, foundationVisible))
  const countFor = (id: string) => items.filter((c) => (c.surface ?? defaultSurfaceId()) === id).length
  const sharedAreas = map.areas.filter((a) => !a.surface || a.surface === "shared")

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Project shape" hint="app surfaces & shared code" />
      <div className="grid gap-3 md:grid-cols-2">
        {surfaces.map((s) => (
          <Link
            key={s.id}
            href={synclair(`/library/${s.id}`)}
            className="group hover:bg-muted/40 flex flex-col gap-1.5 rounded-lg border p-4 transition-colors"
          >
            <span className="flex items-center gap-2">
              <span className="text-sm font-medium">{s.label}</span>
              <StatusBadge status="info">{PLATFORM_BADGE[s.platform]}</StatusBadge>
              {s.liveRender && <StatusBadge status="success">live previews</StatusBadge>}
            </span>
            <span className="text-muted-foreground text-xs">
              {s.framework ?? "—"} · {countFor(s.id)} library items
            </span>
            {s.root && (
              <span className="text-muted-foreground/70 font-mono text-2xs">{s.root}</span>
            )}
          </Link>
        ))}
      </div>
      {sharedAreas.length > 0 && (
        <Link
          href={synclair("/system")}
          className="group hover:bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border p-4 transition-colors"
        >
          <span className="text-sm font-medium">Shared</span>
          <span className="text-muted-foreground text-xs">
            {sharedAreas.map((a) => a.name).join(" · ")}
          </span>
          <span className="text-muted-foreground group-hover:text-foreground ml-auto text-xs transition-colors">
            System map &rarr;
          </span>
        </Link>
      )}
    </section>
  )
}

export default async function Page() {
  const [components, skills, agents, global, recent, foundationVisible] = await Promise.all([
    // The Library card counts the FULL project catalog (registered + host
    // externals + native fillers) so it matches the gallery headline a click
    // away — getProjectComponents() is registered-project-only, which read 0
    // for a host-cataloged project and contradicted the galleries.
    getCatalog(),
    getSkills(),
    getAgents(),
    getGlobalCapabilities(),
    getRecentActivity(10),
    isFoundationVisible(),
  ])
  const repoLabel = await getRepoRootLabel()
  const knowledge = getKnowledgeSources()
  const references = getReferences()
  // Match the gallery headline: the visible project catalog excludes Synclair's
  // own foundation-layer hub-skin in companion mode (shown there as "N
  // foundation hidden") but includes it in new-project mode (the mother repo,
  // where those components ARE the design system), so Overview and the
  // galleries agree either way.
  const byKind = (k: string) =>
    components.filter((c) => c.kind === k && isLibraryVisible(c, foundationVisible)).length

  // The foundation at a glance — grouped live counts, each row deep-links.
  const groups: { label: string; rows: { label: string; value: number; href: string }[] }[] = [
    {
      label: "Project",
      rows: [
        { label: "Knowledge sources", value: knowledge.length, href: synclair("/knowledge") },
        { label: "References", value: references.length, href: synclair("/references") },
      ],
    },
    {
      label: "Library",
      rows: [
        { label: "Foundations", value: 5, href: synclair("/foundations") },
        { label: "Components", value: byKind("component"), href: synclair("/components") },
        { label: "Blocks", value: byKind("block"), href: synclair("/blocks") },
        { label: "Templates", value: byKind("template"), href: synclair("/templates") },
      ],
    },
    {
      label: "AI setup",
      rows: [
        { label: "Skills", value: skills.length, href: synclair("/ai-setup") },
        { label: "Agents", value: agents.length, href: synclair("/ai-setup") },
        { label: "MCP servers", value: mcpServers.length, href: synclair("/ai-setup") },
        { label: "Global skills", value: global.length, href: synclair("/ai-setup") },
      ],
    },
  ]

  return (
    <HubPage
      title="Synclair"
      meta={<span className="text-muted-foreground font-mono text-xs">{repoLabel}</span>}
      lead={
        <>
          The team&rsquo;s space for building this project&rsquo;s front end with AI agents — the
          setup, the environment it builds in, and the components and views it produces. Every count
          and item below reads live from the repo, so this page is the current state of the
          foundation, not a snapshot.
        </>
      }
    >
        {/* Project shape — multi-surface projects only: the monorepo view of
            how the product divides into frontends + what they share. */}
        {isMultiSurface() && <ProjectShape />}

        {/* The foundation at a glance — grouped live counts */}
        <div className="grid gap-3 md:grid-cols-3">
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col rounded-lg border p-2">
              <div className="text-muted-foreground px-2 pt-1 pb-1.5 text-xs font-medium tracking-wide uppercase">
                {group.label}
              </div>
              {group.rows.map((row) => (
                <Link
                  key={row.label}
                  href={row.href}
                  className="group hover:bg-muted/50 flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 transition-colors"
                >
                  <span className="text-muted-foreground group-hover:text-foreground text-sm transition-colors">
                    {row.label}
                  </span>
                  <span className="font-mono text-sm font-medium tabular-nums">{row.value}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>

        {/* Foundation health at a glance */}
        <Link
          href={synclair("/environment")}
          className="group hover:bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border p-4 transition-colors"
        >
          <span className="mr-1 text-sm font-medium">Foundation</span>
          {stack.map((layer) => (
            <StatusBadge key={layer.layer} status={layer.status}>
              {layer.layer}
            </StatusBadge>
          ))}
          <span className="text-muted-foreground group-hover:text-foreground ml-auto text-xs transition-colors">
            View stack &rarr;
          </span>
        </Link>

        {/* Recent — live from git history */}
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Recent"
            hint="latest changes across code, docs & design"
          />
          {recent.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border p-4 text-sm">
              No dated activity yet — items appear here as they&rsquo;re committed.
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {recent.map((item) => {
                const Icon = KIND_ICON[item.kind]
                return (
                  <Link
                    key={`${item.kind}:${item.title}`}
                    href={item.href}
                    className="group hover:bg-muted/40 flex items-center gap-3 px-4 py-2.5 transition-colors first:rounded-t-lg last:rounded-b-lg"
                  >
                    <Icon className="text-muted-foreground size-4 shrink-0" />
                    <span className="truncate text-sm font-medium">{item.title}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {item.label} · {item.action}
                    </span>
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
                      {relativeTime(item.at)}
                    </span>
                    <ArrowUpRight className="text-muted-foreground size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* What's next */}
        <section className="flex flex-col gap-3">
          <SectionHeader title="What's next" hint="open questions and the queue" />
          {openItems.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border p-4 text-sm">
              No open items — add the project&rsquo;s next steps in{" "}
              <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                lib/synclair-data.ts
              </code>
              .
            </p>
          ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {nextGroups.map((group) => {
              const items = openItems.filter((i) => i.statusLabel === group.statusLabel)
              return (
                <div key={group.label} className="flex flex-col gap-3 rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={items[0]?.status ?? "neutral"}>
                      {group.label}
                    </StatusBadge>
                    <span className="text-muted-foreground text-xs">{items.length}</span>
                  </div>
                  <ul className="flex flex-col gap-3">
                    {items.map((item) => (
                      <li key={item.item} className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">{item.item}</span>
                        <p className="text-muted-foreground text-xs">{item.detail}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
          )}
        </section>

        <p className="text-muted-foreground/70 text-xs">
          Counts and recent activity read live from the repo (registry, skills, agents, knowledge,
          references) and the stored Figma manifest.
          Curated notes (stack, methodology, MCP roles, the queue) live in{" "}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
            lib/synclair-data.ts
          </code>
          .
        </p>
    </HubPage>
  )
}
