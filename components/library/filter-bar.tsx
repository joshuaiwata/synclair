import { PillToggle } from "@/components/pill-toggle"

export interface FilterOption {
  /** Query-string value; "all" means "param absent". */
  value: string
  label: string
  count: number
}

export interface FilterGroup {
  /** Query param this group controls, e.g. "origin". */
  param: string
  label: string
  options: FilterOption[]
}

/**
 * URL-driven facet chips for the library galleries (origin, usage). Server-
 * rendered: each chip is a link that toggles its param while preserving the
 * others, so filtered views are shareable and need no client state. The pills
 * themselves are `PillToggle` in URL mode — one component owns the pill look.
 */
export function FilterBar({
  basePath,
  groups,
  active,
  preserve = {},
}: {
  basePath: string
  groups: FilterGroup[]
  active: Record<string, string>
  /** Params outside these groups to keep on every chip href (e.g. the surface scope). */
  preserve?: Record<string, string | undefined>
}) {
  const href = (param: string, value: string) => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(preserve)) {
      if (v && v !== "all") params.set(k, v)
    }
    for (const g of groups) {
      const v = g.param === param ? value : (active[g.param] ?? "all")
      if (v !== "all") params.set(g.param, v)
    }
    const qs = params.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {groups.map((group) => (
        <div key={group.param} className="flex items-center gap-1.5">
          <span className="text-muted-foreground mr-1 text-xs">{group.label}</span>
          <PillToggle
            aria-label={group.label}
            value={active[group.param] ?? "all"}
            options={group.options.map((opt) => ({
              value: opt.value,
              label: opt.label,
              count: opt.count,
              href: href(group.param, opt.value),
            }))}
          />
        </div>
      ))}
    </div>
  )
}
