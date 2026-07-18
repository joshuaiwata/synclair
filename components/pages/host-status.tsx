import { CircleCheck, CircleSlash, ExternalLink, Info } from "lucide-react"

import type { DevServerStatus } from "@/lib/system/dev-servers"

/**
 * The host preview banner on /synclair/pages. In companion mode a route's live
 * preview needs the host app's dev server running; this strip says whether it
 * is, points previews at the live URL when it is, and shows the one command to
 * boot it when it isn't. Same-origin (the hub's own routes) shows nothing —
 * those previews always work.
 */
export function HostStatus({
  isHost,
  server,
  liveBaseUrl,
}: {
  /** True when the map describes a HOST repo (previews need a separate server). */
  isHost: boolean
  /** The dev server this host maps to in data/dev-servers.json, or null. */
  server: DevServerStatus | null
  /** The resolved live base URL (server live, or previewBaseUrl probed live), or null. */
  liveBaseUrl: string | null
}) {
  if (!isHost) return null

  if (liveBaseUrl) {
    return (
      <div className="border-success/30 bg-success/5 text-muted-foreground flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs">
        <CircleCheck className="text-success size-4 shrink-0" />
        <span>
          Host <span className="text-foreground font-medium">{server?.label ?? "app"}</span> is live
          — route previews render from
        </span>
        <a
          href={liveBaseUrl}
          target="_blank"
          rel="noreferrer"
          className="text-foreground inline-flex items-center gap-1 font-mono underline underline-offset-2"
        >
          {liveBaseUrl}
          <ExternalLink className="size-3" />
        </a>
      </div>
    )
  }

  if (server) {
    return (
      <div className="border-warning/30 bg-warning/5 text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-xs">
        <CircleSlash className="text-warning size-4 shrink-0" />
        <span>
          Host <span className="text-foreground font-medium">{server.label}</span> isn&rsquo;t
          running at <span className="font-mono">{server.url}</span> — previews are paused.
        </span>
        <span className="text-muted-foreground/80">
          Boot it:{" "}
          <code className="bg-muted rounded px-1 py-0.5 font-mono">
            npm run host:up{server.id ? ` ${server.id}` : ""}
          </code>
        </span>
      </div>
    )
  }

  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs">
      <Info className="size-4 shrink-0" />
      <span>
        Live route previews are off — declare this host&rsquo;s dev server in{" "}
        <code className="bg-muted rounded px-1 py-0.5 font-mono">data/dev-servers.json</code> (id,
        url, command, cwd) to light them up. Until then, each page links out to its route.
      </span>
    </div>
  )
}
