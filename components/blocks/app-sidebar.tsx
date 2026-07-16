"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Blocks,
  BookOpen,
  Bot,
  ClipboardList,
  Component,
  Compass,
  FileClock,
  GitCommitHorizontal,
  Library,
  LayoutTemplate,
  Palette,
  PanelsTopLeft,
  Search,
  Server,
  ShieldCheck,
  Waypoints,
} from "lucide-react"

import { OPEN_COMMAND_EVENT } from "@/components/blocks/command-palette"
import { Badge } from "@/components/ui/badge"
import { synclair } from "@/lib/system/routes"
import { project } from "@/lib/system/seed/project"
import { isMultiSurface } from "@/lib/system/surfaces"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

type NavItem = {
  title: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  /** Extra route prefixes that keep this item highlighted (e.g. the Library drill-in's tier pages). */
  also?: string[]
  soon?: boolean
}

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Synclair",
    items: [
      { title: "Overview", icon: PanelsTopLeft, href: synclair() },
      { title: "Reports", icon: ClipboardList, href: synclair("/reports") },
    ],
  },
  {
    label: "Project",
    items: [
      { title: "Knowledge", icon: Library, href: synclair("/knowledge") },
      { title: "System Map", icon: Waypoints, href: synclair("/system") },
      { title: "Hygiene", icon: ShieldCheck, href: synclair("/hygiene") },
      { title: "Figma Manifest", icon: FileClock, href: synclair("/figma-manifest") },
      { title: "References", icon: BookOpen, href: synclair("/references") },
      { title: "GitHub", icon: GitCommitHorizontal, href: synclair("/github") },
    ],
  },
  {
    label: "Library",
    // Multi-surface projects get a single drill-in entry (the /library landing
    // shows each surface's library); single-surface keeps the flat four items.
    items: isMultiSurface()
      ? [
          { title: "Foundations", icon: Palette, href: synclair("/foundations") },
          {
            title: "Library",
            icon: Component,
            href: synclair("/library"),
            also: [synclair("/components"), synclair("/blocks"), synclair("/templates")],
          },
        ]
      : [
          { title: "Foundations", icon: Palette, href: synclair("/foundations") },
          { title: "Components", icon: Component, href: synclair("/components") },
          { title: "Blocks", icon: Blocks, href: synclair("/blocks") },
          { title: "Templates", icon: LayoutTemplate, href: synclair("/templates") },
        ],
  },
  {
    label: "System",
    items: [
      { title: "AI Setup", icon: Bot, href: synclair("/ai-setup") },
      { title: "Environment", icon: Server, href: synclair("/environment") },
    ],
  },
]

export function AppSidebar({
  snapshot,
  mode,
  host,
}: {
  snapshot?: string
  /** Resolved setup mode (embedded/watcher), or undefined when blank/unresolved. */
  mode?: { label: string; blurb: string }
  /** Companion-mode host freshness (lib/system/host-status.ts) — undefined when no host. */
  host?: { label: string; blurb: string; attention: boolean }
}) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/"
          className="hover:bg-sidebar-accent flex items-center gap-2.5 rounded-md px-2 py-1.5 group-data-[collapsible=icon]:px-1"
          title={`Back to the ${project.name} app`}
        >
          <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold">
            {project.name.charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
            {project.name} <span className="text-muted-foreground font-normal">/ Synclair</span>
          </span>
        </Link>
        {mode && (
          <Badge
            variant="outline"
            className="text-muted-foreground mx-2 w-fit gap-1 text-2xs font-normal group-data-[collapsible=icon]:hidden"
            title={mode.blurb}
          >
            {mode.label} mode
          </Badge>
        )}
        {/* Ambient freshness: is the catalog current with the host app? Amber
            when the host moved or has uncataloged components — detection is
            free on every render; the refresh stays a deliberate intake run. */}
        {host && (
          <Badge
            variant="outline"
            className={`mx-2 w-fit gap-1 text-2xs font-normal group-data-[collapsible=icon]:hidden ${
              host.attention ? "text-warning border-warning/40" : "text-muted-foreground"
            }`}
            title={host.blurb}
          >
            {host.label}
          </Badge>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="pb-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => window.dispatchEvent(new CustomEvent(OPEN_COMMAND_EVENT))}
                  className="text-muted-foreground"
                  tooltip="Search  ⌘K"
                >
                  <Search />
                  Search
                  <kbd className="bg-muted text-muted-foreground ml-auto rounded px-1.5 py-0.5 font-mono text-3xs leading-none">
                    ⌘K
                  </kbd>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={
                        pathname === item.href ||
                        // Index hrefs ("/" or the Synclair base) match only exactly;
                        // deeper items highlight on their sub-routes too.
                        (item.href !== "/" &&
                          item.href !== synclair() &&
                          pathname.startsWith(`${item.href}/`)) ||
                        (item.also?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ??
                          false)
                      }
                    >
                      <Link href={item.href}>
                        <item.icon />
                        {item.title}
                        {item.soon && (
                          <Badge variant="outline" className="ml-auto text-xs">
                            soon
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="How Synclair works"
              isActive={pathname === synclair("/how-it-works")}
              className="h-auto py-2"
            >
              <Link href={synclair("/how-it-works")}>
                <Compass />
                <span className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="text-sm font-medium">How it works</span>
                  <span className="text-muted-foreground text-2xs">What Synclair is</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {snapshot && <p className="text-muted-foreground px-2 py-1 text-xs">{snapshot}</p>}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
