/**
 * THE CHANGE FEED — what moved since you last looked.
 *
 * The brief reports the hub's standing CONDITION ("3 things are stale"). That is
 * the wrong shape for the thing people actually want to be told: *a new
 * component was cataloged*, *the Billing PRD drifted*, *a route appeared*.
 * A condition repeats itself every session until someone fixes it, which is how
 * a notification becomes wallpaper. A delta fires once, when it happens.
 *
 * So this keeps a small fingerprint of what was last reported and diffs against
 * it. Three properties matter:
 *
 *   PER-DEVELOPER, NEVER COMMITTED — the cursor lives under `data/.local/`,
 *   gitignored. "What I last saw" is personal; a shared cursor would mean
 *   whoever ran the brief first silently consumed everyone else's news.
 *
 *   FIRST RUN IS SILENT — a fresh cursor seeds and reports nothing. Announcing
 *   144 catalog items as "new" on the first session of a populated clone would
 *   be the loudest possible way to teach someone to ignore this.
 *
 *   ADVANCE ONLY WHEN REPORTED — the cursor moves when the brief actually
 *   prints. If the run was `--json`, or the output was capped, the news is still
 *   news next time. A notification you never saw must not be marked as read.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const CURSOR_REL = path.join("data", ".local", "brief-cursor.json")

const readJson = (p) => {
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

/**
 * A fingerprint of everything the feed can report on, built from caches the hub
 * already writes. Cheap: no hashing of source, no network, no model.
 */
/**
 * @param artifacts the `check:freshness` report's `artifacts` array. Passed IN
 *   rather than read from disk: that check computes live and writes no cache, so
 *   reading a file here would silently fingerprint nothing and the artifact half
 *   of the feed would never fire.
 */
export function fingerprint(hubRoot, artifacts = []) {
  const catalog = readJson(path.join(hubRoot, "data", "external-catalog.json"))
  const registry = readJson(path.join(hubRoot, "registry.json"))
  const pages = readJson(path.join(hubRoot, "data", "pages-map.json"))
  const fresh = readJson(path.join(hubRoot, "data", "knowledge", "freshness.json"))

  const items = {}
  for (const i of catalog?.items ?? []) if (i?.name) items[`${i.surface ?? "shared"}:${i.name}`] = 1
  for (const i of registry?.items ?? []) if (i?.name) items[`registry:${i.name}`] = 1

  const routes = {}
  for (const p of pages?.pages ?? []) if (p?.route) routes[p.route] = 1

  const knowledge = {}
  for (const s of fresh?.sources ?? []) if (s?.id) knowledge[s.id] = s.state ?? "?"

  const artifactStates = {}
  for (const a of artifacts ?? []) if (a?.artifact) artifactStates[a.artifact] = a.state ?? "?"

  return { items, routes, knowledge, artifacts: artifactStates }
}

const keys = (o) => Object.keys(o ?? {})
const added = (before, after) => keys(after).filter((k) => !(k in (before ?? {})))
const removed = (before, after) => keys(before).filter((k) => !(k in (after ?? {})))

/**
 * Diff the current fingerprint against the stored cursor.
 *
 * @returns {{first: boolean, events: Array<{kind: string, text: string, n: number}>}}
 *          `first: true` means the cursor was absent — seed and say nothing.
 */
export function changesSince(hubRoot, current) {
  const stored = readJson(path.join(hubRoot, CURSOR_REL))
  if (!stored?.fingerprint) return { first: true, events: [] }

  const before = stored.fingerprint
  const events = []
  const say = (kind, n, text) => n > 0 && events.push({ kind, n, text })

  const newItems = added(before.items, current.items)
  const goneItems = removed(before.items, current.items)
  say("catalog", newItems.length,
    `${newItems.length} component(s) newly cataloged: ${newItems.slice(0, 4).map((k) => k.split(":").pop()).join(", ")}${newItems.length > 4 ? "…" : ""}`)
  say("catalog", goneItems.length,
    `${goneItems.length} component(s) no longer in the catalog: ${goneItems.slice(0, 4).map((k) => k.split(":").pop()).join(", ")}${goneItems.length > 4 ? "…" : ""}`)

  const newRoutes = added(before.routes, current.routes)
  const goneRoutes = removed(before.routes, current.routes)
  say("pages", newRoutes.length, `${newRoutes.length} new route(s): ${newRoutes.slice(0, 4).join(", ")}${newRoutes.length > 4 ? "…" : ""}`)
  say("pages", goneRoutes.length, `${goneRoutes.length} route(s) gone: ${goneRoutes.slice(0, 4).join(", ")}${goneRoutes.length > 4 ? "…" : ""}`)

  /**
   * Knowledge and artifacts report TRANSITIONS, not states. "Billing PRD went
   * stale" is news; "Billing PRD is stale" is the standing condition the rest of
   * the brief already covers, and repeating it here would double every line.
   */
  const wentStale = keys(current.knowledge).filter(
    (id) => current.knowledge[id] === "stale" && before.knowledge?.[id] && before.knowledge[id] !== "stale"
  )
  say("knowledge", wentStale.length, `${wentStale.length} spec(s) drifted since you last looked: ${wentStale.slice(0, 3).join(", ")}${wentStale.length > 3 ? "…" : ""}`)

  const newSources = added(before.knowledge, current.knowledge)
  say("knowledge", newSources.length, `${newSources.length} knowledge source(s) registered: ${newSources.slice(0, 3).join(", ")}${newSources.length > 3 ? "…" : ""}`)

  const artifactsDrifted = keys(current.artifacts).filter(
    (a) => current.artifacts[a] === "stale" && before.artifacts?.[a] && before.artifacts[a] !== "stale"
  )
  say("artifacts", artifactsDrifted.length, `${artifactsDrifted.join(", ")} drifted since you last looked`)

  // Recoveries are reported too — a check that only ever delivers bad news gets
  // read as nagging rather than as a feed.
  const recovered = keys(current.artifacts).filter(
    (a) => before.artifacts?.[a] === "stale" && current.artifacts[a] === "fresh"
  )
  say("artifacts", recovered.length, `${recovered.join(", ")} back in sync`)

  return { first: false, events }
}

/** Persist the fingerprint. Called ONLY after the brief has actually printed. */
export function advanceCursor(hubRoot, current) {
  const p = path.join(hubRoot, CURSOR_REL)
  try {
    mkdirSync(path.dirname(p), { recursive: true })
    writeFileSync(p, JSON.stringify({ at: new Date().toISOString(), fingerprint: current }, null, 2))
    return true
  } catch {
    // A read-only checkout must not break the brief. Worst case the same news
    // repeats next session, which is far better than a failed session start.
    return false
  }
}
