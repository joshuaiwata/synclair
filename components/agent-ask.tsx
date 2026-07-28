"use client"

import * as React from "react"

import { Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * The hub's HAND-OFF affordance: a control for work only an agent can do.
 *
 * Synclair's content — summaries, reports, manifests, catalogs — is written by
 * agents running skills, not by this UI. A button that *looks* like it does the
 * work (a create form, a Refresh that syncs) teaches the wrong model and leaves
 * the user waiting on something that never happens here. So the trigger opens
 * the instruction instead: the exact prompt to hand your agent, one click to
 * copy, and a note naming the skill that runs it. The UI stays honest about
 * where the work happens, and stays useful by telling you how to start it.
 */
export interface AgentAskProps {
  /** Trigger label — the action in the user's words, e.g. "New", "Refresh". */
  label: string
  /** Optional leading icon for the trigger. */
  icon?: React.ReactNode
  /** Popover heading — what the agent will produce. */
  title: string
  /** The prompt handed to the agent. Shown verbatim, copied verbatim. */
  prompt: string
  /** One line of context — the skill that runs it, where the output lands. */
  note?: string
  variant?: React.ComponentProps<typeof Button>["variant"]
  size?: React.ComponentProps<typeof Button>["size"]
  className?: string
  align?: React.ComponentProps<typeof PopoverContent>["align"]
}

export function AgentAsk({
  label,
  icon,
  title,
  prompt,
  note,
  variant = "outline",
  size = "sm",
  className,
  align = "start",
}: AgentAskProps) {
  const [copied, setCopied] = React.useState(false)

  const copy = () => {
    navigator.clipboard?.writeText(prompt).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      },
      () => {}
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant={variant} size={size} className={className}>
          {icon}
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="flex w-80 flex-col gap-3">
        <p className="text-sm font-medium">{title}</p>
        {/* Selectable as well as copyable — a user reading over someone's
            shoulder should be able to grab one line of it. */}
        <p className="bg-muted text-foreground rounded-md p-3 font-mono text-xs whitespace-pre-wrap select-text">
          {prompt}
        </p>
        {/* The instruction rides ON the button. As a grey caption above the
            prompt it read as decoration and got skipped — and skipping it is
            the whole failure mode: the user waits for a hub that never acts. */}
        <Button type="button" variant="outline" className="w-full" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied — paste it to your agent" : "Copy & paste to your agent"}
        </Button>
        {note && (
          <span className="text-muted-foreground/70 text-center text-xs">{note}</span>
        )}
      </PopoverContent>
    </Popover>
  )
}
