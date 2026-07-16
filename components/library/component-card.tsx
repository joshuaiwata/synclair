import Link from "next/link"

import { getHostPreview } from "@/components/host-previews/registry"
import { CardThumb } from "@/components/library/card-thumb"
import { getNativePreview } from "@/components/library/native-previews"
import { ProductThemeScope } from "@/components/library/product-theme-scope"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { adapterFor } from "@/lib/system/adapters"
import type {
  ComponentOrigin,
  ComponentStatus,
  RegistryComponent,
} from "@/lib/system/components"
import { getDoc } from "@/lib/system/docs"
import type { HostUsage } from "@/lib/system/host-usage"
import { itemHref } from "@/lib/system/tiers"
import type { ItemUsage } from "@/lib/system/usage"

const STATUS_TONE: Record<ComponentStatus, "success" | "info" | "warning"> = {
  stable: "success",
  beta: "info",
  deprecated: "warning",
}

const ORIGIN_LABEL: Record<ComponentOrigin, string> = {
  native: "shadcn",
  extended: "extended",
  custom: "custom",
  external: "host",
}

/** The preview shown in a card's media area — the item's first doc example, the built-in preview for a native primitive, or (for an external host-app item) the live imported component if ported, else the cataloged screenshot. */
function CardPreview({ component }: { component: RegistryComponent }) {
  // Host (external) items: the FAITHFUL previews are, in order, (1) the host's
  // ACTUAL component live-imported via the host-previews registry (Storybook
  // semantics — rendered in the product's scoped theme), or (2) a screenshot
  // cataloged from the running host (`previewImage`). Never Synclair's own
  // same-named primitive (getNativePreview) or a registered doc example — a
  // host `badge` with email/password variants is not Synclair's badge. With
  // neither, an honest `<name />` placeholder — never a misleading stand-in.
  const isHost = component.origin === "external"
  const hostPreview = isHost ? getHostPreview(component.name, component.surface) : undefined
  if (hostPreview) {
    const Live = hostPreview.component
    const node = hostPreview.theme ? (
      <ProductThemeScope theme={hostPreview.theme} className="bg-transparent p-0">
        <Live />
      </ProductThemeScope>
    ) : (
      <Live />
    )
    return (
      <div className="bg-muted/30 relative h-36 overflow-hidden border-b">
        <CardThumb>{node}</CardThumb>
      </div>
    )
  }
  const imagePreview = component.previewImage
    ? { kind: "image" as const, src: component.previewImage, alt: component.title }
    : undefined
  // First RENDERABLE example — a docs module may lead with a code-only example
  // (kind: "code"), which has no visual; skipping it keeps the card from
  // degrading to the placeholder when a later example renders fine.
  // Registered items may opt into a screenshot THUMB via meta.previewImage —
  // an explicit override for complex blocks that scale down unreadably. The
  // doc page still renders live; cards only.
  // Thumbs render live nodes or images only — never an embed: an iframe in a
  // zoom-to-fit thumb is a live page load per card. A block whose first
  // example is a scene() embed opts into a screenshot via meta.previewImage.
  const first = isHost
    ? imagePreview
    : (imagePreview ??
      getDoc(component.name, component.surface)?.examples?.find(
        (ex) => ex.preview.kind === "live" || ex.preview.kind === "image"
      )?.preview ??
      getNativePreview(component.name))
  const preview = first ? adapterFor(component.surface).renderPreview(first) : null

  return (
    <div className="bg-muted/30 relative flex h-36 items-center justify-center overflow-hidden border-b">
      {preview ? (
        // Non-interactive, zoom-to-fit thumbnail (Storybook-canvas semantics).
        <CardThumb>{preview}</CardThumb>
      ) : (
        <span className="text-muted-foreground/60 font-mono text-xs">
          {`<${component.name} />`}
        </span>
      )}
    </div>
  )
}

export function ComponentCard({
  component,
  usage,
  hostUsage,
  href,
  chips,
}: {
  component: RegistryComponent
  usage?: ItemUsage
  /** External items: LIVE usage counted from the host's web source (null → host not checked out / non-web surface). */
  hostUsage?: HostUsage | null
  /** Override the doc link (scoped path, or a concept page for multi-surface entries). */
  href?: string
  /** Availability/context chips — platform badges on concept entries, "Shared" inside a scope. */
  chips?: string[]
}) {
  // Foundation items (Synclair's own hub-skin) are used BY the hub, not the
  // product app — product files alone would read "unused" for every one of
  // them in new-project mode. Count the whole repo for those; product views
  // (the real build) for everything else.
  const isFoundation = component.layer === "foundation"
  const usedIn = isFoundation
    ? (usage?.productFiles.length ?? 0) + (usage?.hubFiles.length ?? 0)
    : (usage?.productFiles.length ?? 0)
  const usedUnit = isFoundation ? "file" : "view"
  // Live count (a "~" pulse, not an audit) wins over the intake-time snapshot.
  const hostFiles = hostUsage?.fileCount ?? component.hostUsageCount
  const hostLiveCounted = hostUsage != null
  return (
    // The doc link is an absolute OVERLAY, not a wrapper: previews may contain
    // real anchors (breadcrumb, filter chips) and HTML forbids <a> inside <a>
    // — as a sibling under the overlay the preview stays valid markup.
    <div className="group relative">
      <Card className="group-hover:border-foreground/20 gap-0 overflow-hidden py-0 transition-colors">
        <CardPreview component={component} />
        <div className="flex flex-col gap-1.5 p-4">
          <div className="flex items-center gap-2">
            <h3 className="flex-1 truncate text-sm font-medium">{component.title}</h3>
            {chips?.map((chip) => (
              <Badge key={chip} variant="outline" className="text-muted-foreground text-3xs">
                {chip}
              </Badge>
            ))}
            {/* Foundation items (Synclair's own hub-skin, shown in new-project
                mode) get a distinct badge so they read apart from project code. */}
            {component.layer === "foundation" && (
              <Badge variant="secondary" className="text-muted-foreground text-3xs">
                Synclair
              </Badge>
            )}
            <Badge
              variant={component.origin === "custom" ? "secondary" : "outline"}
              className="text-muted-foreground text-3xs"
            >
              {ORIGIN_LABEL[component.origin]}
            </Badge>
            {/* Live = the host's actual component is imported and rendering
                above; its absence on a host item means documented-only. */}
            {component.origin === "external" &&
              getHostPreview(component.name, component.surface) && (
                <StatusBadge status="success" className="text-3xs">
                  live
                </StatusBadge>
              )}
            {component.status && (
              <StatusBadge status={STATUS_TONE[component.status]} className="text-3xs">
                {component.status}
              </StatusBadge>
            )}
          </div>
          <p className="text-muted-foreground line-clamp-2 text-xs">{component.description}</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-muted-foreground/70 font-mono text-2xs">{component.name}</span>
            <span className="flex items-center gap-2">
              {/* External items have no local usage — show their HOST usage:
                  live-counted from the host's web source when it's checked out
                  (~ = pulse, recounted per render), else the cataloged
                  intake-time snapshot. */}
              {component.origin === "external"
                ? hostFiles != null && (
                    <span className="text-muted-foreground text-2xs">
                      in host · {hostLiveCounted ? "~" : ""}
                      {hostFiles} {hostFiles === 1 ? "file" : "files"}
                    </span>
                  )
                : usage &&
                  (usedIn > 0 ? (
                    <span className="text-muted-foreground text-2xs">
                      in use · {usedIn} {usedIn === 1 ? usedUnit : `${usedUnit}s`}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60 text-2xs">unused</span>
                  ))}
              {/* Natives are documented upstream; externals carry synthesized docs from the catalog. */}
              {!component.docs && component.origin !== "native" && component.origin !== "external" && (
                <Badge variant="outline" className="text-warning border-warning/40 text-3xs">
                  no docs
                </Badge>
              )}
            </span>
          </div>
        </div>
      </Card>
      <Link
        href={href ?? itemHref(component.kind, component.name)}
        className="absolute inset-0"
        aria-label={component.title}
      >
        <span className="sr-only">{component.title}</span>
      </Link>
    </div>
  )
}
