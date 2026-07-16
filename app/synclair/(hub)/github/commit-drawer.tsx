"use client"

import { useEffect, useState } from "react"

import { ExternalLink, GitCommitHorizontal } from "lucide-react"

import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { readCommit, type CommitDetail } from "@/lib/system/git-actions"
import type { CommitSummary } from "@/lib/system/git-log"

/** Tint one diff line by its first characters — enough to read a patch comfortably. */
function diffLineClass(line: string): string {
  if (line.startsWith("diff --git")) return "text-foreground mt-4 font-semibold first:mt-0"
  if (line.startsWith("@@")) return "text-info mt-2"
  if (line.startsWith("+++") || line.startsWith("---")) return "text-muted-foreground"
  if (line.startsWith("+")) return "text-success"
  if (line.startsWith("-")) return "text-destructive"
  return "text-muted-foreground"
}

/**
 * Reads one commit (message, stat, diff) in a large right-side drawer. Opened
 * by clicking a row in the commits table — no new tab. `commit` null = closed.
 */
export function CommitDrawer({
  commit,
  webUrl,
  onClose,
}: {
  commit: CommitSummary | null
  webUrl: string | null
  onClose: () => void
}) {
  const hash = commit?.hash ?? null
  // The loaded result remembers which commit it belongs to; a result for a
  // different hash is treated as "still loading" instead of being reset in the
  // effect (same pattern as the knowledge doc drawer).
  const [loaded, setLoaded] = useState<{
    hash: string
    detail: CommitDetail | null
    error: string | null
  } | null>(null)

  useEffect(() => {
    if (!hash) return
    let cancelled = false
    readCommit(hash)
      .then((d) => !cancelled && setLoaded({ hash, detail: d, error: null }))
      .catch(
        (e) =>
          !cancelled &&
          setLoaded({ hash, detail: null, error: e?.message ?? "Failed to load commit" })
      )
    return () => {
      cancelled = true
    }
  }, [hash])

  const current = loaded && hash && loaded.hash === hash ? loaded : null
  const detail = current?.detail ?? null
  const error = current?.error ?? null

  return (
    <Sheet open={!!commit} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 data-[side=right]:sm:max-w-3xl"
      >
        <SheetHeader className="border-b">
          <div className="flex items-center gap-2 pr-8">
            <GitCommitHorizontal className="text-muted-foreground size-4 shrink-0" />
            <SheetTitle className="truncate">{commit?.subject}</SheetTitle>
          </div>
          <SheetDescription className="truncate font-mono text-xs">
            {commit?.shortHash} · {commit?.author} · {commit?.relativeDate}
          </SheetDescription>
          {webUrl && commit && !commit.unpushed && (
            <a
              href={`${webUrl}/commit/${commit.hash}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary mt-1 inline-flex w-fit items-center gap-1 text-xs underline underline-offset-2"
            >
              <ExternalLink className="size-3" />
              Open on GitHub
            </a>
          )}
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-4">
            {error ? (
              <p className="text-warning text-sm">{error}</p>
            ) : detail === null ? (
              <p className="text-muted-foreground text-sm">Loading commit…</p>
            ) : (
              <>
                {detail.body && (
                  <p className="text-sm whitespace-pre-wrap">{detail.body}</p>
                )}
                <pre className="bg-muted/40 overflow-x-auto rounded-md border p-3 font-mono text-xs leading-relaxed">
                  {detail.stat}
                </pre>
                <div className="overflow-x-auto rounded-md border p-3">
                  <pre className="font-mono text-xs leading-relaxed">
                    {detail.patch.split("\n").map((line, i) => (
                      <div key={i} className={diffLineClass(line)}>
                        {line || " "}
                      </div>
                    ))}
                  </pre>
                  {detail.truncated && (
                    <p className="text-warning mt-2 text-xs">
                      Diff truncated — open the commit on GitHub (or in a terminal) for
                      the full patch.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
