import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowUpRight, ExternalLink } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { PageBody, PageLead } from "@/components/hub-page"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { PageViewport } from "@/components/pages/page-viewport"
import { synclair } from "@/lib/system/routes"
import { isMultiSurface, surfaceLabel } from "@/lib/system/surfaces"
import { itemHref, tier as tierMeta } from "@/lib/system/tiers"
import type { ComponentKind } from "@/lib/system/components"
import { getPageSourceSync, getPagesMap, type PageItemUse } from "@/lib/system/pages-map"

const TIER_ORDER: ComponentKind[] = ["component", "block", "template"]

function toKind(t: string): ComponentKind {
  return (TIER_ORDER as string[]).includes(t) ? (t as ComponentKind) : "component"
}

/**
 * The detail page for one view in the sitemap: the real route rendered live
 * (zoomed-out iframe in a device viewport), plus documentation — source file,
 * gating, the components/blocks/templates it composes (linked into the library),
 * and the routes it navigates to. Freshness is per-page: when the route's source
 * changed since the map was generated, a "source changed" badge shows and
 * `check:pages` reports it.
 */
export async function PageDocView({ id }: { id: string }) {
  const map = await getPagesMap()
  const node = map.pages.find((p) => p.id === id)
  if (!node) notFound()

  const multiSurface = isMultiSurface()
  const sync = getPageSourceSync(node, map.repo?.root)

  // Library items the page composes (grouped by tier) vs. local components it
  // uses that aren't in the library yet (a coverage signal, shown apart).
  const cataloged = node.items.filter((i) => i.catalogued !== false)
  const uncataloged = node.items.filter((i) => i.catalogued === false)
  const byTier: Record<string, PageItemUse[]> = {}
  for (const item of cataloged) (byTier[item.tier] ??= []).push(item)

  // Resolve "links to" edges against the map so they navigate to the sibling's
  // detail page when we know it; otherwise show the raw route.
  const routeToId = new Map(map.pages.map((p) => [p.route, p.id]))

  return (
    <>
      <PageHeader
        title={
          <Breadcrumb>
            <BreadcrumbList className="text-xs">
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={synclair("/pages")}>Pages</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{node.title ?? node.route}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
      >
        <span className="text-muted-foreground font-mono text-xs">{node.route}</span>
        {node.kind && node.kind !== "page" && (
          <Badge variant="outline" className="text-2xs text-muted-foreground">
            {node.kind}
          </Badge>
        )}
        {node.dynamic && (
          <Badge variant="outline" className="text-2xs text-muted-foreground">
            dynamic
          </Badge>
        )}
        {multiSurface && node.surface && (
          <Badge variant="outline" className="text-2xs text-muted-foreground">
            {surfaceLabel(node.surface)}
          </Badge>
        )}
        {sync === "stale" && <StatusBadge status="warning">source changed</StatusBadge>}
      </PageHeader>
      <PageBody>
        <PageLead>
          {node.summary ?? "A view in the app. Below: the live render and what it composes."}
        </PageLead>

        {/* Live preview — the headline. */}
      {node.previewable && node.previewUrl ? (
        <PageViewport url={node.previewUrl} route={node.route} />
      ) : (
        <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
          No live preview for this route
          {node.kind === "api" ? " (an API route has nothing to render)" : ""}.{" "}
          {node.previewUrl && (
            <a
              href={node.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="text-foreground inline-flex items-center gap-1 underline underline-offset-2"
            >
              Open the route <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}

      {/* Source + gating facts. */}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border p-4 sm:grid-cols-2">
        <Fact label="Source">
          <code className="text-xs">{node.file || "—"}</code>
        </Fact>
        <Fact label="Route">
          <code className="text-xs">{node.route}</code>
        </Fact>
        {node.auth && <Fact label="Access">{node.auth}</Fact>}
        {node.templateName && (
          <Fact label="Template">
            <Link
              href={itemHref("template", node.templateName, multiSurface ? node.surface : undefined)}
              className="text-foreground inline-flex items-center gap-1 underline underline-offset-2"
            >
              {node.templateName} <ArrowUpRight className="size-3" />
            </Link>
          </Fact>
        )}
        {node.previewUrl && (
          <Fact label="Live route">
            <a
              href={node.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="text-foreground inline-flex items-center gap-1 underline underline-offset-2"
            >
              Open <ExternalLink className="size-3" />
            </a>
          </Fact>
        )}
      </dl>

      {/* Composed items, grouped by tier, linked into the library. */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold">
          Composes{" "}
          <span className="text-muted-foreground font-normal tabular-nums">{cataloged.length}</span>
          <span className="text-muted-foreground/70 ml-1 text-xs font-normal">
            from the library
          </span>
        </h2>
        {cataloged.length === 0 ? (
          <p className="text-muted-foreground text-sm">No library items detected for this route.</p>
        ) : (
          TIER_ORDER.filter((k) => byTier[k]?.length).map((kind) => (
            <div key={kind} className="flex flex-col gap-2">
              <h3 className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">
                {tierMeta(kind).label}
                <span className="ml-1.5 tabular-nums">{byTier[kind].length}</span>
              </h3>
              <div className="flex flex-col gap-1.5">
                {byTier[kind].map((item) => (
                  <ItemRow key={`${item.surface ?? ""}:${item.name}`} item={item} multiSurface={multiSurface} />
                ))}
              </div>
            </div>
          ))
        )}
        {uncataloged.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h3 className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">
              Not in the library yet
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {uncataloged.map((item) => (
                <span
                  key={item.name}
                  title="Used by this route but not registered in the component library"
                  className="text-muted-foreground border-warning/30 bg-warning/5 inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-xs"
                >
                  {item.name}
                  {typeof item.count === "number" && item.count > 1 && (
                    <span className="text-muted-foreground/60 text-2xs">×{item.count}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Navigation edges — how this page ties to the others. */}
      {node.links && node.links.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Links to</h2>
          <div className="flex flex-wrap gap-1.5">
            {node.links.map((route) => {
              const targetId = routeToId.get(route)
              return targetId ? (
                <Link
                  key={route}
                  href={synclair(`/pages/${targetId}`)}
                  className="hover:bg-muted bg-muted/50 rounded px-2 py-1 font-mono text-xs"
                >
                  {route}
                </Link>
              ) : (
                <span
                  key={route}
                  className="text-muted-foreground bg-muted/30 rounded px-2 py-1 font-mono text-xs"
                >
                  {route}
                </span>
              )
            })}
          </div>
        </section>
      )}
      </PageBody>
    </>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

function ItemRow({ item, multiSurface }: { item: PageItemUse; multiSurface: boolean }) {
  const kind = toKind(item.tier)
  const cataloged = item.catalogued !== false
  const content = (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate font-mono text-xs">{item.name}</span>
      {multiSurface && item.surface && (
        <Badge variant="outline" className="text-3xs text-muted-foreground">
          {surfaceLabel(item.surface)}
        </Badge>
      )}
      {typeof item.count === "number" && item.count > 1 && (
        <span className="text-muted-foreground/70 text-2xs tabular-nums">×{item.count}</span>
      )}
      {!cataloged && (
        <Badge variant="outline" className="text-warning border-warning/40 text-3xs">
          not in library
        </Badge>
      )}
    </span>
  )

  if (!cataloged) {
    return (
      <div className="bg-muted/30 flex items-center justify-between rounded-md px-2.5 py-1.5">
        {content}
      </div>
    )
  }
  return (
    <Link
      href={itemHref(kind, item.name, multiSurface ? item.surface : undefined)}
      className="hover:bg-muted/60 bg-muted/30 group flex items-center justify-between rounded-md px-2.5 py-1.5"
    >
      {content}
      <ArrowUpRight className="text-muted-foreground/50 group-hover:text-foreground size-3.5 shrink-0" />
    </Link>
  )
}
