import { Search } from "lucide-react"

import { live, scene, type ComponentDoc } from "@/lib/system/doc-types"

const doc: ComponentDoc = {
  intent:
    "One keystroke from anywhere in the hub to anything in the system — components, blocks, templates, skills, agents, and routes share a single search surface. It exists so discoverability never depends on knowing where something lives in the nav; a newly registered item is findable the moment it's registered, with nothing to author.",
  examples: [
    {
      title: "Live",
      description:
        "The real palette over the real search index, rendered open — type to filter every group at once.",
      preview: scene("command-palette", { height: 420 }),
      code: `// app shell — mounted once, opened by ⌘K / Ctrl-K
<CommandPalette items={await getSearchIndex()} />`,
    },
    {
      title: "Trigger",
      description: "Press ⌘K (macOS) or Ctrl-K anywhere in the app.",
      preview: live(
        <div className="bg-card flex w-full max-w-sm items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <Search className="text-muted-foreground size-4" />
          <span className="text-muted-foreground">Search components, blocks, skills…</span>
          <kbd className="bg-muted text-muted-foreground ml-auto rounded px-1.5 py-0.5 font-mono text-xs">
            ⌘K
          </kbd>
        </div>
      ),
      viewports: false,
    },
  ],
  interactions: [
    {
      trigger: "⌘K / Ctrl-K anywhere",
      behavior: "Toggles the dialog; typing filters across all groups at once.",
    },
    {
      trigger: "Click the sidebar Search button",
      behavior: "Dispatches the open-command event; the palette opens.",
    },
    {
      trigger: "Select a result",
      behavior: "Navigates to the entry's route and closes the dialog.",
      keyboard: "↑/↓ then Enter",
    },
    {
      trigger: "Esc",
      behavior: "Closes the dialog without navigating.",
    },
  ],
  states: [
    {
      name: "Empty query",
      description: "Shows all groups in fixed order (Components → Blocks → Templates → Skills → Agents → Pages).",
      preview: live(
        <div className="bg-card text-muted-foreground rounded-md border p-4 text-sm">Grouped index</div>
      ),
    },
    {
      name: "No matches",
      description: "CommandEmpty message; the query stays editable.",
      preview: live(
        <div className="bg-card text-muted-foreground rounded-md border p-4 text-sm">No results found.</div>
      ),
    },
  ],
  responsive: [
    { viewport: "mobile", behavior: "Dialog spans nearly the full width; list scrolls within the dialog." },
    { viewport: "tablet", behavior: "Centered fixed-width dialog." },
    { viewport: "desktop", behavior: "Centered fixed-width dialog; keyboard-first usage assumed." },
  ],
  props: [
    {
      name: "items",
      type: "SearchEntry[]",
      description: "Flat index of everything searchable, built server-side by `getSearchIndex()`.",
    },
  ],
  notes:
    "Mounted once in `app/synclair/(hub)/layout.tsx`. Indexes registry items (components / blocks / templates), skills, agents, and static routes into a single ⌘K search. Results are grouped by kind and navigate on select. The index is passed from a server component; new registered items appear automatically.",
}

export default doc
