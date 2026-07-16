"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import type { SearchEntry, SearchGroup } from "@/lib/system/search-index"

/** Fired by the sidebar "Search" button (or anywhere) to open the palette. */
export const OPEN_COMMAND_EVENT = "synclair:open-command"

const GROUP_ORDER: SearchGroup[] = [
  "Components",
  "Blocks",
  "Templates",
  "Skills",
  "Agents",
  "Pages",
]

export function CommandPalette({
  items,
  defaultOpen = false,
}: {
  items: SearchEntry[]
  /** Render already open — used by the standalone preview scene, where there is no page to ⌘K from. */
  defaultOpen?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(defaultOpen)

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    function onOpen() {
      setOpen(true)
    }
    document.addEventListener("keydown", onKey)
    window.addEventListener(OPEN_COMMAND_EVENT, onOpen)
    return () => {
      document.removeEventListener("keydown", onKey)
      window.removeEventListener(OPEN_COMMAND_EVENT, onOpen)
    }
  }, [])

  const grouped = React.useMemo(() => {
    const map = new Map<SearchGroup, SearchEntry[]>()
    for (const item of items) {
      const list = map.get(item.group) ?? []
      list.push(item)
      map.set(item.group, list)
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, entries: map.get(g)! }))
  }, [items])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search"
      description="Search components, blocks, templates, skills, agents, and pages."
    >
      <Command
        // Fold keywords into cmdk's matcher so a search hits categories/deps too.
        filter={(value, search, keywords) => {
          const haystack = `${value} ${(keywords ?? []).join(" ")}`.toLowerCase()
          return haystack.includes(search.toLowerCase()) ? 1 : 0
        }}
      >
        <CommandInput placeholder="Search the system…" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          {grouped.map(({ group, entries }) => (
            <CommandGroup key={group} heading={group}>
              {entries.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.label} ${item.id}`}
                  keywords={item.keywords}
                  onSelect={() => go(item.href)}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="text-sm">{item.label}</span>
                  {item.sublabel && (
                    <span className="text-muted-foreground line-clamp-1 text-xs">
                      {item.sublabel}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
