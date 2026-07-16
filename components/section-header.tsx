import { cn } from "@/lib/utils"

export interface SectionHeaderProps {
  title: string
  hint?: string
  className?: string
  children?: React.ReactNode
}

export function SectionHeader({ title, hint, className, children }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <h2 className="text-sm font-medium">
        {title}
        {hint && (
          <span className="text-muted-foreground ml-2 font-mono text-xs font-normal">{hint}</span>
        )}
      </h2>
      {children}
    </div>
  )
}
