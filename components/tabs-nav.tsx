import Link from "next/link"

import { cn } from "@/lib/utils"

/**
 * TabsNav — URL-driven page-view tabs. Renders the exact visual language of
 * the shadcn `TabsList` (muted rail, raised active chip) but as `<Link>`s, so a
 * server component can switch views through the URL and every view stays
 * deep-linkable.
 *
 * The hub's tab rule: **content switching gets tab chrome** — `Tabs` when the
 * switch is client state, `TabsNav` when it's a URL param — and **filtering
 * gets `PillToggle`**. Before this component, URL-driven view switches
 * borrowed the pill look (environment), so the same "switch what this page
 * shows" action wore two different skins.
 */
export interface TabsNavOption {
  value: string
  label: string
  href: string
  /** Optional trailing count (e.g. items behind that view). */
  count?: number
}

export interface TabsNavProps {
  options: TabsNavOption[]
  /** The currently-active option value. */
  value: string
  /** Accessible nav label (e.g. "Environment view"). */
  "aria-label"?: string
  className?: string
}

export function TabsNav({ options, value, className, "aria-label": ariaLabel }: TabsNavProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-8 w-fit items-center justify-center rounded-lg p-0.5",
        className
      )}
    >
      {options.map((opt) => {
        const isActive = opt.value === value
        return (
          <Link
            key={opt.value}
            href={opt.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-full items-center justify-center gap-1.5 rounded-md border border-transparent px-2.5 text-sm font-medium whitespace-nowrap transition-all",
              isActive
                ? "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30"
                : "text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
            )}
          >
            {opt.label}
            {typeof opt.count === "number" && (
              <span className="text-muted-foreground text-xs tabular-nums">{opt.count}</span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
