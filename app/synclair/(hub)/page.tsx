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
  Map as MapIcon,
  Network,
  Palette,
  Sparkles,
} from "lucide-react"

import { ComponentCard } from "@/components/library/component-card"
import { HubPage } from "@/components/hub-page"
import { SectionHeader } from "@/components/section-header"
import { StatusBadge } from "@/components/status-badge"
import { relativeTime } from "@/lib/format"
import { getAgents } from "@/lib/system/agents"
import { getRecentActivity, type ActivityKind } from "@/lib/system/activity"
import { getGlobalCapabilities } from "@/lib/system/global-skills"
import { getCatalog, isFoundationVisible, isLibraryVisible } from "@/lib/system/components"
import { isExistingProjectMode } from "@/lib/system/external"
import { formatDay } from "@/lib/system/format-date"
import { getLatestCommitDate } from "@/lib/system/git-dates"
import { getCommitStats, getRepoRootLabel, type CommitStat } from "@/lib/system/git-log"
import { getKnowledgeSources } from "@/lib/system/knowledge/sources"
import { getPagesMap } from "@/lib/system/pages-map"
import { getReferences } from "@/lib/system/references"
import { synclair } from "@/lib/system/routes"
import { getSkills } from "@/lib/system/skills"
import {
  defaultSurfaceId,
  getSurfaces,
  isMultiSurface,
  PLATFORM_BADGE,
} from "@/lib/system/surfaces"
import { getSystemMap } from "@/lib/system/system-map"
import { FOUNDATION_GROUPS } from "@/lib/system/tokens"
import { getUsageMap } from "@/lib/system/usage"
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
      {/* 3+ surfaces sit one-per-column like the stat rows above; fewer keep 2-up. */}
      <div className={surfaces.length >= 3 ? "grid gap-3 md:grid-cols-3" : "grid gap-3 md:grid-cols-2"}>
        {surfaces.map((s) => (
          <Link
            key={s.id}
            href={synclair(`/library/${s.id}`)}
            className="group hover:bg-muted/40 bg-card flex flex-col gap-1.5 rounded-lg border p-4 transition-colors"
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
          className="group hover:bg-muted/40 bg-card flex flex-wrap items-center gap-2 rounded-lg border p-4 transition-colors"
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

/** Local YYYY-MM-DD of an ISO datetime — the ledger's day-grouping key. */
function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function dayLabel(key: string, now = new Date()): string {
  const today = dayKey(now.toISOString())
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000).toISOString())
  if (key === today) return "Today"
  if (key === yesterday) return "Yesterday"
  return formatDay(`${key}T00:00:00`)
}

/**
 * The day-grouped commit ledger — what the team actually shipped, day by day:
 * authors, churn, and each commit's subject. Reads one `git log --shortstat`
 * pass; rows link to the GitHub page where the commit drawer has the full diff.
 */
function CommitLedger({ commits, days = 5 }: { commits: CommitStat[]; days?: number }) {
  const byDay = new Map<string, CommitStat[]>()
  for (const c of commits) {
    const key = dayKey(c.date)
    const list = byDay.get(key) ?? []
    list.push(c)
    byDay.set(key, list)
  }
  // Sort day keys, not insertion order: squash-merges carry the PR's original
  // AUTHOR date, so log order and day order can disagree.
  const groups = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, days)
  const MAX_ROWS = 5

  return (
    <div className="flex flex-col gap-4">
      {groups.map(([key, dayCommits]) => {
        const authors = [...new Set(dayCommits.map((c) => c.author))]
        const ins = dayCommits.reduce((n, c) => n + c.insertions, 0)
        const del = dayCommits.reduce((n, c) => n + c.deletions, 0)
        return (
          <div key={key} className="bg-card overflow-hidden rounded-lg border">
            <div className="bg-muted/40 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-2">
              <span className="text-sm font-medium">{dayLabel(key)}</span>
              <span className="text-muted-foreground text-xs">
                {dayCommits.length} commit{dayCommits.length === 1 ? "" : "s"} ·{" "}
                {authors.join(", ")}
              </span>
              <span className="text-muted-foreground ml-auto font-mono text-2xs tabular-nums">
                <span className="text-success">+{ins}</span>{" "}
                <span className="text-destructive">−{del}</span>
              </span>
            </div>
            <div className="divide-y">
              {dayCommits.slice(0, MAX_ROWS).map((c) => (
                <Link
                  key={c.hash}
                  href={synclair("/github")}
                  className="group hover:bg-muted/40 flex items-center gap-3 px-4 py-2 transition-colors"
                >
                  <code className="text-muted-foreground shrink-0 font-mono text-2xs">
                    {c.shortHash}
                  </code>
                  <span className="min-w-0 flex-1 truncate text-sm">{c.subject}</span>
                  {c.unpushed && (
                    <StatusBadge status="warning" className="shrink-0 text-3xs">
                      not pushed
                    </StatusBadge>
                  )}
                  <span className="text-muted-foreground shrink-0 text-xs">{c.author}</span>
                  <span className="text-muted-foreground/70 shrink-0 text-xs tabular-nums">
                    {relativeTime(c.date)}
                  </span>
                </Link>
              ))}
              {dayCommits.length > MAX_ROWS && (
                <Link
                  href={synclair("/github")}
                  className="text-muted-foreground hover:text-foreground block px-4 py-2 text-xs transition-colors"
                >
                  +{dayCommits.length - MAX_ROWS} more on the GitHub page &rarr;
                </Link>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default async function Page() {
  const [components, skills, agents, global, activity, foundationVisible, commits, usage] =
    await Promise.all([
      // The Library tiles count the FULL project catalog (registered + host
      // externals + native fillers) so they match the gallery headline a click
      // away — getProjectComponents() is registered-project-only, which read 0
      // for a host-cataloged project and contradicted the galleries.
      getCatalog(),
      getSkills(),
      getAgents(),
      getGlobalCapabilities(),
      getRecentActivity(14),
      isFoundationVisible(),
      getCommitStats(60),
      getUsageMap(await getCatalog()),
    ])
  const [repoLabel, lastCommit, pagesMap, systemMap, existingProject] = await Promise.all([
    getRepoRootLabel(),
    getLatestCommitDate().catch(() => ""),
    getPagesMap().catch(() => null),
    getSystemMap().catch(() => null),
    isExistingProjectMode(),
  ])
  const knowledge = getKnowledgeSources()
  const references = getReferences()
  // Match the gallery headline: the visible project catalog excludes Synclair's
  // own foundation-layer hub-skin in companion mode (shown there as "N
  // foundation hidden") but includes it in new-project mode (the mother repo,
  // where those components ARE the design system), so Overview and the
  // galleries agree either way.
  const visible = components.filter((c) => isLibraryVisible(c, foundationVisible))
  const byKind = (k: string) => visible.filter((c) => c.kind === k).length

  // New in the library — the most recently touched visible items, as real
  // rendered cards (recognition over recall: show the component, not its name).
  const newInLibrary = [...visible]
    .filter((c) => c.updatedAt)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, 3)

  // Around the foundation — recent non-library changes (skills, agents, docs,
  // Figma, references). Library changes render as cards above instead.
  const foundationActivity = activity
    .filter((a) => a.kind !== "component" && a.kind !== "block" && a.kind !== "template")
    .slice(0, 6)

  // Jump-off points — every major surface, its live count, one click away.
  const jumps: {
    label: string
    href: string
    icon: React.ComponentType<{ className?: string }>
    detail: string
  }[] = [
    {
      label: "Components",
      href: synclair("/components"),
      icon: Component,
      detail: `${byKind("component")} components · ${byKind("block")} blocks · ${byKind("template")} templates`,
    },
    {
      label: "Pages",
      href: synclair("/pages"),
      icon: MapIcon,
      detail: pagesMap?.pages.length
        ? `${pagesMap.pages.length} view${pagesMap.pages.length === 1 ? "" : "s"} mapped`
        : "not mapped yet — run pages-map",
    },
    {
      label: "Foundations",
      href: synclair("/foundations"),
      icon: Palette,
      // FOUNDATION_GROUPS drives the tabs only in new-project mode; companion
      // mode builds its tabs from the host's seed, so no count is claimed.
      detail: existingProject ? "the host's design language" : `${FOUNDATION_GROUPS.length} token groups`,
    },
    {
      label: "Knowledge",
      href: synclair("/knowledge"),
      icon: BookOpen,
      detail: `${knowledge.length} source${knowledge.length === 1 ? "" : "s"} · ${references.length} reference${references.length === 1 ? "" : "s"}`,
    },
    {
      label: "System Map",
      href: synclair("/system"),
      icon: Network,
      detail: systemMap?.areas.length
        ? `${systemMap.areas.length} area${systemMap.areas.length === 1 ? "" : "s"} mapped`
        : "not mapped yet — run codebase-map",
    },
    {
      label: "AI Setup",
      href: synclair("/ai-setup"),
      icon: Bot,
      detail: `${skills.length} skills · ${agents.length} agents · ${mcpServers.length} MCP · ${global.length} global`,
    },
  ]

  return (
    <HubPage
      title="Synclair"
      meta={
        <span className="flex items-center gap-2">
          {lastCommit && (
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <span className="bg-success inline-block size-1.5 rounded-full" aria-hidden />
              updated {relativeTime(lastCommit)}
            </span>
          )}
          <span className="text-muted-foreground font-mono text-xs">{repoLabel}</span>
        </span>
      }
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

        {/* Jump-off points — where every session starts and fans out. */}
        <div className="stagger-children grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {jumps.map((j) => (
            <Link
              key={j.label}
              href={j.href}
              className="group bg-card hover:border-foreground/20 card-lift flex items-start gap-3 rounded-lg border p-4"
            >
              <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
                <j.icon className="text-muted-foreground size-4" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1 text-sm font-medium">
                  {j.label}
                  <ArrowUpRight className="text-muted-foreground size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                <span className="text-muted-foreground truncate font-mono text-2xs">
                  {j.detail}
                </span>
              </span>
            </Link>
          ))}
        </div>

        {/* Foundation health at a glance — curated stack status. */}
        <Link
          href={synclair("/environment")}
          className="group hover:bg-muted/40 bg-card flex flex-wrap items-center gap-2 rounded-lg border p-4 transition-colors"
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

        {/* New in the library — real rendered cards, straight to the doc page. */}
        {newInLibrary.length > 0 && (
          <section className="flex flex-col gap-4">
            <SectionHeader title="New in the library" hint="most recently touched items">
              <Link
                href={synclair("/components")}
                className="text-muted-foreground hover:text-foreground text-xs transition-colors"
              >
                All components &rarr;
              </Link>
            </SectionHeader>
            <div className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {newInLibrary.map((c) => (
                <ComponentCard key={`${c.surface}:${c.name}`} component={c} usage={usage.get(c.name)} />
              ))}
            </div>
          </section>
        )}

        {/* The daily catalog — what the team shipped, day by day, from git. */}
        {commits.length > 0 && (
          <section className="flex flex-col gap-3">
            <SectionHeader title="This week" hint="the daily catalog, live from git">
              <Link
                href={synclair("/github")}
                className="text-muted-foreground hover:text-foreground text-xs transition-colors"
              >
                Full history &rarr;
              </Link>
            </SectionHeader>
            <CommitLedger commits={commits} />
          </section>
        )}

        {/* Around the foundation — recent non-library changes. */}
        {foundationActivity.length > 0 && (
          <section className="flex flex-col gap-3">
            <SectionHeader title="Around the foundation" hint="skills, agents, docs & design" />
            <div className="bg-card divide-y rounded-lg border">
              {foundationActivity.map((item) => {
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
          </section>
        )}

        {/* What's next — the curated queue (lib/synclair-data.ts), not derived. */}
        <section className="flex flex-col gap-3">
          <SectionHeader title="What's next" hint="curated queue — lib/synclair-data.ts" />
          {openItems.length === 0 ? (
            <p className="text-muted-foreground bg-card rounded-lg border p-4 text-sm">
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
                <div key={group.label} className="bg-card flex flex-col gap-3 rounded-lg border p-4">
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
          Counts, cards, and the daily catalog read live from the repo (registry, skills, agents,
          knowledge, references, git history) and the stored Figma manifest. Curated notes (stack,
          MCP roles, the What&rsquo;s-next queue) live in{" "}
          <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
            lib/synclair-data.ts
          </code>
          .
        </p>
    </HubPage>
  )
}
