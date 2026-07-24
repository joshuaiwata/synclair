import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getCatalog,
  isFoundationVisible,
  isLibraryVisible,
  type RegistryComponent,
} from "@/lib/system/components"
import { synclair } from "@/lib/system/routes"
import {
  defaultSurfaceId,
  getSurface,
  isMultiSurface,
  SHARED_SURFACE_ID,
  surfaceLabel,
} from "@/lib/system/surfaces"
import { TIERS, tierSlug } from "@/lib/system/tiers"

export const dynamic = "force-dynamic"

/**
 * A surface's HOME inside its scope — the "you've entered this workspace" page:
 * what this frontend is, and its library summarized per tier. GitHub-repo-page
 * analog for one app surface (or the Shared packages root).
 */
export default async function SurfaceHomePage({
  params,
}: {
  params: Promise<{ surface: string }>
}) {
  if (!isMultiSurface()) redirect(synclair("/components"))
  const { surface: surfaceId } = await params
  const surface = getSurface(surfaceId)
  if (!surface && surfaceId !== SHARED_SURFACE_ID) notFound()

  const catalog = await getCatalog()
  const foundationVisible = await isFoundationVisible()
  const surfaceOf = (c: RegistryComponent) => c.surface ?? defaultSurfaceId()
  const items = catalog.filter(
    (c) => isLibraryVisible(c, foundationVisible) && surfaceOf(c) === surfaceId
  )

  return (
    <div className="page-enter mx-auto w-full flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{surfaceLabel(surfaceId)}</h1>
        <p className="text-muted-foreground text-sm">
          {surfaceId === SHARED_SURFACE_ID
            ? "Monorepo packages consumed by several surfaces. Shared items also appear inside each surface's library, badged."
            : `${surface?.framework ?? "—"} · ${items.length} library items`}
        </p>
        {surface?.root && (
          <span className="text-muted-foreground/70 font-mono text-2xs">{surface.root}</span>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tier</TableHead>
              <TableHead className="w-24 text-right">Items</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {TIERS.map((t) => {
              const count = items.filter((c) => c.kind === t.kind).length
              return (
                <TableRow key={t.kind}>
                  <TableCell>
                    <Link
                      href={synclair(`/library/${surfaceId}/${tierSlug(t.kind)}`)}
                      className="flex flex-col gap-0.5"
                    >
                      <span className="text-sm font-medium">{t.label}</span>
                      <span className="text-muted-foreground text-xs whitespace-normal">
                        {t.description}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <Badge variant="secondary" className="font-mono text-2xs">
                      {count}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top">
                    <ArrowRight className="text-muted-foreground size-3.5" />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
