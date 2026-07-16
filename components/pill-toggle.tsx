"use client"

import Link from "next/link"

import { cn } from "@/lib/utils"

/**
 * PillToggle — the one rounded-pill segmented toggle the hub uses for a single
 * facet (Project ↔ Synclair, Origin, Surface, …).
 *
 * This exact pill markup had been copy-pasted, class-string for class-string,
 * across the environment, ai-setup, and knowledge pages — two of them even
 * carried a comment saying "matches the library FilterBar by hand." One
 * component ends that drift. It renders in either mode from the same options:
 *
 *  - **URL mode** — give each option an `href` and it renders `<Link>`s, so a
 *    server component (environment) can drive selection through the URL.
 *  - **State mode** — omit `href` and pass `onValueChange`; it renders
 *    `<button>`s for client-driven selection (ai-setup, knowledge).
 *
 * The active pill is whichever option's `value` equals `value`. Counts ride as
 * a trailing tabular span, never as color alone.
 */
export interface PillOption {
  value: string
  label: string
  /** Optional trailing count (e.g. items in that facet). */
  count?: number
  /** URL-mode only: renders a `<Link>` to this href. */
  href?: string
}

export interface PillToggleProps {
  options: PillOption[]
  /** The currently-active option value. */
  value: string
  /** State-mode only: called with the option value on click. */
  onValueChange?: (value: string) => void
  /** Accessible group label (e.g. "Surface", "Origin"). */
  "aria-label"?: string
  className?: string
}

const pillClass = (isActive: boolean) =>
  cn(
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
    isActive
      ? "border-transparent bg-primary text-primary-foreground"
      : "text-muted-foreground hover:border-foreground/30 hover:text-foreground"
  )

function Count({ value, isActive }: { value: number; isActive: boolean }) {
  return (
    <span className={cn("tabular-nums", isActive ? "opacity-80" : "opacity-70")}>{value}</span>
  )
}

export function PillToggle({
  options,
  value,
  onValueChange,
  className,
  "aria-label": ariaLabel,
}: PillToggleProps) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {options.map((opt) => {
        const isActive = opt.value === value
        const inner = (
          <>
            {opt.label}
            {typeof opt.count === "number" && <Count value={opt.count} isActive={isActive} />}
          </>
        )
        return opt.href ? (
          <Link
            key={opt.value}
            href={opt.href}
            aria-current={isActive ? "true" : undefined}
            className={pillClass(isActive)}
          >
            {inner}
          </Link>
        ) : (
          <button
            key={opt.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onValueChange?.(opt.value)}
            className={pillClass(isActive)}
          >
            {inner}
          </button>
        )
      })}
    </div>
  )
}
