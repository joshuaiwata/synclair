"use client"

import * as React from "react"
import { Check, Copy } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A single palette swatch — a generous color block over its name + hex. Click
 * to copy the hex. Rendered on the Foundations color page; the `bg` is the
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
      className="group focus-visible:ring-ring flex flex-col gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <span
        className={cn(
          "relative flex h-16 w-full items-end justify-end overflow-hidden rounded-lg p-1.5 ring-1 ring-black/10 ring-inset transition-transform group-hover:-translate-y-0.5 group-active:translate-y-0",
          bg
        )}
      >
        <span className="rounded-md bg-white/85 p-1 text-black opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100">
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </span>
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-foreground truncate text-2xs font-medium">{name}</span>
        <code className="text-muted-foreground text-2xs">{copied ? "Copied!" : value}</code>
      </span>
    </button>
  )
}
