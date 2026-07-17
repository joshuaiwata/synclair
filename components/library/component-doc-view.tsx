import Link from "next/link"
import { notFound } from "next/navigation"
import { ExternalLink, FileText } from "lucide-react"

import { getHostPreview } from "@/components/host-previews/registry"
import { getNativePreview } from "@/components/library/native-previews"
import { ProductThemeScope } from "@/components/library/product-theme-scope"
import { Markdown } from "@/components/markdown"
import { SectionHeader } from "@/components/section-header"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getCatalog,
  getDependents,
  type ComponentKind,
  type ComponentOrigin,
  type ComponentStatus,
} from "@/lib/system/components"
import { adapterFor } from "@/lib/system/adapters"
import { getDoc } from "@/lib/system/docs"
import { formatDay } from "@/lib/system/format-date"
import { getExternalCatalog, getExternalDoc } from "@/lib/system/external"
import {
  defaultSurfaceId,
  inheritsShared,
  SHARED_SURFACE_ID,
  surfaceLabel,
} from "@/lib/system/surfaces"
import { itemHref } from "@/lib/system/tiers"
import { getUsageMap, routeLabel } from "@/lib/system/usage"
import { getUxDocSync } from "@/lib/system/ux-docs"
import { ViewportFrame } from "@/components/viewport-frame"
import { cn } from "@/lib/utils"

const STATUS_TONE: Record<ComponentStatus, "success" | "info" | "warning"> = {
  stable: "success",
  beta: "info",
  deprecated: "warning",
}

const ORIGIN_LABEL: Record<ComponentOrigin, string> = {
  native: "shadcn primitive",
  extended: "extended shadcn",
  custom: "custom",
  external: "host app",
}

function PreviewFrame({ children }: { children: React.ReactNode }) {
  return (
    // overflow-hidden: previews never paint outside their frame — a runaway
    // ticker or off-stage overlay clips here instead of over the page.
    <div className="flex min-h-24 flex-wrap items-center justify-center gap-4 overflow-hidden rounded-lg border border-dashed bg-muted/40 p-6">
      {children}
    </div>
  )
}

/**
 * The CONCEPT page (foundation-model §5b): a bare name URL that resolves to a
 * design concept implemented on more than one surface. One shared identity
 * header, one card per implementation linking its scoped doc page — the
 * availability answer Material/Primer give with an availability matrix.
 */
function ConceptPage({
  name,
  matches,
}: {
  name: string
  matches: {
    kind: ComponentKind
    name: string
    surface?: string
    title: string
    description: string
    origin: ComponentOrigin
    status?: ComponentStatus
    categories: string[]
  }[]
}) {
  const first = matches[0]
  return (
    <main className="flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-base font-semibold">{first.title}</h1>
        {/* Same pill diet as the doc header: tier is in the breadcrumb,
            categories are filter facets — the concept name stands alone. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm">{name}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          One design concept, implemented on {matches.length} surfaces:
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {matches.map((m) => (
          <Link
            key={`${m.surface}:${m.name}`}
            href={itemHref(m.kind, m.name, m.surface)}
            className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40"
          >
            <span className="text-sm font-medium">
              {surfaceLabel(m.surface)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {m.name}
            </span>
            {m.origin !== "custom" && (
              <Badge variant="outline" className="text-3xs text-muted-foreground">
                {ORIGIN_LABEL[m.origin]}
              </Badge>
            )}
            {m.status && (
              <StatusBadge status={STATUS_TONE[m.status]} className="text-3xs">
                {m.status}
              </StatusBadge>
            )}
            <span className="w-full text-xs text-muted-foreground">
              {m.description}
            </span>
          </Link>
        ))}
      </div>
    </main>
  )
}

/**
 * Renders one registered item's documentation page. `expectedKind` guards the
 * route so /components/foo can't resolve a block, and drives the back link.
 * `surface` disambiguates name collisions across surfaces (a web `button` vs
 * an RN `button`); a bare URL that hits a collision gets a chooser instead.
 */
export async function ComponentDocView({
  name,
  expectedKind,
  surface,
}: {
  name: string
  expectedKind: ComponentKind
  surface?: string
}) {
  const catalog = await getCatalog()
  // Match by name OR by concept: a bare name URL resolves the design concept,
  // so diverging implementation names (web data-table / RN list-view sharing
  // concept "data-table") land on the same concept page.
  const named = catalog.filter(
    (c) => c.kind === expectedKind && c.name === name
  )
  const conceptId = named[0]?.concept ?? name
  const matches = catalog.filter(
    (c) =>
      c.kind === expectedKind && (c.name === name || c.concept === conceptId)
  )
  if (matches.length === 0) notFound()
  const component = surface
    ? // A web surface inherits the Shared design system, so a surface-scoped URL
      // for a shared component (e.g. /library/portal/components/badge) resolves
      // to the shared item — keeping you in that surface instead of 404ing.
      (matches.find((c) => (c.surface ?? defaultSurfaceId()) === surface) ??
      (inheritsShared(surface)
        ? (matches.find((c) => (c.surface ?? defaultSurfaceId()) === SHARED_SURFACE_ID) ?? null)
        : null))
    : matches.length === 1
      ? matches[0]
      : null
  if (!component) {
    if (matches.length > 1 && !surface)
      return <ConceptPage name={conceptId} matches={matches} />
    notFound()
  }

  // Lookups key on the RESOLVED item's name — a concept URL may have matched
  // an item named differently than the path segment.
  const componentSurface = component.surface ?? defaultSurfaceId()
  const adapter = adapterFor(component.surface)
  const external = component.origin === "external"
  const doc = external
    ? await getExternalDoc(component.name, componentSurface)
    : getDoc(component.name, componentSurface)
  const hosts = external ? (await getExternalCatalog()).hosts : []
  const host = external
    ? (hosts.find((h) => h.surface === componentSurface) ?? hosts[0] ?? null)
    : null
  const dependents = await getDependents(component.name)
  const usage = (await getUsageMap(catalog)).get(component.name)
  const nativePreview =
    component.origin === "native" ? getNativePreview(component.name) : undefined
  // A ported live import (host-previews registry): the host's ACTUAL component,
  // rendered in the product's scoped theme — Storybook semantics for externals.
  const hostPreview = external
    ? getHostPreview(component.name, componentSurface)
    : undefined
  // Commit-anchored doc-sync state (lib/system/ux-docs.ts). External items have
  // their own drift check (check:host); native primitives track upstream.
  const docSync =
    !external && component.origin !== "native" && doc
      ? getUxDocSync(component.name, component.files, component.surface)
      : null
  // Blocks and templates get the device-width switcher on previews by default;
  // an example can override either way via `viewports`.
  const framedByDefault = component.kind !== "component"
  // Templates render whole app frames — a max-w-3xl column chokes them. Widen
  // the page to a max-w-6xl lane so the RENDER areas (Live preview, Examples)
  // can breathe, while every READING block (prose, tables, code, captions)
  // stays pinned to the max-w-3xl reading column so type never runs too wide.
  const isTemplate = component.kind === "template"
  const readCol = isTemplate ? "max-w-3xl" : undefined

  // A live import renders the real thing above — screenshot examples are
  // redundant beside it. Keep their code snippets; drop code-less images.
  const docExamples = hostPreview
    ? doc?.examples
        ?.map((ex) =>
          ex.preview.kind === "image" ? { ...ex, preview: { kind: "code" as const } } : ex
        )
        .filter((ex) => ex.preview.kind !== "code" || ex.code)
    : doc?.examples

  // Concept siblings — the same design concept on OTHER surfaces (§5b
  // availability strip, à la Material's availability matrix).
  const siblings = matches.filter((c) => c !== component)

  return (
    <>
      <main className={cn("flex w-full flex-col gap-8 p-6", isTemplate ? "max-w-6xl" : "max-w-3xl")}>
        {/* Header meta */}
        <div className={cn("flex flex-col gap-3", readCol)}>
          <h1 className="text-base font-semibold">{component.title}</h1>
          {/* Signal-only pills: status, origin when it says something (host /
              shadcn / extended — "custom" is the default and reads as noise),
              and the docs-stale warning. Tier + surface live in the breadcrumb;
              categories are gallery filter facets, not page info. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium">
              {component.name}
            </span>
            {component.origin !== "custom" && (
              <Badge variant="outline" className="text-muted-foreground">
                {ORIGIN_LABEL[component.origin]}
              </Badge>
            )}
            {/* Companion-mode differentiation: what the host built this ON —
                their shadcn primitive vs bespoke to their codebase. */}
            {external && component.hostBasis && (
              <Badge variant="outline" className="text-muted-foreground">
                {component.hostBasis === "shadcn" ? "shadcn-based" : "custom-built"}
              </Badge>
            )}
            {external &&
              (hostPreview ? (
                <StatusBadge status="success">live</StatusBadge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  documented
                </Badge>
              ))}
            {component.status && (
              <StatusBadge status={STATUS_TONE[component.status]}>
                {component.status}
              </StatusBadge>
            )}
            {docSync?.state === "stale" && (
              <StatusBadge status="warning">docs stale</StatusBadge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {component.description}
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground/80">
            {external ? (
              <span>Cataloged {formatDay(component.addedAt)}</span>
            ) : (
              <>
                <span>Added {formatDay(component.addedAt)}</span>
                <span>Updated {formatDay(component.updatedAt)}</span>
              </>
            )}
            {component.files.map((f) => (
              <span key={f} className="font-mono">
                {host ? `${host.root}/${f}` : f}
              </span>
            ))}
          </div>
          {component.dependencies.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Depends on</span>
              {component.dependencies.map((dep) => (
                <Badge
                  key={dep}
                  variant="outline"
                  className="font-mono text-muted-foreground"
                >
                  {dep}
                </Badge>
              ))}
            </div>
          )}
          {siblings.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Also implemented on</span>
              {siblings.map((s) => (
                <Link
                  key={`${s.surface}:${s.name}`}
                  href={itemHref(
                    s.kind,
                    s.name,
                    s.surface ?? defaultSurfaceId()
                  )}
                  className="rounded-md border px-2 py-0.5 hover:bg-muted/50"
                >
                  {surfaceLabel(s.surface)}
                  {s.status && (
                    <span className="text-muted-foreground"> · {s.status}</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {!doc && component.origin === "native" && (
          <section className={cn("flex flex-col gap-4", readCol)}>
            <SectionHeader title="Preview" />
            {nativePreview ? (
              <PreviewFrame>
                {adapter.renderPreview(nativePreview)}
              </PreviewFrame>
            ) : (
              <PreviewFrame>
                <span className="font-mono text-xs text-muted-foreground">
                  {`<${component.name} />`}
                </span>
              </PreviewFrame>
            )}
            <p className="text-sm text-muted-foreground">
              Upstream shadcn/ui primitive — vendored as-is and themed by this
              project&rsquo;s tokens. Full API and examples live in the shadcn
              documentation.
              {component.docsUrl && (
                <>
                  {" "}
                  <a
                    href={component.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-foreground underline underline-offset-2"
                  >
                    ui.shadcn.com <ExternalLink className="size-3" />
                  </a>
                </>
              )}
            </p>
          </section>
        )}

        {!doc && component.origin !== "native" && (
          <Empty className={readCol}>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>No documentation module yet</EmptyTitle>
              <EmptyDescription>
                Add <code>{component.name}.docs.tsx</code> and register it in{" "}
                <code>lib/system/docs.ts</code>.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {/* Live import (ported host component) — the host's real source
            rendering here, in the product's scoped theme. When absent, the
            entry is documented-only and the Examples below carry screenshots
            of the running host instead. */}
        {hostPreview ? (
          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Live preview"
              hint="the host's actual component, imported"
            />
            <PreviewFrame>
              {hostPreview.theme ? (
                <ProductThemeScope theme={hostPreview.theme}>
                  <hostPreview.component />
                </ProductThemeScope>
              ) : (
                <hostPreview.component />
              )}
            </PreviewFrame>
          </section>
        ) : null}

        {/* Examples — the REAL rendered item leads the page */}
        {docExamples?.length ? (
          <section className="flex flex-col gap-4">
            <SectionHeader title="Examples" />
            {docExamples.map((ex) => (
              <div key={ex.title} className="flex flex-col gap-2">
                <div className={cn("flex items-baseline gap-2", readCol)}>
                  <h3 className="text-sm font-medium">{ex.title}</h3>
                  {ex.description && (
                    <span className="text-xs text-muted-foreground">
                      {ex.description}
                    </span>
                  )}
                </div>
                {ex.preview.kind !== "code" &&
                  ((ex.viewports ?? framedByDefault) &&
                  (ex.preview.kind === "live" ||
                    ex.preview.kind === "embed") ? (
                    <ViewportFrame fullscreen={component.kind === "template"}>
                      {adapter.renderPreview(ex.preview)}
                    </ViewportFrame>
                  ) : (
                    <PreviewFrame>
                      {adapter.renderPreview(ex.preview)}
                    </PreviewFrame>
                  ))}
                {ex.code && (
                  <pre className={cn("overflow-x-auto rounded-lg border bg-muted/60 p-3 font-mono text-xs", readCol)}>
                    <code>{ex.code}</code>
                  </pre>
                )}
              </div>
            ))}
          </section>
        ) : null}

        {/* Reading column: everything below the render areas stays pinned to
            the max-w-3xl reading width even when the page runs wide (templates). */}
        <div className={cn("flex flex-col gap-8", readCol)}>
        {/* Intent — the job this piece does, for stakeholders and agents */}
        {doc?.intent ? (
          <section className="flex flex-col gap-3">
            <SectionHeader title="Intent" hint="why this exists" />
            <div className="text-sm">
              <Markdown>{doc.intent}</Markdown>
            </div>
          </section>
        ) : null}

        {/* Anatomy — skeleton wireframe + labeled regions */}
        {doc?.anatomy ? (
          <section className="flex flex-col gap-4">
            <SectionHeader title="Anatomy" hint="structure, not content" />
            {doc.anatomy.description && (
              <p className="text-sm text-muted-foreground">
                {doc.anatomy.description}
              </p>
            )}
            {doc.anatomy.preview && doc.anatomy.preview.kind !== "code" && (
              <PreviewFrame>
                {adapter.renderPreview(doc.anatomy.preview)}
              </PreviewFrame>
            )}
            {doc.anatomy.regions?.length ? (
              <div className="overflow-hidden rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/4">Region</TableHead>
                      <TableHead>Purpose</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {doc.anatomy.regions.map((r) => (
                      <TableRow key={r.name}>
                        <TableCell className="text-xs font-medium">
                          {r.name}
                        </TableCell>
                        <TableCell className="text-xs whitespace-normal text-muted-foreground">
                          {r.purpose}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Interactions — trigger / behavior / result, data not prose */}
        {doc?.interactions?.length ? (
          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Interactions"
              hint="what the user does, what happens"
            />
            <div className="overflow-hidden rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/4">Trigger</TableHead>
                    <TableHead>Behavior</TableHead>
                    <TableHead className="w-1/4">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doc.interactions.map((i) => (
                    <TableRow key={i.trigger}>
                      <TableCell className="align-top text-xs font-medium whitespace-normal">
                        {i.trigger}
                        {i.keyboard && (
                          <span className="block font-mono text-2xs text-muted-foreground">
                            {i.keyboard}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="align-top text-xs whitespace-normal text-muted-foreground">
                        {i.behavior}
                      </TableCell>
                      <TableCell className="align-top text-xs whitespace-normal text-muted-foreground">
                        {i.result ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        ) : null}

        {/* Responsive — per-viewport behavior, same vocabulary as ViewportFrame */}
        {doc?.responsive?.length ? (
          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Responsive"
              hint="mobile 375 · tablet 768 · desktop"
            />
            <div className="overflow-hidden rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/4">Viewport</TableHead>
                    <TableHead>Behavior</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doc.responsive.map((r) => (
                    <TableRow key={r.viewport}>
                      <TableCell className="text-xs font-medium capitalize">
                        {r.viewport}
                      </TableCell>
                      <TableCell className="text-xs whitespace-normal text-muted-foreground">
                        {r.behavior}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        ) : null}

        {/* States */}
        {doc?.states?.length ? (
          <section className="flex flex-col gap-4">
            <SectionHeader title="States" hint="empty / loading / error" />
            {doc.states.map((s) => (
              <div key={s.name} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-sm font-medium">{s.name}</h3>
                  {s.description && (
                    <span className="text-xs text-muted-foreground">
                      {s.description}
                    </span>
                  )}
                </div>
                {s.preview.kind !== "code" && (
                  <PreviewFrame>
                    {adapter.renderPreview(s.preview)}
                  </PreviewFrame>
                )}
              </div>
            ))}
          </section>
        ) : null}

        {/* Props */}
        {doc?.props?.length ? (
          <section className="flex flex-col gap-3">
            <SectionHeader title="Props" />
            <div className="overflow-hidden rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doc.props.map((p) => (
                    <TableRow key={p.name}>
                      <TableCell className="font-mono text-xs font-medium">
                        {p.name}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {p.type}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {p.default ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs whitespace-normal text-muted-foreground">
                        {p.description ?? ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        ) : null}

        {/* Notes */}
        {doc?.notes ? (
          <section className="flex flex-col gap-3">
            <SectionHeader title="Notes" />
            <div className="text-sm">
              <Markdown>{doc.notes}</Markdown>
            </div>
          </section>
        ) : null}

        {/* Used in — from the import graph (lib/system/usage.ts). External items
            live in the host repo, so host usage is documented in their notes
            instead — this clone's import graph can't see them. */}
        {!external && (
          <section className="flex flex-col gap-3">
            <SectionHeader title="Used in" hint="from the import graph" />
            {usage && usage.productFiles.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {usage.productFiles.map((f) => (
                  <span key={f} className="font-mono text-xs">
                    {routeLabel(f)}
                    {routeLabel(f) !== f && (
                      <span className="text-muted-foreground/70"> · {f}</span>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not used in any product view yet.
                {usage &&
                  usage.hubFiles.length > 0 &&
                  ` Used by Synclair (${usage.hubFiles.length} file${usage.hubFiles.length === 1 ? "" : "s"}).`}
              </p>
            )}
            {(() => {
              const usedBy = [
                ...new Set([
                  ...(usage?.usedByItems ?? []),
                  ...dependents.map((d) => d.name),
                ]),
              ].sort()
              if (usedBy.length === 0) return null
              return (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Used by</span>
                  {usedBy.map((n) => {
                    const item = catalog.find((c) => c.name === n)
                    return item ? (
                      <Link
                        key={n}
                        href={itemHref(item.kind, n)}
                        className="rounded-md border px-3 py-1.5 font-mono text-xs hover:bg-muted/50"
                      >
                        {n}
                      </Link>
                    ) : (
                      <span
                        key={n}
                        className="rounded-md border px-3 py-1.5 font-mono text-xs"
                      >
                        {n}
                      </span>
                    )
                  })}
                </div>
              )
            })()}
          </section>
        )}
        </div>
      </main>
    </>
  )
}
