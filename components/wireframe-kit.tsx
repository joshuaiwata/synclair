import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Wireframe primitives for anatomy documentation — the standardized vocabulary
 * every doc's skeleton wireframe is built from, so wireframes read the same
 * across the whole library (and stay theme-aware, diffable, and buildable by
 * agents — never Figma image exports).
 *
 * The visual grammar, used consistently:
 * - DASHED border  = placeholder / grouping layer (content that isn't the point)
 * - SOLID border   = real chrome (structure that exists in the actual UI)
 * - PRIMARY tint   = the FOCAL element the current doc section is about
 */

/** A labeled structural region — the outermost unit of a wireframe. */
export function WireframeFrame({
  label,
  focal = false,
  solid = false,
  className,
  children,
}: {
  /** Uppercase region label, e.g. "LETTERHEAD", "FILTER RAIL". */
  label?: string
  /** Marks this region as the one the section documents (primary tint). */
  focal?: boolean
  /** Solid border = real chrome rather than placeholder grouping. */
  solid?: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border p-3",
        solid ? "border-border" : "border-border border-dashed",
        focal && "border-primary/40 bg-primary/5",
        className
      )}
    >
      {label && (
        <span
          className={cn(
            "text-3xs font-medium tracking-wide uppercase",
            focal ? "text-primary" : "text-muted-foreground"
          )}
        >
          {label}
        </span>
      )}
      {children}
    </div>
  )
}

/** A greyscale content placeholder ("something goes here, content irrelevant"). */
export function WireframeBlock({
  label = "Content area",
  className,
  children,
}: {
  label?: string
  className?: string
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        "text-muted-foreground flex min-h-10 items-center justify-center rounded-md border border-dashed p-3",
        className
      )}
    >
      {children ?? <span className="text-2xs">{label}</span>}
    </div>
  )
}

/** A skeleton text/line bar. Size via className (w-24, h-2, …). */
export function SkeletonBar({ className }: { className?: string }) {
  return <span className={cn("bg-muted-foreground/15 block h-2 rounded", className)} />
}

/** A row of skeleton bars — quick list/table scaffolding. */
export function SkeletonRow({
  widths = ["w-1/3", "w-1/4", "w-1/6"],
  className,
}: {
  widths?: string[]
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {widths.map((w, i) => (
        <SkeletonBar key={i} className={w} />
      ))}
    </div>
  )
}
