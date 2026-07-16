"use client"

import * as React from "react"
import { Check, Eye, FilePenLine, Loader2, MoreHorizontal } from "lucide-react"

import { Markdown } from "@/components/markdown"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { TableCell, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { readSource, saveSource } from "@/lib/system/file-actions"
import type { SourceKind } from "@/lib/system/types"

export interface SourceItem {
  kind: SourceKind
  name: string
  source: string
  /** "foundation" (ships with Synclair) | "project" (this repo's own). */
  layer: "foundation" | "project"
  summary: string
  /** repo-relative path to the .md file */
  file: string
}

type EditorTab = "preview" | "edit"
type Active = { kind: SourceKind; name: string; file: string; tab?: EditorTab }

const OpenCtx = React.createContext<(a: Active) => void>(() => {})

/**
 * A skill/agent table row. Clicking the row opens the editor in Preview; the ⋯ menu
 * lets you jump straight to Preview or Edit for that file.
 */
export function SourceRow({ item }: { item: SourceItem }) {
  const open = React.useContext(OpenCtx)
  const base = { kind: item.kind, name: item.name, file: item.file }
  return (
    <TableRow className="group cursor-pointer" onClick={() => open(base)}>
      <TableCell className="font-mono text-xs font-medium">{item.name}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Badge variant={item.layer === "foundation" ? "secondary" : "outline"}>
            {item.layer === "foundation" ? "Synclair" : "Project"}
          </Badge>
          <span className="text-muted-foreground text-2xs">{item.source}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground whitespace-normal">{item.summary}</TableCell>
      {/* Stop the row's open-in-Preview from also firing when using the menu. */}
      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Actions for ${item.name}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => open({ ...base, tab: "preview" })}>
                <Eye />
                Preview
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => open({ ...base, tab: "edit" })}>
                <FilePenLine />
                Edit
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  )
}

/**
 * Owns the ONE editor sheet for the whole page. Opening a different row swaps the
 * active file rather than stacking a second sheet — so a save can only ever target
 * the file currently shown. Saving requires an explicit confirmation.
 */
export function SourceEditorProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = React.useState<Active | null>(null)
  const [tab, setTab] = React.useState<EditorTab>("preview")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [content, setContent] = React.useState("")
  const [draft, setDraft] = React.useState("")
  const [confirming, setConfirming] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [pending, startSave] = React.useTransition()

  const openSource = React.useCallback((a: Active) => {
    setActive(a)
    setTab(a.tab ?? "preview")
    setContent("")
    setDraft("")
    setError(null)
    setConfirming(false)
    setSaved(false)
    setLoading(true)
    readSource(a.kind, a.name)
      .then((text) => {
        setContent(text)
        setDraft(text)
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load file"))
      .finally(() => setLoading(false))
  }, [])

  const dirty = draft !== content
  const isOpen = active !== null

  function doSave() {
    if (!active) return
    setError(null)
    startSave(async () => {
      try {
        await saveSource(active.kind, active.name, draft)
        setContent(draft)
        setConfirming(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save file")
        setConfirming(false)
      }
    })
  }

  return (
    <OpenCtx.Provider value={openSource}>
      {children}
      <Sheet
        open={isOpen}
        onOpenChange={(o) => {
          if (!o) {
            setActive(null)
            setConfirming(false)
          }
        }}
      >
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
          <SheetHeader className="border-b">
            <SheetTitle className="font-mono text-sm">{active?.name}</SheetTitle>
            <SheetDescription className="font-mono text-xs">{active?.file}</SheetDescription>
          </SheetHeader>

          {loading ? (
            <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : error && !content ? (
            <div className="text-destructive flex-1 p-4 text-sm">{error}</div>
          ) : (
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as EditorTab)}
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
                <TabsList>
                  <TabsTrigger value="preview">
                    <Eye />
                    Preview
                  </TabsTrigger>
                  <TabsTrigger value="edit">
                    <FilePenLine />
                    Edit
                  </TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-2">
                  {error && <span className="text-destructive text-xs">{error}</span>}
                  {saved && (
                    <span className="text-muted-foreground flex items-center gap-1 text-xs">
                      <Check className="size-3.5" /> Saved
                    </span>
                  )}
                  {confirming ? (
                    <>
                      <span className="text-muted-foreground text-xs">Overwrite this file?</span>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={doSave} disabled={pending}>
                        {pending && <Loader2 className="size-3.5 animate-spin" />}
                        Confirm save
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => setConfirming(true)} disabled={!dirty || pending}>
                      Save
                    </Button>
                  )}
                </div>
              </div>

              <TabsContent value="preview" className="min-h-0 flex-1 overflow-y-auto p-5">
                <Markdown>{draft}</Markdown>
              </TabsContent>
              <TabsContent value="edit" className="min-h-0 flex-1 overflow-hidden p-3">
                <Textarea
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value)
                    setConfirming(false)
                  }}
                  spellCheck={false}
                  className="h-full resize-none rounded-md font-mono text-xs leading-relaxed"
                />
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>
    </OpenCtx.Provider>
  )
}
