import type { Metadata } from "next"

import { AppSidebar } from "@/components/blocks/app-sidebar"
import { CommandPalette } from "@/components/blocks/command-palette"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { getLatestCommitDate } from "@/lib/system/git-dates"
import { getHostStatus } from "@/lib/system/host-status"
import { getSearchIndex } from "@/lib/system/search-index"
import { project } from "@/lib/system/seed/project"
import { getSetupMode, SETUP_MODE_META } from "@/lib/system/setup"

export const metadata: Metadata = {
  title: `Synclair — ${project.name}`,
  description:
    "The Synclair hub — design tokens, the component library, AI setup, and project knowledge. Catalogs everything the product app builds.",
}

/**
 * The Synclair shell — the chrome (sidebar + ⌘K palette) that wraps
 * every `/synclair/*` route. This is the hub skin; it lives here (not at the root)
 * so the product app at `/` gets its own chrome instead of inheriting this one.
 */
export default async function SynclairLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [searchIndex, latestCommit, setupMode, hostStatus] = await Promise.all([
    getSearchIndex(),
    getLatestCommitDate(),
    getSetupMode(),
    getHostStatus(),
  ])
  // Live "last updated" from git history — never a hardcoded snapshot date.
  const updatedLabel = latestCommit
    ? `Updated ${new Date(latestCommit).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`
    : "Live"
  // Blank/unresolved (the mother repo) → no badge, chrome byte-for-byte unchanged.
  const modeBadge = setupMode ? SETUP_MODE_META[setupMode] : undefined
  // Companion mode: ambient host freshness — commits since intake + coverage
  // gaps, computed live (host-status.ts). No host → no badge.
  const hostBadge = hostStatus
    ? (() => {
        const commits = hostStatus.commitsSinceIntake
        const gaps = hostStatus.uncatalogedCandidates
        const attention = (commits ?? 0) > 0 || gaps > 0
        const label =
          commits != null && commits > 0
            ? `Host · ${commits} new commit${commits === 1 ? "" : "s"}`
            : gaps > 0
              ? `Host · ${gaps} uncataloged`
              : "Host · current"
        const blurb = [
          `${hostStatus.hostName}: ${hostStatus.catalogedCount} cataloged`,
          commits != null ? `${commits} host commits since intake` : null,
          gaps > 0 ? `${gaps} candidate component files uncataloged` : null,
          attention ? "Refresh via the existing-project-intake skill." : "Catalog is current.",
        ]
          .filter(Boolean)
          .join(" · ")
        return { label, blurb, attention }
      })()
    : undefined
  return (
    <SidebarProvider>
      <AppSidebar snapshot={updatedLabel} mode={modeBadge} host={hostBadge} />
      <SidebarInset>{children}</SidebarInset>
      <CommandPalette items={searchIndex} />
    </SidebarProvider>
  )
}
