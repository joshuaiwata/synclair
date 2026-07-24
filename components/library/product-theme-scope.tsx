
/** Registry-exempt (infra): the scoped product-theme wrapper for host previews (rendering-parity contract) — plumbing for the preview pipeline, never product UI. */
import { cn } from "@/lib/utils"

/**
 * ProductThemeScope — FOUNDATION helper (companion mode).
 *
 * In existing-project/companion mode the Synclair hub stays neutral, but a
 * component ported from the host product consumes the theme tokens (`--primary`,
 * `--card`, `--brand-*`, …) and would render in the hub's palette. This wrapper
 * applies a SCOPED product-theme class (defined once in `app/globals.css` as
 * `.theme-<product> { --primary: …; --brand-*: … }`) around a preview, so the
 * component resolves the product's real tokens ONLY inside this subtree — the
 * hub's own `:root`/chrome are never touched (never mix surfaces).
 *
 * Generic on purpose: pass the scope class via `theme`. Projects add a thin
 * wrapper that fixes their class (see `acme-scope.tsx`). Used only in
 * `*.docs.tsx` previews, never in hub UI. See the `port-host-component` skill.
 */
export function ProductThemeScope({
  theme,
  className,
  children,
}: {
  /** The scoped theme class from globals.css, e.g. "theme-acme". */
  theme: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        theme,
        // w-full/min-w-0: a definite width, never content-sized — a preview
        // that clips itself (a marquee's overflow-hidden) needs a real box,
        // else its box grows to its track and "clips" nothing.
        "flex w-full min-w-0 flex-wrap items-center justify-center gap-2 rounded-md bg-background p-5 text-foreground",
        className
      )}
    >
      {children}
    </div>
  )
}
