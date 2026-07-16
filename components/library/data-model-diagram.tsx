/**
 * An entity-relationship diagram for the System Map's Data model tab, drawn to
 * ER convention per the `doc-quality` standard: a digested data model is a graph,
 * and its shape (what references what, which entities are central) reads far
 * better as a diagram than a table.
 *
 * Pure server component — deterministic SVG, themed by tokens. Relationships are
 * parsed from each entity's field `note`s (the system-mapper writes FK hints like
 * "FK -> Team"). Every FK edge is many-to-one, so we show it to convention:
 * a **crow's-foot** at the record holding the key (the "many") and an
 * **arrowhead** at the record it references (the "one"), so direction and
 * cardinality are both legible. Entities are laid out in reference layers
 * (parents above the children that point to them), ordered to reduce crossings.
 *
 * This is the ORIENTATION view: to stay readable it draws only the core
 * (~10 most-connected) entities. Full field detail for every entity — including
 * the long tail not drawn here — lives in the accordion below.
 */
import type { DataEntity } from "@/lib/system/system-map"

/** How many entities the orientation graph draws before it turns into a tangle. */
const MAX_NODES = 10

/** First token of an entity name — "DocumentVersion / DocumentPage" -> "DocumentVersion". */
function keyOf(name: string): string {
  return name.split(/[\s/,]+/)[0] ?? name
}

export function DataModelDiagram({ entities }: { entities: DataEntity[] }) {
  const keys = entities.map((e) => keyOf(e.name))
  const keySet = new Set(keys)
  const indexByKey = new Map(keys.map((k, i) => [k, i]))

  // Edges: entity -> referenced entity, parsed from field notes ("-> Team").
  const outgoing: Set<string>[] = entities.map(() => new Set<string>())
  entities.forEach((e, i) => {
    const self = keys[i]
    for (const f of e.fields ?? []) {
      const note = f.note ?? ""
      for (const m of note.matchAll(
        /(?:->|→|references?|FK\s+to)\s+([A-Z][A-Za-z0-9]+)/g
      )) {
        const target = m[1]
        if (keySet.has(target) && target !== self) outgoing[i].add(target)
      }
    }
  })

  // Rank by connectivity (in + out degree) and keep the core — an orientation
  // graph shows the load-bearing entities, not all of them (doc-quality §3).
  const indeg = new Array(entities.length).fill(0)
  outgoing.forEach((set) =>
    set.forEach((t) => {
      const ti = indexByKey.get(t)
      if (ti !== undefined) indeg[ti] += 1
    })
  )
  const degree = entities.map((_, i) => outgoing[i].size + indeg[i])
  const ranked = entities
    .map((_, i) => i)
    .filter((i) => degree[i] > 0)
    .sort((a, b) => degree[b] - degree[a] || a - b)
  const included = new Set(ranked.slice(0, MAX_NODES))

  // Keep only edges between included nodes, then the nodes those edges touch.
  const edges: [number, number][] = []
  included.forEach((i) =>
    outgoing[i].forEach((t) => {
      const ti = indexByKey.get(t)
      if (ti !== undefined && included.has(ti)) edges.push([i, ti])
    })
  )
  const shown = new Set<number>()
  edges.forEach(([s, t]) => {
    shown.add(s)
    shown.add(t)
  })
  // No relationships parsed → the diagram would add nothing; the table stands alone.
  if (shown.size === 0) return null

  const shownCount = shown.size
  const totalCount = entities.length

  // Adjacency over the drawn subgraph.
  const outAdj = new Map<number, number[]>()
  shown.forEach((i) => outAdj.set(i, []))
  edges.forEach(([s, t]) => outAdj.get(s)!.push(t))

  // Layer = 0 for entities that reference nothing drawn (roots/tenants, at top),
  // else 1 + max(layer of referenced). Memoized DFS with a cycle guard.
  const layer = new Map<number, number>()
  const inProgress = new Set<number>()
  const computeLayer = (i: number): number => {
    const memo = layer.get(i)
    if (memo !== undefined) return memo
    if (inProgress.has(i)) return 0 // cycle — break it
    inProgress.add(i)
    let lvl = 0
    for (const t of outAdj.get(i) ?? []) lvl = Math.max(lvl, computeLayer(t) + 1)
    inProgress.delete(i)
    layer.set(i, lvl)
    return lvl
  }
  shown.forEach((i) => computeLayer(i))

  const maxLayer = Math.max(...[...shown].map((i) => layer.get(i)!))
  const rows: number[][] = Array.from({ length: maxLayer + 1 }, () => [])
  shown.forEach((i) => rows[layer.get(i)!].push(i))

  // Geometry.
  const NODE_W = 150
  const NODE_H = 40
  const H_GAP = 28
  const V_GAP = 66
  const PAD = 18
  const rowWidth = (row: number[]) =>
    row.length * NODE_W + (row.length - 1) * H_GAP
  const contentW = Math.max(...rows.map(rowWidth), NODE_W)
  const width = contentW + PAD * 2
  const height = (maxLayer + 1) * NODE_H + maxLayer * V_GAP + PAD * 2

  // Position each node. Order the top row stably, then each lower row by the
  // barycenter of its already-placed targets — a single Sugiyama-style down-sweep
  // that pulls children under their parents and cuts edge crossings.
  const pos = new Map<number, { x: number; y: number }>()
  const centerX = new Map<number, number>()
  rows.forEach((row, l) => {
    const ordered =
      l === 0
        ? [...row].sort((a, b) => a - b)
        : [...row].sort((a, b) => bary(a) - bary(b) || a - b)
    const startX = PAD + (contentW - rowWidth(ordered)) / 2
    ordered.forEach((i, j) => {
      const x = startX + j * (NODE_W + H_GAP)
      const y = PAD + l * (NODE_H + V_GAP)
      pos.set(i, { x, y })
      centerX.set(i, x + NODE_W / 2)
    })
  })

  function bary(i: number): number {
    const targets = outAdj.get(i) ?? []
    const placed = targets.map((t) => centerX.get(t)).filter((x): x is number => x !== undefined)
    if (placed.length === 0) return centerX.get(i) ?? 0
    return placed.reduce((s, x) => s + x, 0) / placed.length
  }

  return (
    <div className="overflow-x-auto rounded-lg border p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="max-w-full"
        role="img"
        aria-label="Entity-relationship diagram of the core data model"
      >
        {/* Edges + ER endpoint markers, under the nodes. The path is vertical at
            both endpoints (control points share the endpoint x), so the crow's
            foot and arrowhead are drawn with fixed vertical geometry. */}
        {edges.map(([s, t], k) => {
          const from = pos.get(s)
          const to = pos.get(t)
          if (!from || !to) return null
          const x1 = centerX.get(s)!
          const y1 = from.y // top of source (the "many")
          const x2 = centerX.get(t)!
          const y2 = to.y + NODE_H // bottom of target (the "one")
          const my = (y1 + y2) / 2
          return (
            <g key={k} className="stroke-muted-foreground/45">
              <path
                d={`M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`}
                className="fill-none"
                strokeWidth={1}
              />
              {/* Crow's foot at the source: three prongs = "many". */}
              <path
                d={`M ${x1} ${y1 - 9} L ${x1 - 5} ${y1} M ${x1} ${y1 - 9} L ${x1} ${y1} M ${x1} ${y1 - 9} L ${x1 + 5} ${y1}`}
                className="fill-none"
                strokeWidth={1}
              />
              {/* Arrowhead at the target: points to the referenced "one". */}
              <path
                d={`M ${x2 - 4} ${y2 + 6} L ${x2} ${y2} L ${x2 + 4} ${y2 + 6} Z`}
                className="fill-muted-foreground/60 stroke-none"
              />
            </g>
          )
        })}
        {/* Nodes. */}
        {[...shown].map((i) => {
          const p = pos.get(i)
          if (!p) return null
          return (
            <g key={i}>
              <rect
                x={p.x}
                y={p.y}
                width={NODE_W}
                height={NODE_H}
                rx={6}
                className="fill-card stroke-border"
                strokeWidth={1}
              />
              <text
                x={p.x + NODE_W / 2}
                y={p.y + NODE_H / 2}
                text-anchor="middle"
                dominant-baseline="central"
                className="fill-foreground font-mono text-2xs"
              >
                {keyOf(entities[i].name)}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="mt-3 text-2xs text-muted-foreground/70">
        Each edge is a foreign key: the{" "}
        <span className="font-medium">crow&rsquo;s foot</span> marks the record
        holding it (many), the <span className="font-medium">arrow</span> points
        to the record it references (one).
        {shownCount < totalCount && (
          <>
            {" "}
            Showing the {shownCount} most-connected of {totalCount} entities —
            full field detail for all is below.
          </>
        )}
      </p>
    </div>
  )
}
