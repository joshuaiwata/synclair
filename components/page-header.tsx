import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export interface PageHeaderProps {
  /** A plain string is rendered as a muted context label — the page's real
   *  `<h1>` lives in the body (`PageTitle`). A node (e.g. a breadcrumb trail)
   *  is rendered as-is in the title slot. */
  title: React.ReactNode
  className?: string
  /** Right-aligned slot for path text, status, or actions. */
  children?: React.ReactNode
}

export function PageHeader({ title, className, children }: PageHeaderProps) {
  return (
    <header
      className={cn("flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4", className)}
    >
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 !h-4 !self-center" />
      {typeof title === "string" ? (
        <span className="text-muted-foreground text-sm font-medium">{title}</span>
      ) : (
        title
      )}
      {children && <div className="ml-auto flex items-center gap-3">{children}</div>}
    </header>
  )
}
