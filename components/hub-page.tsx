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
 * re-typing layout. Long-form/marketing routes and the library explorer (its
 * own breadcrumb shell) are the deliberate exceptions.
 *
 * Anatomy, top to bottom: the slim context bar (`PageHeader`), then an in-body
 * `PageTitle` — the page's real `<h1>` at display scale with the `meta` slot
 * beside it and the `lead` paragraph beneath — then the page's sections. When a
 * page needs to wrap `<main>` in a provider, compose `PageBody` + `PageTitle`
 * directly instead of the all-in-one `HubPage`.
 */
export interface HubPageProps {
  title: string
  /** Right-aligned title slot — mono path text, a status badge, or an action. */
  meta?: ReactNode
  /** The single intro paragraph. One lead per page; sections carry their own headers. */
  lead?: ReactNode
  children: ReactNode
  /** Overrides on the `<main>` (e.g. a tighter gap for a denser page). */
  className?: string
}

export function HubPage({ title, meta, lead, children, className }: HubPageProps) {
  return (
    <>
      <PageHeader title={title} />
      <PageBody className={className}>
        <PageTitle title={title} meta={meta} lead={lead} />
        {children}
      </PageBody>
    </>
  )
}

/** The centered content column — the canonical `<main>` for a hub page. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  // A <div>, not <main>: the sidebar shell (SidebarInset) already renders the
  // page's one <main> landmark — nesting another is invalid HTML.
  return (
    <div
      className={cn(
        "page-enter mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-8 md:px-8",
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * The in-body page identity block: display-scale `<h1>` (the TYPE_SCALE
 * "page title" role), the right-aligned `meta` slot, and the lead paragraph.
 */
export function PageTitle({
  title,
  meta,
  lead,
  className,
}: {
  title: ReactNode
  meta?: ReactNode
  lead?: ReactNode
  className?: string
}) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">{title}</h1>
        {meta ? <div className="flex items-center gap-3">{meta}</div> : null}
      </div>
      {lead ? <PageLead>{lead}</PageLead> : null}
    </header>
  )
}

/** The single muted intro paragraph that opens a hub page, under the title. */
export function PageLead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-body-content max-w-2xl text-base", className)}>{children}</p>
  )
}
