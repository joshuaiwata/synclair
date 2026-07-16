import type { ReactNode } from "react"

import { AppSidebar } from "@/components/blocks/app-sidebar"
import { CommandPalette } from "@/components/blocks/command-palette"
import { SourceEditorProvider, SourceRow } from "@/components/blocks/source-editor"
import { ComponentDocView } from "@/components/library/component-doc-view"
import { ColorsFoundation, TypographyFoundation } from "@/components/library/foundations"
import { LibraryExplorer } from "@/components/library/library-explorer"
import { TierGallery } from "@/components/library/tier-gallery"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Table, TableBody } from "@/components/ui/table"
import { getCatalog, isFoundationVisible } from "@/lib/system/components"
import { buildLibraryTree } from "@/lib/system/library-tree"
import { getSearchIndex } from "@/lib/system/search-index"
import { getSkills } from "@/lib/system/skills"

/**
 * Preview scenes — the REAL composition each self-referential block renders
 * standalone at `/synclair/preview/<name>` (a chrome-free route outside the
 * `(hub)` group), embedded on its doc page via the `scene()` preview helper.
 *
 * A block lands here when it can't mount a second time inside the hub chrome —
 * it IS the chrome (app-sidebar, library-explorer), it renders the page you'd
 * document it on (tier-gallery, component-doc-view), or it needs page-level
 * providers (source-editor). The scene composes the block exactly as the app
 * does — real data, real providers, no mocks — so the doc page shows rendered
 * truth, not a wireframe stand-in.
 *
 * Register a scene in the same change that calls `scene("<name>")` in a docs
 * module; `check:previews` verifies the pairing in both directions.
 */
export const previewScenes: Record<string, () => Promise<ReactNode> | ReactNode> = {
  /** The app shell's real sidebar in its own SidebarProvider, beside a stub inset. */
  "app-sidebar": () => (
    <SidebarProvider>
      <AppSidebar snapshot="Live preview" />
      <SidebarInset>
        <div className="text-muted-foreground p-6 text-sm">
          The routed page renders here.
        </div>
      </SidebarInset>
    </SidebarProvider>
  ),

  /** The real ⌘K palette over the real search index, opened on mount. */
  "command-palette": async () => (
    <CommandPalette items={await getSearchIndex()} defaultOpen />
  ),

  /** Real skill rows wired to the real read/save server actions. */
  "source-editor": async () => {
    const skills = (await getSkills()).slice(0, 5)
    return (
      <div className="p-4">
        <SourceEditorProvider>
          <Table>
            <TableBody>
              {skills.map((s) => (
                <SourceRow
                  key={s.name}
                  item={{
                    kind: "skill",
                    name: s.name,
                    source: s.source,
                    layer: s.layer,
                    summary: s.summary,
                    file: s.file,
                  }}
                />
              ))}
            </TableBody>
          </Table>
        </SourceEditorProvider>
      </div>
    )
  },

  /** The two-pane library shell over the real catalog tree. */
  "library-explorer": async () => {
    const [catalog, foundationVisible] = await Promise.all([
      getCatalog(),
      isFoundationVisible(),
    ])
    const tree = buildLibraryTree(catalog, foundationVisible)
    return (
      <LibraryExplorer tree={tree}>
        <div className="text-muted-foreground p-6 text-sm">
          The routed library page renders here.
        </div>
      </LibraryExplorer>
    )
  },

  /** The real components gallery — live catalog, live thumbs. */
  "tier-gallery": () => (
    <div className="p-6">
      <TierGallery kind="component" />
    </div>
  ),

  /** The doc view rendering a real item's page (stat-card). */
  "component-doc-view": () => (
    <ComponentDocView name="stat-card" expectedKind="component" />
  ),

  /** Two real foundation sections rendered from the live token source. */
  "foundations-sections": () => (
    <div className="flex flex-col gap-10 p-6">
      <ColorsFoundation />
      <TypographyFoundation />
    </div>
  ),
}

export function getPreviewScene(name: string) {
  return previewScenes[name]
}
