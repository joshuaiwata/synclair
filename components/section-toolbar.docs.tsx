"use client"

import * as React from "react"
import { LayoutGrid, LayoutList } from "lucide-react"

import { live, type ComponentDoc } from "@/lib/system/doc-types"
import { SectionToolbar } from "@/components/section-toolbar"
import { Tabs, TabsContent } from "@/components/ui/tabs"

function ComboDemo() {
  const [query, setQuery] = React.useState("")
  const [view, setView] = React.useState("table")
  return (
    <Tabs defaultValue="all" className="w-full gap-4">
      <SectionToolbar
        tabs={[
          { value: "all", label: "All", count: 12 },
          { value: "one", label: "Group A", count: 8 },
          { value: "two", label: "Group B", count: 4 },
        ]}
        search={{ value: query, onValueChange: setQuery, placeholder: "Search items…" }}
        views={{
          options: [
            { value: "table", label: "Table view", icon: LayoutList },
            { value: "cards", label: "Card view", icon: LayoutGrid },
          ],
          value: view,
          onValueChange: setView,
        }}
      />
      {["all", "one", "two"].map((v) => (
        <TabsContent key={v} value={v}>
          <div className="text-muted-foreground bg-background rounded-lg border border-dashed p-6 text-xs">
            {v} panel — {view} view{query && ` · filtered by "${query}"`}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  )
}

function TabsSearchDemo() {
  const [query, setQuery] = React.useState("")
  return (
    <Tabs defaultValue="sitemap" className="w-full gap-4">
      <SectionToolbar
        tabs={[
          { value: "sitemap", label: "Sitemap" },
          { value: "gallery", label: "Gallery", count: 52 },
        ]}
        search={{ value: query, onValueChange: setQuery, placeholder: "Search pages…" }}
      />
      <TabsContent value="sitemap">
        <div className="text-muted-foreground bg-background rounded-lg border border-dashed p-6 text-xs">
          sitemap panel
        </div>
      </TabsContent>
      <TabsContent value="gallery">
        <div className="text-muted-foreground bg-background rounded-lg border border-dashed p-6 text-xs">
          gallery panel
        </div>
      </TabsContent>
    </Tabs>
  )
}

const doc: ComponentDoc = {
  intent:
    "One toolbar for every tabbed section: a tab strip on the left; search, extra actions, and an icon view-switcher on the right — composed by variants so 'tabs with tools beside them' has one rhythm hub-wide. Knowledge runs the full combo (tabs + search + views + an archived toggle); Pages runs tabs + search. Renders a TabsList, so it must sit inside a <Tabs> root — the host section keeps owning tab state and panels.",
  examples: [
    {
      title: "Full combo",
      description: "Tabs with counts, inline search (Escape clears), and a table/cards view switcher.",
      code: `<Tabs defaultValue="all">
  <SectionToolbar
    tabs={[{ value: "all", label: "All", count: 12 }, …]}
    search={{ value, onValueChange, placeholder: "Search items…" }}
    views={{ options: [{ value: "table", icon: LayoutList, … }], value, onValueChange }}
  />
  <TabsContent value="all">…</TabsContent>
</Tabs>`,
      preview: live(<ComboDemo />),
      viewports: false,
    },
    {
      title: "Tabs + search",
      description: "The Pages variant — no view switcher, counts only where they say something.",
      preview: live(<TabsSearchDemo />),
      viewports: false,
    },
  ],
  interactions: [
    {
      trigger: "Click a tab",
      behavior: "Standard Radix tabs — the host section's TabsContent switches.",
    },
    {
      trigger: "Type in the search",
      behavior: "Controlled by the host — it filters its own rows/tree.",
      keyboard: "Escape clears",
    },
    {
      trigger: "Click a view icon",
      behavior: "Display preference (table/cards, list/grid) — never a filter.",
    },
  ],
  responsive: [
    { viewport: "mobile", behavior: "The bar wraps — tools drop below the tab strip." },
    { viewport: "desktop", behavior: "Single row: tabs left, tools right." },
  ],
  props: [
    { name: "tabs", type: "ToolbarTab[]", description: "Tab triggers ({ value, label, count? }), rendered as a TabsList." },
    {
      name: "search",
      type: "{ value, onValueChange, placeholder?, label? }",
      description: "Optional controlled inline filter; Escape clears.",
    },
    {
      name: "views",
      type: "{ options: ToolbarView[], value, onValueChange }",
      description: "Optional icon view-switcher ({ value, label, icon } per option).",
    },
    { name: "children", type: "ReactNode", description: "Extra right-side actions, between search and the view switcher." },
  ],
  notes:
    "Must render inside a <Tabs> root — the toolbar owns only the strip and the tools, never tab state or panels. Search filters ROWS in the host; keep the tab set stable while filtering so the active tab can't vanish (the Knowledge pattern).",
}

export default doc
