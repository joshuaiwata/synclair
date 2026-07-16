import Link from "next/link"
import { ArrowUpRight, LayoutGrid } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { synclair } from "@/lib/system/routes"

import { project } from "@/lib/system/seed/project"

/**
 * Product home — the root of the product app and the index of the **views** built
 * in this project. Views land here as they're created; each one is also cataloged
 * in the Synclair hub (`/synclair`). Starts as an empty state on purpose — this is
 * the blank canvas a new project begins from.
 */
export default function ProductHome() {
  // Product views built so far. Empty until the first screen is built — each new
  // view adds an entry here (or, later, is discovered from the route tree).
  const views: { title: string; href: string; description: string }[] = []

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-12 md:py-16">
      <div className="flex flex-col gap-3">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Product
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          {project.tagline} This is the product app — the views you build live here
          at the root. The{" "}
          <Link href={synclair()} className="text-foreground underline underline-offset-2">
            Synclair
          </Link>{" "}
          is the separate companion that catalogs every component and view this app
          produces.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Views</h2>
          <span className="text-muted-foreground text-xs">{views.length}</span>
        </div>

        {views.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LayoutGrid />
              </EmptyMedia>
              <EmptyTitle>No views yet</EmptyTitle>
              <EmptyDescription>
                Build a screen with the <code>build-view</code> skill. New views
                appear here and are cataloged in Synclair.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="divide-y rounded-lg border">
            {views.map((view) => (
              <Link
                key={view.href}
                href={view.href}
                className="group hover:bg-muted/40 flex items-center gap-3 px-4 py-3 transition-colors first:rounded-t-lg last:rounded-b-lg"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{view.title}</span>
                  <span className="text-muted-foreground text-xs">{view.description}</span>
                </div>
                <ArrowUpRight className="text-muted-foreground ml-auto size-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
