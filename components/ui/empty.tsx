import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * The one empty-state pattern for the whole hub. Every "no data yet" screen uses
 * this — a dashed panel, an icon chip, a title, and a description that EDUCATES
 * how the surface populates (which skill/agent fills it, or what the user does).
 * Sized to the hub's dense voice rather than shadcn's marketing defaults so an
 * empty state reads as part of the same system as the section headers around it.
 *
 * <Empty>
 *   <EmptyHeader>
 *     <EmptyMedia variant="icon"><SomeIcon /></EmptyMedia>
 *     <EmptyTitle>No system map yet</EmptyTitle>
 *     <EmptyDescription>Run the codebase-map skill to generate it.</EmptyDescription>
 *   </EmptyHeader>
 *   <EmptyContent> ...optional action... </EmptyContent>
 * </Empty>
 */
function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8 text-center text-balance",
        className
      )}
      {...props}
    />
  )
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn("flex max-w-md flex-col items-center gap-1.5", className)}
      {...props}
    />
  )
}

const emptyMediaVariants = cva(
  "mb-1 flex shrink-0 items-center justify-center [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "text-muted-foreground bg-muted flex size-10 items-center justify-center rounded-lg",
        warning:
          "text-warning bg-warning/10 flex size-10 items-center justify-center rounded-lg",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function EmptyMedia({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      data-slot="empty-media"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  )
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    />
  )
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "text-muted-foreground text-sm/relaxed [&_a]:underline [&_a]:underline-offset-2 [&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs",
        className
      )}
      {...props}
    />
  )
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "flex w-full max-w-md min-w-0 flex-col items-center gap-3 text-sm text-balance",
        className
      )}
      {...props}
    />
  )
}

export {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
}
