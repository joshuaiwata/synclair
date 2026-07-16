import Link from "next/link"
import { redirect } from "next/navigation"

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
  getSurfaces,
  isMultiSurface,
  PLATFORM_BADGE,
  SHARED_SURFACE_ID,
} from "@/lib/system/surfaces"
import { TIERS } from "@/lib/system/tiers"

export const dynamic = "force-dynamic"

/**
 * The LIBRARY HOME for multi-surface projects — the "org page": how the
 * product divides into app surfaces + shared packages, one dense row each,
 * entered like entering a repo. Single-surface projects never see this
 * (redirect to the components gallery — the tree is their whole structure).
 */
export default async function LibraryHomePage() {
  if (!isMultiSurface()) redirect(synclair("/components"))

  const catalog = await getCatalog()
  const foundationVisible = await isFoundationVisible()
  const items = catalog.filter((c) => isLibraryVisible(c, foundationVisible))
  const surfaceOf = (c: RegistryComponent) => c.surface ?? defaultSurfaceId()
  const surfaces = getSurfaces()
  const sharedItems = items.filter((c) => surfaceOf(c) === SHARED_SURFACE_ID)

  const rows = [
    ...surfaces.map((s) => ({
      id: s.id,
      label: s.label,
      badge: PLATFORM_BADGE[s.platform],
      stack: s.framework ?? "—",
      root: s.root,
      items: items.filter((c) => surfaceOf(c) === s.id),
    })),
    ...(sharedItems.length > 0
      ? [
          {
            id: SHARED_SURFACE_ID,
            label: "Shared",
            badge: "pkg",
            stack: "consumed by several surfaces",
            root: undefined as string | undefined,
            items: sharedItems,
          },
        ]
      : []),
  ]
  const countBy = (of: RegistryComponent[], kind: string) =>
    of.filter((c) => c.kind === kind).length

  return (
    <main className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-base font-semibold">Library</h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          This project ships {surfaces.length} app surfaces
          {sharedItems.length > 0 && " plus shared packages"}, each with its own component
          library. Enter one, or browse everything from the tree.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Surface</TableHead>
              <TableHead className="w-24">Platform</TableHead>
              <TableHead className="w-48">Stack</TableHead>
              {TIERS.map((t) => (
                <TableHead key={t.kind} className="w-28 text-right">
                  {t.label}
                </TableHead>
              ))}
              <TableHead className="w-56">Root</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className="hover:bg-muted/40 relative">
                <TableCell className="font-medium">
                  <Link href={synclair(`/library/${row.id}`)} className="after:absolute after:inset-0">
                    {row.label}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-3xs">
                    {row.badge}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">{row.stack}</TableCell>
                {TIERS.map((t) => (
                  <TableCell key={t.kind} className="text-right font-mono text-xs tabular-nums">
                    {countBy(row.items, t.kind)}
                  </TableCell>
                ))}
                <TableCell className="text-muted-foreground/70 font-mono text-2xs">
                  {row.root ?? ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-muted-foreground text-xs">
        {items.length} items across {rows.length} roots
        {sharedItems.length > 0 && ` · ${sharedItems.length} shared`}. All-surfaces view:{" "}
        {TIERS.map((t, i) => (
          <span key={t.kind}>
            {i > 0 && " · "}
            <Link href={t.path} className="underline underline-offset-2">
              {t.label}
            </Link>
          </span>
        ))}
      </p>
    </main>
  )
}
