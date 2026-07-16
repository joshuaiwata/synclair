"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"

import { MoreHorizontal, RefreshCw, Sparkles, X } from "lucide-react"

import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { dequeueDistill, queueDistill } from "@/lib/system/knowledge/distill-actions"
import type { FileDistillStatus } from "@/lib/system/knowledge/distill-status"

/**
 * Per-file distill status + action. The badge stays visible (it's state, not an
 * action); the action itself — Process / Reprocess / Cancel, depending on state —
 * folds into a ⋯ menu so long file tables stay scannable. The AI distillation runs
 * in the figma-frame-reader agent, not the browser; queuing is the ask.
 */
export function DistillControl({
  fileKey,
  fileName,
  status,
}: {
  fileKey: string
  fileName: string
  status: FileDistillStatus
}) {
  const [pending, start] = useTransition()
  const router = useRouter()

  function run(action: () => Promise<void>) {
    start(async () => {
      await action()
      router.refresh()
    })
  }

  const queue = () => run(() => queueDistill(fileKey, fileName))
  const cancel = () => run(() => dequeueDistill(fileKey))

  const stale = status.state === "stale"
  const badge = status.queued ? (
    <StatusBadge status="info">Queued</StatusBadge>
  ) : status.state === "none" ? null : (
    <StatusBadge status={stale ? "warning" : "success"}>
      {stale ? "Changed since distill" : `Distilled · ${status.pages}`}
    </StatusBadge>
  )

  return (
    <div className="flex items-center justify-end gap-2">
      {badge}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Actions for ${fileName}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status.queued ? (
            <DropdownMenuItem disabled={pending} onSelect={cancel}>
              <X />
              Cancel request
            </DropdownMenuItem>
          ) : status.state === "none" ? (
            <DropdownMenuItem disabled={pending} onSelect={queue}>
              <Sparkles />
              Process
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={pending} onSelect={queue}>
              <RefreshCw />
              Reprocess
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
