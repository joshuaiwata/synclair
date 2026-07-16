import type { ReactNode } from "react"

import { PageHeader } from "@/components/page-header"
import { cn } from "@/lib/utils"

/**
 * HubPage — the one page scaffold every `/synclair` route composes from.
 *
 * Before this existed, each page hand-rolled the same three parts — the sticky
 * `PageHeader`, a centered `max-w-6xl` `<main>`, and a muted intro lead — with
 * the gap and max-width drifting page to page. Centralizing them here is the
 * "eat our own dogfood" move: the hub's own pages use a composable instead of
 * re-typing layout. Long-form/marketing routes (how-it-works) and the library
 * explorer (its own breadcrumb shell) are the deliberate exceptions.
 *
 * Anatomy, top to bottom: title + optional right `meta` slot (path text,
 * status, or an action) → one `lead` paragraph → the page's sections. When a
 * page needs to wrap `<main>` in a provider, compose `PageBody` + `PageLead`
 * directly instead of the all-in-one `HubPage`.
 */
export interface HubPageProps {
  title: string
  /** Right-aligned header slot — mono path text, a status badge, or an action. */
  meta?: ReactNode
  /** The single intro paragraph. One lead per page; sections carry their own headers. */
  lead?: ReactNode
  children: ReactNode
  /** Overrides on the `<main>` (e.g. a wider gap for a denser page). */
  className?: string
}

export function HubPage({ title, meta, lead, children, className }: HubPageProps) {
  return (
    <>
      <PageHeader title={title}>{meta}</PageHeader>
      <PageBody className={className}>
        {lead ? <PageLead>{lead}</PageLead> : null}
        {children}
      </PageBody>
    </>
  )
}

/** The centered content column — the canonical `<main>` for a hub page. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn("mx-auto flex w-full max-w-6xl flex-col gap-8 p-6", className)}>
      {children}
    </main>
  )
}

/** The single muted intro paragraph that opens a hub page, under the header. */
export function PageLead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-muted-foreground max-w-2xl text-sm", className)}>{children}</p>
  )
}
