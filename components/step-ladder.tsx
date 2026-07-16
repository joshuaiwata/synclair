import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const stepLadderVariants = cva("", {
  variants: {
    orientation: {
      vertical: "flex flex-col divide-y rounded-lg border",
      horizontal: "grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-flow-col sm:auto-cols-fr",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
})

export interface StepLadderProps extends VariantProps<typeof stepLadderVariants> {
  items: { title: string; detail: string }[]
  className?: string
}

export function StepLadder({ items, orientation, className }: StepLadderProps) {
  const horizontal = orientation === "horizontal"
  return (
    <ol className={cn(stepLadderVariants({ orientation }), className)}>
      {items.map((item, i) => (
        <li
          key={item.title}
          className={cn(
            horizontal ? "bg-card flex flex-col gap-1 p-4" : "flex items-baseline gap-4 px-4 py-3"
          )}
        >
          <span
            className={cn(
              "bg-secondary text-secondary-foreground flex size-5.5 shrink-0 items-center justify-center rounded-md font-mono text-xs font-medium",
              !horizontal && "translate-y-0.5"
            )}
          >
            {i + 1}
          </span>
          <span className={cn("text-sm font-medium", !horizontal && "min-w-28")}>{item.title}</span>
          <span className="text-muted-foreground text-sm">{item.detail}</span>
        </li>
      ))}
    </ol>
  )
}
