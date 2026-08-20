/**
 * THE EDGE GRAPH — what depends on what, assembled from artifacts the hub
 * already writes.
 *
 * Six checks each answer "has MY artifact drifted". None answers "what else did
 * that change invalidate", even though the edges exist: `pages-map` records the
 * catalog items each route composes, `external-catalog` records where each
 * component is rendered, `ux-docs/anchors` records which source a doc is pinned
 * to. `rank:hygiene` already walks the first of those to rank findings by page
 * reach — it is the only consumer, and it is one query, not a graph.
 *
 * THE HARD PART IS NOT THE GRAPH, IT IS THE PATHS. Three artifacts store paths
 * against three different bases:
 *
 *   pages-map      `sourceFiles` are relative to `repo.root` (e.g. ../apps/prototype)
 *   external-catalog `hostPath` is relative to THAT ITEM'S host root, found by
 *                    matching `item.surface` to `hosts[].surface`
 *   external-catalog `usage.files` are already relative to the PRODUCT REPO
 *   registry.json  `files[].path` is relative to the HUB
 *
 * Every one is normalised to a single base — the product repo root — before it
 * becomes an edge. Skipping that step doesn't produce a wrong graph; it produces
 * an EMPTY one that looks like "nothing is affected", which is the worst answer
 * this module could give.
 */

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { resolveTarget } from "./topology.mjs"

function readJson(p) {
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

const add = (map, key, value) => {
  if (!key) return
  if (!map.has(key)) map.set(key, new Set())
  map.get(key).add(value)
}

/**
 * Build the graph. Every returned path is PRODUCT-REPO-RELATIVE, POSIX-separated.
 *
 * Absent artifacts are absent, never an error: a blank clone has generated
 * nothing, and a graph that throws there would take `refresh` and the brief with
 * it.
 */
export function buildGraph(hubRoot) {
  const hostRoot = resolveTarget(hubRoot).hostRoot ?? hubRoot

  /** Normalise a path recorded against `base` (itself relative to the hub). */
  const rel = (base, p) => {
    if (typeof p !== "string" || !p) return null
    const abs = path.resolve(hubRoot, base ?? ".", p)
    return path.relative(hostRoot, abs).split(path.sep).join("/")
  }

  /**
   * Normalise a path that is ALREADY product-repo-relative. Resolving one of
   * these against the hub instead silently prefixes it (`synclair/apps/...`),
   * which matches nothing and reads as "this component is used nowhere".
   */
  const relFromHost = (p) => {
    if (typeof p !== "string" || !p) return null
    return path.relative(hostRoot, path.resolve(hostRoot, p)).split(path.sep).join("/")
  }

  /** file → items that declare it */
  const fileToItems = new Map()
  /** file → routes whose source closure includes it */
  const fileToPages = new Map()
  /** item key → routes composing it */
  const itemToPages = new Map()
  /** item key → a label for reporting */
  const itemLabels = new Map()
  /** file → knowledge source ids */
  const fileToKnowledge = new Map()
  /** item key → true when a UX doc is anchored to it */
  const itemHasDoc = new Set()

  const key = (name, surface) => `${surface ?? "shared"}:${String(name).toLowerCase()}`

  // ── this hub's own registry (paths relative to the hub) ─────────────────────
  const registry = readJson(path.join(hubRoot, "registry.json"))
  for (const item of registry?.items ?? []) {
    const k = key(item.name, item.meta?.surface)
    itemLabels.set(k, item.name)
    for (const f of item.files ?? []) add(fileToItems, rel(".", f.path ?? f), k)
  }

  // ── host catalog (per-item base, resolved via the item's surface) ───────────
  const catalog = readJson(path.join(hubRoot, "data", "external-catalog.json"))
  const hostRootBySurface = new Map(
    (catalog?.hosts ?? []).filter((h) => h?.surface && h?.root).map((h) => [h.surface, h.root])
  )
  for (const item of catalog?.items ?? []) {
    const k = key(item.name, item.surface)
    itemLabels.set(k, item.name)
    const base = hostRootBySurface.get(item.surface)
    // Without a base we cannot place the file. Record the item, skip the edge —
    // an edge built on a guessed base would point at a file that doesn't exist.
    if (base) add(fileToItems, rel(base, item.hostPath), k)
    // `usage.files` are already product-relative — normalise, don't re-resolve.
    for (const f of item.usage?.files ?? []) add(fileToItems, relFromHost(f), k)
  }

  // ── pages (source closure + composed items) ────────────────────────────────
  const pages = readJson(path.join(hubRoot, "data", "pages-map.json"))
  const pageBase = typeof pages?.repo?.root === "string" ? pages.repo.root : "."
  /**
   * Which surfaces the pages map actually covers. A map is generated per repo
   * root, so on a multi-surface product it describes ONE frontend. An item
   * belonging to any other surface has no page edges — and that is missing
   * data, not proof of zero reach. `rank:hygiene` already draws this line;
   * blurring it here would let "we never looked" read as "nothing uses it".
   */
  const mappedSurfaces = new Set()
  for (const page of pages?.pages ?? []) {
    const route = page.route ?? page.id
    if (!route) continue
    mappedSurfaces.add(page.surface ?? "shared")
    for (const f of page.sourceFiles ?? []) add(fileToPages, rel(pageBase, f), route)
    if (page.file) add(fileToPages, rel(pageBase, page.file), route)
    for (const it of page.items ?? []) {
      if (it?.name) add(itemToPages, key(it.name, it.surface), route)
    }
  }

  // ── UX docs (anchored per item) ────────────────────────────────────────────
  const anchors = readJson(path.join(hubRoot, "data", "ux-docs", "anchors.json"))
  for (const a of anchors?.anchors ?? []) {
    if (!a?.name) continue
    // Anchor keys are either "name" or "surface:name"; both normalise here.
    const [maybeSurface, maybeName] = String(a.name).includes(":")
      ? String(a.name).split(":")
      : [null, String(a.name)]
    itemHasDoc.add(key(maybeName, maybeSurface))
  }

  // ── knowledge sources that are files in the repo ───────────────────────────
  const freshness = readJson(path.join(hubRoot, ".synclair", "cache", "knowledge", "freshness.json"))
  for (const s of freshness?.sources ?? []) {
    if (s?.localPath) add(fileToKnowledge, s.localPath, s.id)
  }

  return {
    hostRoot,
    fileToItems,
    fileToPages,
    itemToPages,
    itemLabels,
    itemHasDoc,
    fileToKnowledge,
    mappedSurfaces,
    counts: {
      files: new Set([...fileToItems.keys(), ...fileToPages.keys()]).size,
      items: itemLabels.size,
      pages: new Set([...itemToPages.values()].flatMap((s) => [...s])).size,
    },
  }
}

/**
 * What a set of changed files affects. ONE HOP, deliberately.
 *
 * A transitive walk over a component graph reaches most of an app within three
 * hops, and a report that names everything names nothing. One hop is also the
 * distance the audited indexer settled on for the same reason.
 *
 * `changed` are product-repo-relative POSIX paths.
 */
export function impactOf(graph, changed) {
  const items = new Set()
  const pages = new Set()
  const knowledge = new Set()
  const unmatched = []

  for (const f of changed) {
    const hitItems = graph.fileToItems.get(f)
    const hitPages = graph.fileToPages.get(f)
    const hitKnow = graph.fileToKnowledge.get(f)
    if (!hitItems && !hitPages && !hitKnow) {
      unmatched.push(f)
      continue
    }
    for (const i of hitItems ?? []) items.add(i)
    for (const p of hitPages ?? []) pages.add(p)
    for (const k of hitKnow ?? []) knowledge.add(k)
  }

  // One hop: an item's own pages become affected too.
  for (const i of items) for (const p of graph.itemToPages.get(i) ?? []) pages.add(p)

  const docs = [...items].filter((i) => graph.itemHasDoc.has(i))

  /**
   * Affected items whose surface the pages map doesn't cover. Their page reach
   * is UNKNOWN, and unknown sorts above proven-zero — saying "no screens" for a
   * shared component used by two unmapped frontends is worse than saying "we
   * couldn't tell", because only the first one gets acted on.
   */
  const reachUnknown = [...items].filter((i) => {
    const surface = i.split(":")[0]
    return !graph.mappedSurfaces.has(surface) && (graph.itemToPages.get(i)?.size ?? 0) === 0
  })

  return {
    items: [...items].sort(),
    pages: [...pages].sort(),
    docs: docs.sort(),
    knowledge: [...knowledge].sort(),
    reachUnknown: reachUnknown.sort(),
    /**
     * Files that touch nothing the hub knows about. Reported, not hidden: on a
     * companion clone most of a diff is backend code the catalog never covers,
     * and silently dropping it would make "0 affected" indistinguishable from
     * "we have no idea".
     */
    unmatched,
  }
}
