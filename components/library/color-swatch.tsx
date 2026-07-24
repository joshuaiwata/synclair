"use client"

import * as React from "react"
import { Check, Copy } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A single palette swatch — a compact color chip over its name + hex. Click to
 * copy the hex. Rendered on the Foundations color page; the `bg` is the
 * token's own `bg-[#hex]` class so the swatch is self-contained data and never
 * restyles the hub. A hairline inset ring keeps pale swatches legible on white.
 */
export function ColorSwatch({
  name,
  value,
  usage,
  bg,
}: {
  name: string
  value: string
  usage?: string
  bg: string
}) {
  const [copied, setCopied] = React.useState(false)

  const copy = () => {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      },
      () => {}
    )
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={usage ? `${name} · ${value}\n${usage}` : `${name} · ${value}`}
      className="group focus-visible:ring-ring flex flex-col gap-1.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <span
        className={cn(
          "relative flex h-10 w-full items-end justify-end overflow-hidden rounded-md p-1 ring-1 ring-black/10 ring-inset transition-transform group-hover:-translate-y-0.5 group-active:translate-y-0",
          bg
        )}
      >
        <span className="rounded bg-white/85 p-0.5 text-black opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100">
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </span>
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-foreground truncate text-2xs font-medium">{name}</span>
        <code className="text-muted-foreground text-3xs">{copied ? "Copied!" : value}</code>
      </span>
    </button>
  )
}

/**
 * A color RAMP as one continuous strip — the Storybook/Radix-style rendering
 * for step-scaled palettes (50…950). Each cell copies its hex on click and
 * reveals the value on hover; step labels ride underneath. One row instead of
 * a wall of cards, so an 11-step brand ramp reads at a glance.
 */
export function RampStrip({
  tokens,
}: {
  tokens: { name: string; value: string; bg: string; usage?: string }[]
}) {
  const [copied, setCopied] = React.useState<string | null>(null)

  const copy = (name: string, value: string) => {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(name)
        window.setTimeout(() => setCopied(null), 1200)
      },
      () => {}
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex overflow-hidden rounded-lg ring-1 ring-black/10">
        {tokens.map((t) => (
          <button
            key={t.name}
            type="button"
            onClick={() => copy(t.name, t.value)}
            title={t.usage ? `${t.name} · ${t.value}\n${t.usage}` : `${t.name} · ${t.value}`}
            className={cn(
              "group focus-visible:ring-ring flex h-14 min-w-0 flex-1 items-end justify-center p-1 outline-none focus-visible:ring-2 focus-visible:ring-inset",
              t.bg
            )}
          >
            <span className="rounded bg-white/85 px-1 font-mono text-3xs text-black opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
              {copied === t.name ? "✓" : t.value}
            </span>
          </button>
        ))}
      </div>
      <div className="flex">
        {tokens.map((t) => (
          <span
            key={t.name}
            className="text-muted-foreground min-w-0 flex-1 text-center font-mono text-3xs"
          >
            {t.name.split("-").pop()}
          </span>
        ))}
      </div>
    </div>
  )
}
