import type { LucideIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface StatCardProps {
  value: string
  label: string
  icon?: LucideIcon
  className?: string
}

export function StatCard({ value, label, icon: Icon, className }: StatCardProps) {
  return (
    <Card className={cn("py-4", className)}>
      <CardContent className="flex items-center gap-3 px-4">
        {Icon && (
          <div className="bg-secondary text-secondary-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
            <Icon className="size-4" />
          </div>
        )}
        <div className="flex min-w-0 flex-col">
          <span className="text-xl leading-tight font-semibold tracking-tight">{value}</span>
          <span className="text-muted-foreground truncate text-xs">{label}</span>
        </div>
      </CardContent>
    </Card>
  )
}
