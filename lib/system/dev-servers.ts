import { readFile } from "node:fs/promises"
import path from "node:path"

import { cache } from "react"

/**
 * The project's local dev servers and their liveness, so the hub can light up
 * host route previews the moment the host app is running — and fall back to an
 * "open route" / "boot it" affordance when it isn't.
 *
 * Config is `data/dev-servers.json` (topology, like setup.json — project-owned,
 * never synced from the foundation; blank in a fresh clone). Detection is a
 * cheap server-side probe; the boot itself stays a deliberate command an agent
 * or the user runs (`npm run host:up`), never something a render spawns. The
 * launcher (`scripts/host-servers.mjs`) reads the same JSON.
 */

export interface DevServer {
  /** Stable id (the launcher's selector). */
  id: string
  /** Human label shown in the hub. */
  label: string
  /** Base URL the server serves at, e.g. "http://localhost:5173". */
  url: string
  /** Command that boots it (run from `cwd`). Omit if it can't be auto-booted. */
  command?: string
  /** Working directory for `command`, relative to this repo. */
  cwd?: string
  /** Which pages-map host this serves previews for — match to the map's `repo.name`. */
  host?: string
}

export interface DevServerStatus extends DevServer {
  live: boolean
}

const CONFIG_PATH = path.join(process.cwd(), "data", "dev-servers.json")

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}

/** Read the configured servers, tolerating a missing/blank/corrupt file. */
export const getDevServerConfig = cache(async (): Promise<DevServer[]> => {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8")
    const parsed = JSON.parse(raw) as { servers?: unknown }
    if (!Array.isArray(parsed.servers)) return []
    return parsed.servers
      .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
      .map((s): DevServer | null => {
        const id = str(s.id)
        const url = str(s.url)
        if (!id || !url) return null
        return {
          id,
          label: str(s.label) ?? id,
          url,
          command: str(s.command),
          cwd: str(s.cwd),
          host: str(s.host),
        }
      })
      .filter((s): s is DevServer => s !== null)
  } catch {
    return []
  }
})

/** True if something answers at `url` within a short budget (any HTTP reply). */
async function isLive(url: string): Promise<boolean> {
  const probe = async (method: "HEAD" | "GET") => {
    const res = await fetch(url, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(700),
      cache: "no-store",
    })
    return res.status > 0 // any answer means a server is listening
  }
  try {
    return await probe("HEAD")
  } catch {
    try {
      return await probe("GET")
    } catch {
      return false
    }
  }
}

/** Probe every configured dev server once per request (deduped by React cache). */
export const getDevServers = cache(async (): Promise<DevServerStatus[]> => {
  const servers = await getDevServerConfig()
  return Promise.all(servers.map(async (s) => ({ ...s, live: await isLive(s.url) })))
})

function origin(u: string): string | null {
  try {
    return new URL(u).origin
  } catch {
    return null
  }
}

/**
 * The LIVE base URL to iframe a host map's route previews against, or null when
 * nothing suitable is up. Matches the map's `repo` (by `name` → `host`, or by
 * same-origin `previewBaseUrl`) to a configured server, returning its url only
 * if live; with no config, probes `previewBaseUrl` directly. Same-origin hub
 * routes have no host — pass nothing and previews use the route as-is.
 */
export async function liveBaseUrlFor(
  repo?: { name?: string; previewBaseUrl?: string } | null
): Promise<string | null> {
  const servers = await getDevServers()
  const byHost = repo?.name ? servers.find((s) => s.host === repo.name) : undefined
  const byOrigin = repo?.previewBaseUrl
    ? servers.find((s) => origin(s.url) && origin(s.url) === origin(repo.previewBaseUrl!))
    : undefined
  const match = byHost ?? byOrigin
  if (match) return match.live ? match.url.replace(/\/$/, "") : null
  if (repo?.previewBaseUrl && (await isLive(repo.previewBaseUrl)))
    return repo.previewBaseUrl.replace(/\/$/, "")
  return null
}

/**
 * Resolve the iframe src for a page's preview, or undefined when none is
 * available right now. Same-origin hub routes (`previewable: true`) use the
 * route directly. Host routes (`previewable: false`, `previewUrl` = a client
 * path) become renderable only when a live host base URL is present — then the
 * src is `liveBaseUrl + route`. So host previews light up the moment the host
 * dev server is running, and quietly fall back to "open route" when it isn't.
 */
export function resolvePreviewSrc(
  page: { previewUrl?: string; previewable?: boolean; kind?: string },
  liveBaseUrl: string | null
): string | undefined {
  if (!page.previewUrl || page.kind === "api" || page.kind === "layout") return undefined
  if (page.previewable) return page.previewUrl
  if (!liveBaseUrl) return undefined
  if (/^https?:\/\//.test(page.previewUrl)) return page.previewUrl
  return liveBaseUrl + (page.previewUrl.startsWith("/") ? "" : "/") + page.previewUrl
}

/** The configured server a host map maps to (for the "boot it" banner), live or not. */
export async function hostDevServer(
  repo?: { name?: string; previewBaseUrl?: string } | null
): Promise<DevServerStatus | null> {
  if (!repo) return null
  const servers = await getDevServers()
  return (
    (repo.name ? servers.find((s) => s.host === repo.name) : undefined) ??
    (repo.previewBaseUrl
      ? servers.find((s) => origin(s.url) && origin(s.url) === origin(repo.previewBaseUrl!))
      : undefined) ??
    null
  )
}
