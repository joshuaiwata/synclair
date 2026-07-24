import type { ComponentDoc } from "./doc-types"

import libraryTierPage from "@/app/synclair/(hub)/(library)/library-tier-page.docs"
import appSidebar from "@/components/blocks/app-sidebar.docs"
import commandPalette from "@/components/blocks/command-palette.docs"
import sourceEditor from "@/components/blocks/source-editor.docs"
import definitionList from "@/components/definition-list.docs"
import hubPage from "@/components/hub-page.docs"
import componentDocView from "@/components/library/component-doc-view.docs"
import dataModelDiagram from "@/components/library/data-model-diagram.docs"
import filterBar from "@/components/library/filter-bar.docs"
import foundationsSections from "@/components/library/foundations.docs"
import libraryExplorer from "@/components/library/library-explorer.docs"
import tierGallery from "@/components/library/tier-gallery.docs"
import markdown from "@/components/markdown.docs"
import pageHeader from "@/components/page-header.docs"
import pillToggle from "@/components/pill-toggle.docs"
import sectionHeader from "@/components/section-header.docs"
import statCard from "@/components/stat-card.docs"
import statGrid from "@/components/stat-grid.docs"
import statusBadge from "@/components/status-badge.docs"
import stepLadder from "@/components/step-ladder.docs"
import summaryShell from "@/components/summary-shell.docs"
import surfaceSwitcher from "@/components/surface-switcher.docs"
import tabsNav from "@/components/tabs-nav.docs"
import viewportFrame from "@/components/viewport-frame.docs"
import wireframeKit from "@/components/wireframe-kit.docs"

/**
 * The doc registry: registry `name` -> its colocated `ComponentDoc`.
 * Add one line here in the same change that adds a `<name>.docs.tsx`.
 * An item missing from this map renders as "no docs yet" on /library.
 *
 * When two registered items share a name across surfaces (a product-surface
 * `page-header` vs the hub skin's), the product one maps under the QUALIFIED
 * key `"<surface>:<name>"` — `getDoc` tries that first. Bare names stay the
 * common case; qualify only on collision (lockstep with check-registry and
 * the UX-doc anchors).
 */
export const docs: Record<string, ComponentDoc> = {
  "status-badge": statusBadge,
  "step-ladder": stepLadder,
  "stat-card": statCard,
  "section-header": sectionHeader,
  "page-header": pageHeader,
  "hub-page": hubPage,
  "pill-toggle": pillToggle,
  "tabs-nav": tabsNav,
  "surface-switcher": surfaceSwitcher,
  "definition-list": definitionList,
  "stat-grid": statGrid,
  "viewport-frame": viewportFrame,
  "wireframe-kit": wireframeKit,
  "app-sidebar": appSidebar,
  "source-editor": sourceEditor,
  "command-palette": commandPalette,
  "markdown": markdown,
  "summary-shell": summaryShell,
  "filter-bar": filterBar,
  "data-model-diagram": dataModelDiagram,
  "library-explorer": libraryExplorer,
  "tier-gallery": tierGallery,
  "component-doc-view": componentDocView,
  "foundations-sections": foundationsSections,
  "library-tier-page": libraryTierPage,
}

export function getDoc(name: string, surface?: string): ComponentDoc | undefined {
  // Surface-qualified key first: when a product-surface item shares a name
  // with another entry, its doc lives under "<surface>:<name>".
  return (surface ? docs[`${surface}:${name}`] : undefined) ?? docs[name]
}
