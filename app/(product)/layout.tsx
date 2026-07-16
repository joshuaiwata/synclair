import Link from "next/link"
import { PanelsTopLeft } from "lucide-react"

import { synclair } from "@/lib/system/routes"

import { project } from "@/lib/system/seed/project"

/**
 * The product app shell — chrome for the product you're building on this
 * foundation, at the root `/`. This is a *separate app UI* from the Synclair hub
 * at `/synclair`: the product is what gets built here; Synclair catalogs the
 * components and views it produces. Deliberately minimal — product navigation
 * grows as real views are added. Rename the product via `lib/system/seed/project.ts`.
 */
export default function ProductLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold">
            {project.name.charAt(0).toUpperCase()}
          </span>
          <span className="text-sm font-semibold">{project.name}</span>
        </Link>
        <Link
          href={synclair()}
          className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1.5 text-xs"
        >
          <PanelsTopLeft className="size-3.5" />
          Synclair
        </Link>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  )
}
