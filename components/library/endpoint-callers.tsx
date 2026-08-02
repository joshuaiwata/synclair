import { Badge } from "@/components/ui/badge"
import type { ContractLink } from "@/lib/system/contracts"

/**
 * Who calls this endpoint — the one cell where "we don't know" and "nobody" must
 * not look alike.
 *
 * A static scan cannot prove absence. It reads the call sites it recognises, and
 * a call built from a dynamic URL is invisible to it. So when the scan itself
 * withheld its unused-endpoint claim (`mayAssertUnused === false`), this renders
 * a muted "not seen" rather than an emphatic "unused" — because the emphatic
 * version invites someone to delete a live endpoint, and that has already
 * happened once in testing: 35 endpoints reported dead on a real repo were all
 * being called through a one-line helper.
 */
export function EndpointCallers({
  links,
  mayAssertUnused,
}: {
  links: ContractLink[]
  mayAssertUnused: boolean
}) {
  if (links.length === 0) {
    return mayAssertUnused ? (
      <span className="text-muted-foreground/70">no caller found</span>
    ) : (
      <span className="text-muted-foreground/50" title="Consumer coverage was too thin to judge — see the scan diagnostics">
        not seen
      </span>
    )
  }

  // Callers are grouped by app: "which service depends on this" is the question
  // a reviewer is actually asking, not which of nine files does the fetching.
  const apps = [...new Set(links.map((l) => l.consumerApp))].sort()
  const crossApp = links.some((l) => l.scope === "cross-app")

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {apps.slice(0, 2).map((app) => (
        <Badge key={app} variant="outline" className="text-3xs font-normal">
          {app}
        </Badge>
      ))}
      {apps.length > 2 && (
        <span className="text-2xs text-muted-foreground/70">+{apps.length - 2}</span>
      )}
      {/* A cross-service call crosses a deployment boundary; an intra-app one is
          a screen calling its own API. Both are the seam, only one can break on
          deploy, so the distinction is worth one glyph. */}
      {crossApp && (
        <span className="text-2xs text-muted-foreground/60" title="Crosses a service boundary">
          ↗
        </span>
      )}
    </span>
  )
}
