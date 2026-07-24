import { Map as MapIcon, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { HubPage } from "@/components/hub-page"
import { StatGrid } from "@/components/stat-grid"
import { SurfaceSwitcher } from "@/components/surface-switcher"
import { PagesExplorer, type FlatPage } from "@/components/pages/pages-explorer"
import { SitemapChart } from "@/components/pages/sitemap-chart"
import { type SitemapDatum } from "@/components/pages/sitemap-tree"
import { HostStatus } from "@/components/pages/host-status"
import { formatDay } from "@/lib/system/format-date"
import { getPagesMap, hasPagesMap, type PageNode } from "@/lib/system/pages-map"
import { synclair } from "@/lib/system/routes"
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

  // The shared SurfaceSwitcher scopes the sitemap to one frontend when the
  // digest carries surface ids (multi-surface projects; no-op otherwise).
  const pages = activeSurface ? allPages.filter((p) => p.surface === activeSurface) : allPages

  const totalUses = pages.reduce((n, p) => n + p.items.length, 0)
  const uncatalogued = new Set(
    pages.flatMap((p) => p.items.filter((i) => i.catalogued === false).map((i) => i.name))
  )

  const stats = [
    { label: "Pages", value: String(pages.length) },
    { label: "Component uses", value: String(totalUses) },
    {
      label: "Uncatalogued",
      value: String(uncatalogued.size),
      note: uncatalogued.size ? "used but not in the library yet" : undefined,
    },
    { label: "Router", value: map.routerKind ?? "—" },
  ]

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

  return (
    <HubPage
      title="Pages"
      meta={
        <>
          <span className="text-muted-foreground font-mono text-xs">{repo!.name}</span>
          <Badge variant="outline" className="text-2xs text-muted-foreground">
            {repo!.root === null ? "this repo" : "host repo"}
          </Badge>
        </>
      }
      lead={
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
      }
    >
      {/* Flip the sitemap between app surfaces — the same switcher the tier
          galleries use. Hidden when the digest predates surface tagging (no
          page carries a surface id), so the tabs can never all lead to an
          empty sitemap; renders nothing for single-surface projects anyway. */}
      {allPages.some((p) => p.surface) && (
        <SurfaceSwitcher
          active={activeSurface}
          allHref={synclair("/pages")}
          hrefFor={(id) => `${synclair("/pages")}?surface=${id}`}
          counts={Object.fromEntries(
            [...new Set(allPages.map((p) => p.surface).filter((s): s is string => !!s))].map(
              (id) => [id, allPages.filter((p) => p.surface === id).length]
            )
          )}
          aria-label="Sitemap surface"
        />
      )}
      <StatGrid items={stats} />
      <HostStatus isHost={isHost} server={hostServer} liveBaseUrl={liveBaseUrl} />
      <PagesExplorer tree={tree} pages={flatPages} chart={<SitemapChart nodes={tree} />} />
    </HubPage>
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
