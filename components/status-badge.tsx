import { cva, type VariantProps } from "class-variance-authority"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const statusDotVariants = cva("size-1.5 shrink-0 rounded-full", {
  variants: {
    status: {
      success: "bg-success",
      info: "bg-info",
      warning: "bg-warning",
      neutral: "bg-muted-foreground/40",
    },
  },
  defaultVariants: {
    status: "neutral",
  },
})

export interface StatusBadgeProps
  extends React.ComponentProps<typeof Badge>,
    VariantProps<typeof statusDotVariants> {}

export function StatusBadge({ status, className, children, ...props }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", className)} {...props}>
      <span className={statusDotVariants({ status })} />
      {children}
    </Badge>
  )
}
