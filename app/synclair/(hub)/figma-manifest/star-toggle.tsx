"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"

import { Star } from "lucide-react"

import { toggleStar } from "@/lib/figma/star-actions"
import { cn } from "@/lib/utils"

/** A favorite toggle for a Figma file; starred files pin into the Favorites group. */
export function StarToggle({ fileKey, starred }: { fileKey: string; starred: boolean }) {
  const [pending, start] = useTransition()
  const router = useRouter()

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={starred ? "Unstar file" : "Star file"}
      aria-pressed={starred}
      onClick={() =>
        start(async () => {
          await toggleStar(fileKey)
          router.refresh()
        })
      }
      className={cn(
        "shrink-0 cursor-pointer rounded p-0.5 transition-colors disabled:opacity-50",
        starred
          ? "text-warning"
          : "text-muted-foreground/30 hover:text-muted-foreground"
      )}
    >
      <Star className={cn("size-4", starred && "fill-current")} />
    </button>
  )
}
