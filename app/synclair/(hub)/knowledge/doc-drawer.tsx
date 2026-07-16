"use client"

import { useEffect, useState } from "react"

import { ExternalLink, FileText } from "lucide-react"

import { Markdown } from "@/components/markdown"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { readKnowledgeDoc } from "@/lib/system/knowledge/doc-actions"
import { isExternalUrl, resolveInAppDoc } from "@/lib/system/knowledge/in-app-doc"
import type { KnowledgeSource } from "@/lib/system/knowledge/types"

/**
 * Reads an in-repo digest in a large right-side drawer. Opened by clicking a
 * distilled row in the sources table — no new tab. `source` null = closed.
 */
export function KnowledgeDocDrawer({
  source,
  onClose,
}: {
  source: KnowledgeSource | null
  onClose: () => void
}) {
  const doc = source ? resolveInAppDoc(source) : null
  const ref = doc?.ref ?? null
  // The loaded result remembers which doc it belongs to; a result for a
  // different ref is treated as "still loading" instead of being reset in the
  // effect (avoids setState-in-effect cascades).
  const [loaded, setLoaded] = useState<{
    ref: string
    content: string | null
    error: string | null
  } | null>(null)

  useEffect(() => {
    if (!ref) return
    let cancelled = false
    readKnowledgeDoc(ref)
      .then((c) => !cancelled && setLoaded({ ref, content: c, error: null }))
      .catch(
        (e) =>
          !cancelled &&
          setLoaded({ ref, content: null, error: e?.message ?? "Failed to load digest" })
      )
    return () => {
      cancelled = true
    }
  }, [ref])

  const current = loaded && ref && loaded.ref === ref ? loaded : null
  const content = current?.content ?? null
  const error = current?.error ?? null

  return (
    <Sheet open={!!source} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 data-[side=right]:sm:max-w-3xl"
      >
        <SheetHeader className="border-b">
          <div className="flex items-center gap-2 pr-8">
            <FileText className="text-muted-foreground size-4 shrink-0" />
            <SheetTitle className="truncate">{source?.title}</SheetTitle>
          </div>
          <SheetDescription className="truncate font-mono text-xs">
            {doc?.path}
          </SheetDescription>
          {source?.url && (
            <a
              href={source.url}
              target={isExternalUrl(source.url) ? "_blank" : undefined}
              rel="noreferrer"
              className="text-primary mt-1 inline-flex w-fit items-center gap-1 text-xs underline underline-offset-2"
            >
              <ExternalLink className="size-3" />
              {isExternalUrl(source.url) ? "Open raw source" : "Open full view"}
            </a>
          )}
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-5">
            {error ? (
              <p className="text-warning text-sm">{error}</p>
            ) : content === null ? (
              <p className="text-muted-foreground text-sm">Loading digest…</p>
            ) : (
              <Markdown>{content}</Markdown>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
