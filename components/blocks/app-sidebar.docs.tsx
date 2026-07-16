import { live, scene, type ComponentDoc } from "@/lib/system/doc-types"

/**
 * The AppSidebar IS the app shell, so its example renders the real block via
 * its standalone preview scene (own SidebarProvider, chrome-free route);
 * anatomy is the labeled region map under it.
 */
const doc: ComponentDoc = {
  intent:
    "Synclair's single navigation surface: every route is reachable from here, grouped by altitude (Synclair / Project / Library), with a global search entry point. It exists so no page needs its own navigation and so adding a route is a one-line nav item — never a fork. If a route isn't in the sidebar or ⌘K, it doesn't exist for the reader.",
  anatomy: {
    description: "Brand header, search trigger, grouped nav, a footer 'How it works' link + snapshot.",
    regions: [
      {
        name: "Brand header",
        purpose:
          "Project identity; links back to the Overview. Shows the resolved setup-mode badge (embedded/watcher) when `mode` is passed, and the host-freshness badge (companion mode) when `host` is passed.",
      },
      { name: "Search trigger", purpose: "Opens the global ⌘K command palette." },
      {
        name: "Nav groups",
        purpose:
          "Data-driven groups (Synclair / Project / Library); active state from usePathname(), `also` prefixes keep drill-in pages highlighted.",
      },
      {
        name: "Footer",
        purpose:
          "A persistent 'How it works' link (the Synclair explainer) above optional snapshot/date text passed via props.",
      },
    ],
  },
  examples: [
    {
      title: "Live",
      description:
        "The real sidebar in its own SidebarProvider — brand header, search trigger, nav groups, footer, all live.",
      preview: scene("app-sidebar", { height: 480 }),
      code: `<SidebarProvider>
  <AppSidebar snapshot={updatedLabel} mode={modeBadge} host={hostBadge} />
  <SidebarInset>{children}</SidebarInset>
</SidebarProvider>`,
    },
  ],
  interactions: [
    {
      trigger: "Click a nav item",
      behavior: "Navigates to the route; the item takes the active state.",
      result: "Drill-in child routes keep the parent highlighted via its `also` prefixes.",
    },
    {
      trigger: "Click Search",
      behavior: "Dispatches the open-command event.",
      result: "The global command palette opens.",
      keyboard: "⌘K / Ctrl-K",
    },
    {
      trigger: "Click the rail / trigger in the page header",
      behavior:
        "Collapses the sidebar to an icon-only rail or expands it (shadcn SidebarProvider state, `collapsible=\"icon\"`). Collapsed nav items show their label as a hover tooltip.",
      keyboard: "⌘B / Ctrl-B",
    },
  ],
  states: [
    {
      name: "Active route",
      description: "Exactly one nav item is active, derived from the pathname — never two.",
      preview: live(
        <div className="bg-muted text-muted-foreground rounded-md border p-4 text-sm">
          Active item · muted background + foreground text
        </div>
      ),
    },
    {
      name: "Coming soon",
      description: "Items flagged `soon` render disabled with a badge instead of navigating.",
      preview: live(
        <div className="bg-card text-muted-foreground rounded-md border p-4 text-sm">Item · soon</div>
      ),
    },
  ],
  responsive: [
    { viewport: "mobile", behavior: "Off-canvas: renders as a sheet opened by the page-header trigger." },
    { viewport: "tablet", behavior: "Collapsible to icon rail; content pane takes the width." },
    { viewport: "desktop", behavior: "Expanded by default; collapses to an icon-only rail via the rail or ⌘B." },
  ],
  props: [
    {
      name: "snapshot",
      type: "string",
      description: "Optional footer text (e.g. the snapshot date).",
    },
    {
      name: "mode",
      type: "{ label: string; blurb: string }",
      description:
        "Optional resolved setup mode (embedded/watcher, from `lib/system/setup.ts`). Renders a header badge; omitted when blank/unresolved.",
    },
    {
      name: "host",
      type: "{ label: string; blurb: string; attention: boolean }",
      description:
        "Companion-mode host freshness (from `lib/system/host-status.ts`): commits since intake + uncataloged count. Renders a header badge below the mode badge — amber when `attention` — and is omitted when no host is declared.",
    },
  ],
  notes:
    "Mounted once in `app/synclair/(hub)/layout.tsx` inside `SidebarProvider`. Nav is data-driven from a `navGroups` array (Synclair / System / Library) with active state from `usePathname()`, plus a global ⌘K search trigger. Add a route by adding a nav item — don't fork the block.",
}

export default doc
