import Link from "next/link"
import { Map as MapIcon, RefreshCw, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { AgentAsk } from "@/components/agent-ask"
import { HubPage, PageBody, PageTitle } from "@/components/hub-page"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { PagesExplorer, type FlatPage } from "@/components/pages/pages-explorer"
import { SitemapChart } from "@/components/pages/sitemap-chart"
import { type SitemapDatum } from "@/components/pages/sitemap-tree"
import { HostStatus } from "@/components/pages/host-status"
import { formatDay } from "@/lib/system/format-date"
import { getPagesMap, hasPagesMap, type PageNode } from "@/lib/system/pages-map"
import { synclair } from "@/lib/system/routes"
import { NotesSections } from "@/components/library/notes-sections"
import { SURFACE_NOTES } from "@/lib/system/seed/surface-notes"
import { getSurfaces, PLATFORM_BADGE, surfaceLabel } from "@/lib/system/surfaces"
import { hostDevServer, liveBaseUrlFor, resolvePreviewSrc } from "@/lib/system/dev-servers"

export const dynamic = "force-dynamic"

/**
 * Pages — the app SITEMAP. An inventory of every view/route, with a scoped search
 * over three browsing views (a collapsible route tree, a branched chart, a
 * live-thumbnail gallery), and — on each page's detail — the components/blocks/
 * templates it composes. Rendered from the digest in data/pages-map.json (schema:
 * lib/system/pages-map.ts); regenerated via the `pages-map` skill / `page-mapper`
 * agent, kept honest by `npm run check:pages`.
 */
export default async function PagesOverview({
  searchParams,
}: {
  searchParams?: Promise<{ surface?: string }>
}) {
  const { surface: activeSurface } = (await searchParams) ?? {}
  const map = await getPagesMap()

  if (map.unreadable) {
    return (
      <HubPage title="Pages">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="warning">
              <TriangleAlert />
            </EmptyMedia>
            <EmptyTitle>A pages map exists but couldn&rsquo;t be read</EmptyTitle>
            <EmptyDescription>
              <code>data/pages-map.json</code> is present but failed to parse (details in the
              server log). Fix the JSON, or regenerate it with the <code>pages-map</code> skill.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </HubPage>
    )
  }

  if (!hasPagesMap(map)) {
    return (
      <HubPage title="Pages">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MapIcon />
            </EmptyMedia>
            <EmptyTitle>No sitemap yet</EmptyTitle>
            <EmptyDescription>
              The pages map inventories every view in the app — the route tree, a live preview of
              each, and the components, blocks, and templates each one composes — so humans and
              agents can see the whole app at a glance. Generate it by running the{" "}
              <code>pages-map</code> skill, which sends the <code>page-mapper</code> agent through
              the routes and writes <code>data/pages-map.json</code>.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </HubPage>
    )
  }

  const { repo, pages: allPages } = map

  // Multi-surface digests follow the LIBRARY pattern: /synclair/pages is a
  // per-surface card LANDING; entering a surface (?surface=<id>, or "all" for
  // the combined sitemap) scopes the view, and the breadcrumb walks back.
  const multiSurface = allPages.some((p) => p.surface)
  const scoped = !multiSurface || Boolean(activeSurface)
  const pages =
    activeSurface && activeSurface !== "all"
      ? allPages.filter((p) => p.surface === activeSurface)
      : allPages

  const usesOf = (of: typeof allPages) => of.reduce((n, p) => n + p.items.length, 0)
  const uncataloguedOf = (of: typeof allPages) =>
    new Set(of.flatMap((p) => p.items.filter((i) => i.catalogued === false).map((i) => i.name)))
  const totalUses = usesOf(pages)
  const uncatalogued = uncataloguedOf(pages)

  // Live host detection: in companion mode, route previews render from the host
  // dev server when it's running (resolved here), and show a "boot it" banner
  // when it isn't. Same-origin hub routes ignore all this.
  const isHost = repo!.root !== null
  const [liveBaseUrl, hostServer] = await Promise.all([
    liveBaseUrlFor(repo),
    hostDevServer(repo),
  ])

  const tree = buildDatumTree(pages)
  const flatPages: FlatPage[] = pages.map((p) => ({
    id: p.id,
    title: p.title,
    route: p.route,
    dynamic: p.dynamic,
    counts: tierCounts(p),
    previewSrc: resolvePreviewSrc(p, liveBaseUrl),
  }))

  const repoMeta = (
    <>
      <span className="text-muted-foreground font-mono text-xs">{repo!.name}</span>
      <Badge variant="outline" className="text-2xs text-muted-foreground">
        {repo!.root === null ? "this repo" : "host repo"}
      </Badge>
    </>
  )
  const lead = (
    <>
      The app sitemap — every view, how they tie together, and what each one composes. Search or
      browse, then open a page for its live preview and the components it uses.{" "}
      <span className="text-muted-foreground/70">
        A snapshot digested {formatDay(repo!.digestedAt)}
        {repo!.commit && (
          <>
            {" "}
            at commit{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
              {repo!.commit.slice(0, 7)}
            </code>
          </>
        )}
        , not live — regenerate via the{" "}
        <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">pages-map</code> skill,
        or run <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">check:pages</code>{" "}
        to see what drifted.
      </span>
    </>
  )
  const banner = <HostStatus isHost={isHost} server={hostServer} liveBaseUrl={liveBaseUrl} />

  // Multi-surface LANDING — the library-home pattern, same card treatment:
  // header row (label + platform pill + stack), stats, root footer. EVERY app
  // surface gets a card; unmapped ones state it honestly instead of hiding.
  if (multiSurface && !scoped) {
    const surfaces = getSurfaces()
    const mappedCount = surfaces.filter((s) =>
      allPages.some((p) => p.surface === s.id)
    ).length
    return (
      <>
        <PageHeader title="Pages">
        <AgentAsk
          label="Remap"
          icon={<RefreshCw />}
          title="Remap the app's pages"
          prompt="Remap the app's pages — walk the routes and refresh the sitemap."
          note="pages-map skill"
          align="end"
        />
      </PageHeader>
        <PageBody>
          <PageTitle title="Pages" meta={repoMeta} lead={lead} />
          {banner}
          <div className="stagger-children grid gap-4 sm:grid-cols-2">
            {surfaces.map((s) => {
              const of = allPages.filter((p) => p.surface === s.id)
              const uncat = uncataloguedOf(of).size
              const empty = of.length === 0
              return (
                <div key={s.id} className="group relative">
                  <Card className="group-hover:border-foreground/20 card-lift flex h-full flex-col gap-4 p-5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <h2 className="text-lg font-semibold tracking-tight">{s.label}</h2>
                      <Badge variant="secondary" className="text-3xs">
                        {PLATFORM_BADGE[s.platform]}
                      </Badge>
                      <span className="text-muted-foreground ml-auto text-xs">
                        {s.framework ?? ""}
                      </span>
                    </div>
                    {empty ? (
                      <p className="text-muted-foreground text-sm">
                        Not mapped yet — no pages from this surface are in the sitemap
                        digest. The <code>pages-map</code> skill inventories it.
                      </p>
                    ) : (
                      <div className="flex items-baseline gap-8">
                        <span className="flex flex-col gap-0.5">
                          <span className="font-mono text-2xl tabular-nums">{of.length}</span>
                          <span className="text-muted-foreground text-xs">Pages</span>
                        </span>
                        <span className="flex flex-col gap-0.5">
                          <span className="font-mono text-2xl tabular-nums">{usesOf(of)}</span>
                          <span className="text-muted-foreground text-xs">Component uses</span>
                        </span>
                        {uncat > 0 && (
                          <span className="text-muted-foreground ml-auto self-start text-xs">
                            {uncat} uncatalogued
                          </span>
                        )}
                      </div>
                    )}
                    {s.root && (
                      <span className="text-muted-foreground/70 mt-auto font-mono text-2xs">
                        {s.root}
                      </span>
                    )}
                  </Card>
                  <Link
                    href={`${synclair("/pages")}?surface=${s.id}`}
                    className="absolute inset-0"
                    aria-label={`${s.label} sitemap`}
                  >
                    <span className="sr-only">{s.label}</span>
                  </Link>
                </div>
              )
            })}
          </div>
          <p className="text-muted-foreground text-xs">
            {allPages.length} pages · {mappedCount} of {surfaces.length} surfaces mapped.{" "}
            <Link
              href={`${synclair("/pages")}?surface=all`}
              className="underline underline-offset-2"
            >
              Combined sitemap
            </Link>
            .
          </p>
          {/* Multi-surface only: with several frontends the counts stop
              speaking for themselves — an unmapped surface reads the same as
              an empty one unless the intent is written down. */}
          {surfaces.length > 1 && (
            <NotesSections
              sections={SURFACE_NOTES.pages}
              meta="how coverage and previews work here"
            />
          )}
        </PageBody>
      </>
    )
  }

  // Scoped view (a surface entered, the combined "all" view, or a
  // single-surface project) — the breadcrumb walks back to the landing.
  const scopeLabel = !multiSurface
    ? null
    : activeSurface === "all"
      ? "All surfaces"
      : surfaceLabel(activeSurface!)
  return (
    <>
      <PageHeader
        title={
          scopeLabel ? (
            <span className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
              <Link href={synclair("/pages")} className="hover:text-foreground">
                Pages
              </Link>
              <span aria-hidden>/</span>
              <span>{scopeLabel}</span>
            </span>
          ) : (
            "Pages"
          )
        }
      />
      <PageBody>
        <PageTitle title={scopeLabel ?? "Pages"} meta={repoMeta} lead={lead} />
        {banner}
        {/* Numeric census — the standard StatCard row (same unit as the Figma
            Manifest and Hygiene summaries). */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard value={String(pages.length)} label="Pages" />
          <StatCard value={String(totalUses)} label="Component uses" />
          <StatCard
            value={String(uncatalogued.size)}
            label="Uncatalogued"
            note={uncatalogued.size ? "used but not in the library yet" : undefined}
          />
          <StatCard value={map.routerKind ?? "—"} label="Router" />
        </div>
        <PagesExplorer tree={tree} pages={flatPages} chart={<SitemapChart nodes={tree} />} />
      </PageBody>
    </>
  )
}

// ---- Tree construction (serializable, shared by tree + chart) --------------

interface RawNode {
  seg: string
  route: string
  page?: PageNode
  children: RawNode[]
}

function tierCounts(page?: PageNode): SitemapDatum["counts"] {
  const c = { component: 0, block: 0, template: 0 }
  for (const i of page?.items ?? []) {
    if (i.tier === "block") c.block += 1
    else if (i.tier === "template") c.template += 1
    else c.component += 1
  }
  return c
}

/** Build the route hierarchy, then map it to the serializable SitemapDatum shape. */
function buildDatumTree(pages: PageNode[]): SitemapDatum[] {
  const root: RawNode = { seg: "", route: "/", children: [] }
  for (const page of pages) {
    const segs = page.route.split("/").filter(Boolean)
    if (segs.length === 0) {
      root.page = page
      continue
    }
    let node = root
    let acc = ""
    for (const seg of segs) {
      acc += `/${seg}`
      let child = node.children.find((c) => c.seg === seg)
      if (!child) {
        child = { seg, route: acc, children: [] }
        node.children.push(child)
      }
      node = child
    }
    node.page = page
  }
  const sortRec = (n: RawNode) => {
    n.children.sort((a, b) => a.seg.localeCompare(b.seg))
    n.children.forEach(sortRec)
  }
  sortRec(root)

  const toDatum = (raw: RawNode): SitemapDatum => {
    const children = raw.children.map(toDatum)
    const descendantPages = children.reduce((n, c) => n + (c.id ? 1 : 0) + c.descendantPages, 0)
    return {
      key: raw.route,
      seg: raw.seg || "/",
      title: raw.page?.title,
      id: raw.page?.id,
      route: raw.route,
      dynamic: raw.page?.dynamic,
      counts: tierCounts(raw.page),
      descendantPages,
      children,
    }
  }

  const roots = root.children.map(toDatum)
  // A root-level "/" page (the redirect) leads the list as its own node.
  return root.page
    ? [
        {
          key: "/",
          seg: "/",
          title: root.page.title,
          id: root.page.id,
          route: "/",
          dynamic: root.page.dynamic,
          counts: tierCounts(root.page),
          descendantPages: 0,
          children: [],
        },
        ...roots,
      ]
    : roots
}
