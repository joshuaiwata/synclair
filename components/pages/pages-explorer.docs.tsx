import { PagesExplorer, type FlatPage } from "@/components/pages/pages-explorer"
import { type SitemapDatum } from "@/components/pages/sitemap-tree"
import { SkeletonRow, WireframeBlock, WireframeFrame } from "@/components/wireframe-kit"
import { live, type ComponentDoc } from "@/lib/system/doc-types"

const counts = { component: 0, block: 0, template: 0 }
const TREE: SitemapDatum[] = [
  {
    key: "/",
    seg: "/",
    title: "Dashboard",
    id: "dashboard",
    route: "/",
    counts: { component: 4, block: 2, template: 1 },
    descendantPages: 3,
    children: [
      {
        key: "/orders",
        seg: "orders",
        title: "Orders",
        id: "orders",
        route: "/orders",
        counts: { component: 6, block: 1, template: 1 },
        descendantPages: 1,
        children: [
          {
            key: "/orders/[id]",
            seg: "[id]",
            title: "Order detail",
            id: "order-detail",
            route: "/orders/[id]",
            dynamic: true,
            counts,
            descendantPages: 0,
            children: [],
          },
        ],
      },
      {
        key: "/settings",
        seg: "settings",
        title: "Settings",
        id: "settings",
        route: "/settings",
        counts: { component: 3, block: 1, template: 0 },
        descendantPages: 0,
        children: [],
      },
    ],
  },
]

const PAGES: FlatPage[] = [
  { id: "dashboard", title: "Dashboard", route: "/", counts: { component: 4, block: 2, template: 1 } },
  { id: "orders", title: "Orders", route: "/orders", counts: { component: 6, block: 1, template: 1 } },
  { id: "order-detail", title: "Order detail", route: "/orders/[id]", dynamic: true, counts },
  { id: "settings", title: "Settings", route: "/settings", counts: { component: 3, block: 1, template: 0 } },
]

const doc: ComponentDoc = {
  intent:
    "The Pages overview body — one scoped search over the app sitemap with three browsing views (collapsible route tree, branched chart, live-thumbnail gallery), so 'what pages does this app have' is answerable at a glance and every result jumps to that page's detail. It owns browsing UX only: the sitemap DATA arrives as props from data/pages-map.json, and the chart arrives server-rendered.",
  examples: [
    {
      title: "Live, over a small sitemap",
      description:
        "The real explorer over a four-page fixture — search filters flat results; the view toggle switches tree / chart / gallery. (The real page passes the server-rendered SitemapChart as `chart`.)",
      code: `<PagesExplorer tree={tree} pages={pages} chart={<SitemapChart nodes={tree} />} />`,
      preview: live(
        <div className="w-full">
          <PagesExplorer
            tree={TREE}
            pages={PAGES}
            chart={
              <WireframeFrame label="SitemapChart (server-rendered, passed as prop)" solid>
                <SkeletonRow />
                <SkeletonRow widths={["w-1/3", "w-1/4"]} />
              </WireframeFrame>
            }
          />
        </div>
      ),
    },
  ],
  anatomy: {
    description:
      "A search field over a view toggle; the active view fills the body. Gallery cards embed live route thumbs when a preview src resolves.",
    preview: live(
      <WireframeFrame label="Pages explorer">
        <WireframeBlock label="Search — scoped to the sitemap" />
        <WireframeBlock label="View toggle — tree · chart · gallery" />
        <WireframeFrame label="Active view (tree/chart/gallery of page cards)" focal>
          <SkeletonRow />
        </WireframeFrame>
      </WireframeFrame>
    ),
    regions: [
      { name: "Search", purpose: "Filters the flat page list; a query replaces the browsing views with ranked matches." },
      { name: "View toggle", purpose: "Tree (structure), chart (branching), gallery (live thumbnails) — one sitemap, three reads." },
      { name: "Page rows/cards", purpose: "Route, title, per-tier composition counts; each links to the page's detail view." },
    ],
  },
  interactions: [
    {
      trigger: "Type in search",
      behavior: "The browsing views collapse to a flat, ranked match list.",
      result: "Clearing the query restores the last browsing view.",
    },
    {
      trigger: "Click a page row or card",
      behavior: "Navigates to /synclair/pages/[id].",
      result: "The page detail shows its live preview and composed items.",
    },
    {
      trigger: "Toggle a tree branch",
      behavior: "Collapses/expands that route subtree.",
      result: "Collapse state is per-route for the session.",
    },
  ],
  responsive: [
    { viewport: "mobile", behavior: "Single-column gallery; the tree indents shallowly and rows wrap." },
    { viewport: "tablet", behavior: "Two-column gallery." },
    { viewport: "desktop", behavior: "Three-column gallery; chart and tree at full width." },
  ],
  states: [
    {
      name: "No matches",
      description: "A query with zero hits keeps the search context and says so.",
      preview: live(
        <div className="w-full">
          <PagesExplorer tree={[]} pages={[]} chart={<WireframeBlock label="Chart" />} />
        </div>
      ),
    },
  ],
  props: [
    { name: "tree", type: "SitemapDatum[]", description: "The route tree (serializable; shared with SitemapChart)." },
    { name: "pages", type: "FlatPage[]", description: "Flat page list powering search and the gallery." },
    { name: "chart", type: "ReactNode", description: "The server-rendered SitemapChart SVG." },
  ],
  notes:
    "Registered with its organs as files — sitemap-tree, sitemap-chart, page-thumb, page-viewport, host-status are internal parts of this block, not standalone library items. Thumbs lazy-load real routes via EmbedFrame behind an IntersectionObserver.",
}

export default doc
