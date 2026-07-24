"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { PageHeader } from "@/components/page-header"
import type {
  LibraryTreeData,
  TreeLeaf,
  TreeRootNode,
} from "@/lib/system/library-tree"
import { synclair } from "@/lib/system/routes"
import { inheritsShared } from "@/lib/system/surfaces"
import { TIERS, tierBySlug, tierSlug, type TierMeta } from "@/lib/system/tiers"
import type { ComponentKind } from "@/lib/system/components"
import { cn } from "@/lib/utils"

/**
 * The LIBRARY EXPLORER — the two-pane shell every library route renders in:
 * a flat, hairline-separated rail on the left (two selectors — surface + tier
 * — over a grouped, filterable item list, shadcn/Storybook docs style), the
 * routed page on the right under the shared page-header bar.
 *
 * The old accordion tree stacked every tier at once and made you expand to
 * reach anything; the two selectors collapse that to one clear "which surface,
 * which tier" choice, and the list below shows just that slice. Scope (a
 * surface you've "entered") and tier both live in the URL path, GitHub-style —
 * the selects navigate rather than filter.
 *
 * One shell, two collapses: single-surface projects render the same explorer
 * minus the surface level and the scope select (`tree.multiSurface` gate).
 */

const LIBRARY_BASE = synclair("/library")

/** Parse the current scope + tier out of the pathname. */
function useLocation(tree: LibraryTreeData) {
  const pathname = usePathname()
  return React.useMemo(() => {
    // Scoped path: /synclair/library/<surface>[/<tier>[/<name>]]
    if (tree.multiSurface && pathname.startsWith(`${LIBRARY_BASE}/`)) {
      const [scopeId, tierSeg] = pathname.slice(LIBRARY_BASE.length + 1).split("/")
      if (tree.roots.some((r) => r.id === scopeId)) {
        return { pathname, scopeId, tier: tierSeg ? tierBySlug(tierSeg) : undefined }
      }
    }
    // Flat path: /synclair/<tier>[/<name>]
    const [tierSeg] = pathname.slice(synclair("").length + 1).split("/")
    return { pathname, scopeId: undefined, tier: tierBySlug(tierSeg) }
  }, [tree, pathname])
}

export function LibraryExplorer({
  tree,
  children,
}: {
  tree: LibraryTreeData
  children: React.ReactNode
}) {
  const router = useRouter()
  const { pathname, scopeId, tier } = useLocation(tree)
  const [filter, setFilter] = React.useState("")
  const filterRef = React.useRef<HTMLInputElement>(null)

  // The active tier drives both the select value and the list; default to the
  // first tier so a surface home (no tier in the path) still shows something.
  const activeKind: ComponentKind = tier?.kind ?? TIERS[0].kind

  // "/" focuses the filter from anywhere in the explorer.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return
      e.preventDefault()
      filterRef.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Where a (surface, tier) pair lives. "all" surfaces → the flat tier route.
  const tierHref = (surface: string | undefined, kind: ComponentKind) =>
    surface ? synclair(`/library/${surface}/${tierSlug(kind)}`) : TIERS.find((t) => t.kind === kind)!.path

  const scopedRoot = scopeId ? tree.roots.find((r) => r.id === scopeId) : undefined
  // Entered a surface: its items for this tier, plus Shared alongside (a web dev
  // still sees what packages/ui offers). All view: every surface.
  const visibleRoots = scopedRoot
    ? [scopedRoot, ...tree.roots.filter((r) => r.id === "shared" && r.id !== scopedRoot.id)]
    : tree.roots

  const groups = buildGroups(visibleRoots, activeKind, scopedRoot?.id, filter.trim().toLowerCase())

  return (
    <div className="flex min-h-svh flex-col">
      <ExplorerHeader tree={tree} pathname={pathname} />
      <div className="flex min-h-0 flex-1">
        {/* Explorer rail — a FLAT second column, hairline-separated (the
            Storybook/docs double-sidebar pattern). No card chrome: a floating
            shadowed panel in the same tint as the app sidebar read as a
            duplicate sidebar, not a nested level. */}
        {/* top-14/-3.5rem pairs with the sticky ExplorerHeader (h-14): the rail
            is always fully visible, so the item list scrolls INTERNALLY
            instead of running below the fold. */}
        <aside className="sticky top-14 flex max-h-[calc(100svh-3.5rem)] w-64 shrink-0 flex-col self-start overflow-hidden border-r">
          <div className="flex flex-col gap-2 border-b p-2">
            {tree.multiSurface && (
              <Select
                value={scopeId ?? "all"}
                // Switching surface keeps the tier you're on so the two selects compose.
                onValueChange={(v) =>
                  router.push(tierHref(v === "all" ? undefined : v, activeKind))
                }
              >
                {/* bg-card: on the tinted canvas (background == sidebar tint
                    since the facelift) a bg-background control is same-color-
                    on-same-color — fields sit one step ABOVE their surface,
                    which is bg-card now. */}
                <SelectTrigger size="sm" className="bg-card w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    All surfaces
                  </SelectItem>
                  {tree.scopes.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {s.label}
                      {s.badge && (
                        <span className="text-muted-foreground font-mono text-3xs">{s.badge}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {/* Tier select only when surfaces exist: it composes with the
                surface select (switch surface, keep tier). Single-surface
                projects already switch tiers from the app sidebar and the
                breadcrumb names the tier — a third control is redundant. */}
            {tree.multiSurface && (
              <Select
                value={activeKind}
                onValueChange={(v) => router.push(tierHref(scopeId, v as ComponentKind))}
              >
                <SelectTrigger size="sm" className="bg-card w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => (
                    <SelectItem key={t.kind} value={t.kind} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="relative">
              <Input
                ref={filterRef}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setFilter("")}
                placeholder="Filter…"
                className="bg-card h-7 pr-7 text-xs"
              />
              <kbd className="bg-muted text-muted-foreground pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 rounded px-1 font-mono text-3xs">
                /
              </kbd>
            </div>
          </div>
          {/* Native overflow, not Radix ScrollArea: its viewport doesn't
              reliably clamp to a flexed max-height parent, which left this
              list unscrollable. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ItemList groups={groups} pathname={pathname} tier={tier ?? TIERS.find((t) => t.kind === activeKind)!} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}

/* --------------------------------- grouping -------------------------------- */

interface ItemGroup {
  key: string
  label: string
  badge?: string
  items: TreeLeaf[]
}

const SHARED_ID = "shared"
const byTitle = (a: TreeLeaf, b: TreeLeaf) => a.title.localeCompare(b.title)

/**
 * Bucket the selected tier's items for the list. Entered a surface: its OWN
 * items grouped by CATEGORY, then a distinct "Shared" group for the packages
 * every surface inherits (matches the gallery, which shows own + shared badged)
 * — kept as its own labeled group so switching surfaces reads clearly instead
 * of looking like one undifferentiated list. All-surfaces: one group per
 * surface — the salient axis when nothing's been entered.
 */
function buildGroups(
  roots: TreeRootNode[],
  kind: ComponentKind,
  scopeId: string | undefined,
  filter: string
): ItemGroup[] {
  const match = (i: TreeLeaf) => !filter || i.terms.includes(filter)
  const leavesOf = (root: TreeRootNode | undefined) =>
    (root?.tiers.find((t) => t.kind === kind)?.categories ?? []).flatMap((c) => c.items)

  if (scopeId) {
    const groups: ItemGroup[] = []
    // The entered surface's own items, grouped by category.
    const own = roots.find((r) => r.id === scopeId)
    const ownTier = own?.tiers.find((t) => t.kind === kind)
    for (const cat of ownTier?.categories ?? []) {
      const items = cat.items.filter(match).sort(byTitle)
      if (items.length) groups.push({ key: `cat:${cat.label}`, label: cat.label, items })
    }
    groups.sort((a, b) => a.label.localeCompare(b.label))
    // Shared packages, inherited by platform-compatible surfaces only (a web
    // design system doesn't belong under an RN surface) — its own group.
    // Re-home each item's link to the CURRENT surface so clicking one keeps you
    // in this scope instead of flipping the selector over to Shared.
    if (scopeId !== SHARED_ID && inheritsShared(scopeId)) {
      const shared = leavesOf(roots.find((r) => r.id === SHARED_ID))
        .filter(match)
        .sort(byTitle)
        .map((i) => ({ ...i, href: synclair(`/library/${scopeId}/${tierSlug(kind)}/${i.name}`) }))
      if (shared.length) groups.push({ key: "shared", label: "Shared", badge: "pkg", items: shared })
    }
    return groups
  }

  // All-surfaces: one group per surface.
  return roots
    .map((root) => ({
      key: root.id,
      label: root.label,
      badge: root.badge,
      items: leavesOf(root).filter(match).sort(byTitle),
    }))
    .filter((g) => g.items.length > 0)
}

/* ---------------------------------- list ----------------------------------- */

function ItemList({
  groups,
  pathname,
  tier,
}: {
  groups: ItemGroup[]
  pathname: string
  tier: TierMeta
}) {
  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-6 text-xs">
        No {tier.label.toLowerCase()} here.
      </p>
    )
  }
  return (
    <div className="py-1">
      {groups.map((group) => (
        <SidebarGroup key={group.key} className="py-1">
          <SidebarGroupLabel className="gap-1.5 text-3xs tracking-wide uppercase">
            <span className="truncate">{group.label}</span>
            {group.badge && (
              <Badge variant="outline" className="text-muted-foreground px-1 text-3xs">
                {group.badge}
              </Badge>
            )}
            <span className="text-muted-foreground/70 ml-auto font-mono text-2xs normal-case">
              {group.items.length}
            </span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={`${item.surface}:${item.name}`}>
                  <SidebarMenuButton
                    asChild
                    size="sm"
                    isActive={pathname === item.href}
                    className="text-xs"
                  >
                    <Link href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
                      <span className="truncate">{item.title}</span>
                      {item.status === "deprecated" && (
                        <span className="bg-warning ml-auto size-1.5 shrink-0 rounded-full" title="deprecated" />
                      )}
                      {item.status === "beta" && (
                        <span className="bg-info ml-auto size-1.5 shrink-0 rounded-full" title="beta" />
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </div>
  )
}

/* ------------------------------- page header ------------------------------- */

const TIER_LABELS: Record<string, string> = {
  components: "Components",
  blocks: "Blocks",
  templates: "Templates",
}

/**
 * The library's top bar — the shared `PageHeader`, with a breadcrumb trail
 * passed into its title slot instead of a plain string. Same chrome as every
 * other hub page because it *is* that component, not a copy of it.
 */
function ExplorerHeader({ tree, pathname }: { tree: LibraryTreeData; pathname: string }) {
  const rootLabel = (id: string) => tree.roots.find((r) => r.id === id)?.label ?? id

  const crumbs: { label: string; href?: string; mono?: boolean }[] = []
  if (tree.multiSurface) {
    crumbs.push({ label: "Library", href: LIBRARY_BASE })
  }
  if (pathname.startsWith(`${LIBRARY_BASE}/`)) {
    const [scope, tierSeg, name] = pathname.slice(LIBRARY_BASE.length + 1).split("/")
    if (scope) crumbs.push({ label: rootLabel(scope), href: synclair(`/library/${scope}`) })
    if (tierSeg && TIER_LABELS[tierSeg])
      crumbs.push({ label: TIER_LABELS[tierSeg], href: synclair(`/library/${scope}/${tierSeg}`) })
    if (name) crumbs.push({ label: decodeURIComponent(name), mono: true })
  } else {
    const [tierSeg, name] = pathname.slice(synclair("").length + 1).split("/")
    if (tierSeg && TIER_LABELS[tierSeg])
      crumbs.push({ label: TIER_LABELS[tierSeg], href: synclair(`/${tierSeg}`) })
    if (name) crumbs.push({ label: decodeURIComponent(name), mono: true })
  }
  const last = crumbs.length - 1

  return (
    // Sticky: the rail pins at top-14 right below this bar, so together they
    // form the always-visible explorer chrome while the page scrolls.
    <PageHeader
      className="sticky top-0 z-20"
      title={
        <Breadcrumb>
          {/* Same voice as every other page's context bar (PageHeader string
              title: text-sm font-medium text-muted-foreground) — the trail is
              context chrome, not the page's h1. */}
          <BreadcrumbList className="text-sm">
            {crumbs.map((c, i) => (
              <React.Fragment key={`${c.label}-${i}`}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {i === last || !c.href ? (
                    <BreadcrumbPage
                      className={cn("text-muted-foreground font-medium", c.mono && "font-mono")}
                    >
                      {c.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={c.href}>{c.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      }
    />
  )
}
