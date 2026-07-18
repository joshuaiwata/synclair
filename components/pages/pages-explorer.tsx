"use client"

import * as React from "react"
import Link from "next/link"
import { FileWarning, Search, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageThumb } from "@/components/pages/page-thumb"
import { SitemapTree, type SitemapDatum } from "@/components/pages/sitemap-tree"
import { synclair } from "@/lib/system/routes"

/** Flat, serializable per-page record — powers search + the gallery. */
export interface FlatPage {
  id: string
  title?: string
  route: string
  dynamic?: boolean
  counts: { component: number; block: number; template: number }
  /** Resolved live iframe src (same-origin route, or live host base + route), or undefined when no preview is available. */
  previewSrc?: string
}

/**
 * The Pages overview body: a scoped search box over the sitemap. Empty query →
 * the three browsing views (collapsible tree / branched chart / live-thumbnail
 * gallery). A query → a flat, ranked list of matching pages so you can jump
 * straight to one. The chart is a server-rendered SVG passed in as a prop.
 */
export function PagesExplorer({
  tree,
  pages,
  chart,
}: {
  tree: SitemapDatum[]
  pages: FlatPage[]
  chart: React.ReactNode
}) {
  const [query, setQuery] = React.useState("")
  const q = query.trim().toLowerCase()

  const matches = React.useMemo(() => {
    if (!q) return []
    return pages
      .filter((p) => `${p.title ?? ""} ${p.route}`.toLowerCase().includes(q))
      .sort((a, b) => a.route.localeCompare(b.route))
  }, [q, pages])

  return (
    <div className="flex flex-col gap-5">
      <div className="relative max-w-md">
        <Search className="text-muted-foreground/60 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pages by name or route…"
          aria-label="Search pages"
          className="border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-md border pr-9 pl-9 text-sm outline-none focus-visible:ring-2"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="text-muted-foreground/60 hover:text-foreground absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {q ? (
        <Results matches={matches} total={pages.length} />
      ) : (
        <Tabs defaultValue="sitemap" className="gap-5">
          <TabsList>
            <TabsTrigger value="sitemap">Sitemap</TabsTrigger>
            <TabsTrigger value="chart">Chart</TabsTrigger>
            <TabsTrigger value="gallery">
              Gallery
              <span className="text-muted-foreground ml-1.5 text-xs tabular-nums">{pages.length}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="sitemap" className="mt-0">
            <div className="rounded-lg border bg-card p-3">
              <SitemapTree nodes={tree} />
            </div>
          </TabsContent>
          <TabsContent value="chart" className="mt-0">
            {chart}
          </TabsContent>
          <TabsContent value="gallery" className="mt-0">
            <Gallery pages={[...pages].sort((a, b) => a.route.localeCompare(b.route))} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function Results({ matches, total }: { matches: FlatPage[]; total: number }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">
        {matches.length} of {total} {matches.length === 1 ? "page" : "pages"}
      </p>
      {matches.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
          No pages match. Try a name (&ldquo;System Map&rdquo;) or a route fragment
          (&ldquo;/components&rdquo;).
        </p>
      ) : (
        <div className="divide-border overflow-hidden rounded-lg border bg-card">
          {matches.map((p) => (
            <Link
              key={p.id}
              href={synclair(`/pages/${p.id}`)}
              className="hover:bg-muted/60 flex items-center gap-3 border-b px-3 py-2 last:border-b-0"
            >
              <span className="min-w-0 truncate text-sm font-medium">{p.title ?? p.route}</span>
              <code className="text-muted-foreground/70 shrink-0 font-mono text-xs">{p.route}</code>
              {p.dynamic && (
                <Badge variant="outline" className="text-3xs text-muted-foreground shrink-0">
                  dynamic
                </Badge>
              )}
              <span className="ml-auto shrink-0">
                <Counts counts={p.counts} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Gallery grouped by the route hierarchy (same shape as the sitemap tree, not
 * one flat wall of cards): each section is a parent route, its cards are the
 * pages directly under it. Sections are sorted; "/" leads as "Top level".
 */
function Gallery({ pages }: { pages: FlatPage[] }) {
  const titleByRoute = new Map(pages.map((p) => [p.route, p.title]))
  const groups = new Map<string, FlatPage[]>()
  for (const p of pages) {
    const segs = p.route.split("/").filter(Boolean)
    const parent = segs.length <= 1 ? "/" : `/${segs.slice(0, -1).join("/")}`
    const bucket = groups.get(parent) ?? []
    bucket.push(p)
    groups.set(parent, bucket)
  }
  const parents = [...groups.keys()].sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)))

  return (
    <div className="flex flex-col gap-7">
      {parents.map((parent) => {
        const items = groups.get(parent)!.sort((a, b) => a.route.localeCompare(b.route))
        const label = parent === "/" ? "Top level" : (titleByRoute.get(parent) ?? parent.split("/").pop())
        return (
          <section key={parent} className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2 border-b pb-1.5">
              <h3 className="text-sm font-medium">{label}</h3>
              {parent !== "/" && (
                <code className="text-muted-foreground/60 font-mono text-xs">{parent}</code>
              )}
              <span className="text-muted-foreground/60 ml-auto text-2xs tabular-nums">
                {items.length}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((p) => (
                <GalleryCard key={p.id} p={p} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function GalleryCard({ p }: { p: FlatPage }) {
  return (
    <Link
      href={synclair(`/pages/${p.id}`)}
      className="hover:border-foreground/20 hover:bg-muted/30 group flex flex-col overflow-hidden rounded-lg border bg-card transition-colors"
    >
      {p.previewSrc ? (
        <PageThumb url={p.previewSrc} title={p.route} />
      ) : (
        <div className="bg-muted/30 text-muted-foreground/50 flex h-40 items-center justify-center border-b">
          <FileWarning className="size-6" />
        </div>
      )}
      <div className="flex flex-col gap-1 p-3">
        <span className="truncate text-sm font-medium">{p.title ?? p.route}</span>
        <span className="text-muted-foreground/70 truncate font-mono text-2xs">{p.route}</span>
        <div className="mt-1">
          <Counts counts={p.counts} empty="no items" />
        </div>
      </div>
    </Link>
  )
}

function Counts({
  counts,
  empty,
}: {
  counts: FlatPage["counts"]
  empty?: string
}) {
  const parts = [
    counts.component && `${counts.component} comp`,
    counts.block && `${counts.block} block`,
    counts.template && `${counts.template} tmpl`,
  ].filter(Boolean)
  if (!parts.length)
    return empty ? <span className="text-muted-foreground/60 text-2xs">{empty}</span> : null
  return <span className="text-muted-foreground text-2xs">{parts.join(" · ")}</span>
}
