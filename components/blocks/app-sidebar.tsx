"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowUpRight, Compass, Search, Settings } from "lucide-react"

import { OPEN_COMMAND_EVENT } from "@/components/blocks/command-palette"
import { Badge } from "@/components/ui/badge"
import {
  buildNavGroups,
  EXTENSIONS,
  type NavGroup,
} from "@/lib/system/extensions-manifest"
import { HANDBOOK_URL, synclair } from "@/lib/system/routes"
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

export function AppSidebar({
  snapshot,
  mode,
  host,
  hiddenSections,
  enabledExtensions,
}: {
  snapshot?: string
  /** Resolved setup mode (embedded/watcher), or undefined when blank/unresolved. */
  mode?: { label: string; blurb: string }
  /** Companion-mode host freshness (lib/system/host-status.ts) — undefined when no host. */
  host?: { label: string; blurb: string; attention: boolean }
  /** Core section ids hidden via Settings (lib/system/extensions.ts). Absent = all visible. */
  hiddenSections?: string[]
  /** Enabled extension ids. Absent = every extension's manifest default. */
  enabledExtensions?: string[]
}) {
  const pathname = usePathname()

  // Nav is DERIVED — the catalog in extensions-manifest.ts minus what Settings
  // hides, plus enabled extensions. Settings itself is appended after: it must
  // stay reachable even if every other System entry is hidden.
  const navGroups: NavGroup[] = buildNavGroups({
    multiSurface: isMultiSurface(),
    hiddenSections: hiddenSections ?? [],
    enabledExtensionIds:
      enabledExtensions ??
      EXTENSIONS.filter((extension) => extension.defaultEnabled).map(
        (extension) => extension.id
      ),
  })
  const settingsEntry = {
    id: "settings",
    title: "Settings",
    icon: Settings,
    href: synclair("/settings"),
  }
  const systemGroup = navGroups.find((group) => group.label === "System")
  if (systemGroup) systemGroup.items.push(settingsEntry)
  else navGroups.push({ label: "System", items: [settingsEntry] })

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 group-data-[collapsible=icon]:px-1 hover:bg-sidebar-accent"
          title={`Back to the ${project.name} app`}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            {project.name.charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
            {project.name}{" "}
            <span className="font-normal text-muted-foreground">
              / Synclair
            </span>
          </span>
        </Link>
        {mode && (
          <Badge
            variant="outline"
            className="mx-2 w-fit gap-1 text-2xs font-normal text-muted-foreground group-data-[collapsible=icon]:hidden"
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
              host.attention
                ? "border-warning/40 text-warning"
                : "text-muted-foreground"
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
                  onClick={() =>
                    window.dispatchEvent(new CustomEvent(OPEN_COMMAND_EVENT))
                  }
                  className="text-muted-foreground"
                  tooltip="Search  ⌘K"
                >
                  <Search />
                  Search
                  <kbd className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-3xs leading-none text-muted-foreground">
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
                        (item.also?.some(
                          (p) => pathname === p || pathname.startsWith(`${p}/`)
                        ) ??
                          false)
                      }
                    >
                      <Link href={item.href}>
                        <item.icon />
                        {item.title}
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
              tooltip="Open the Synclair handbook"
              className="h-auto py-2"
            >
              <a href={HANDBOOK_URL} target="_blank" rel="noopener noreferrer">
                <Compass />
                <span className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="flex items-center gap-1 text-sm font-medium">
                    Handbook
                    <ArrowUpRight className="size-3 text-muted-foreground" />
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    What Synclair is &amp; how it works
                  </span>
                </span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {snapshot && (
          <p className="px-2 py-1 text-xs text-muted-foreground">{snapshot}</p>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
