/**
 * Entity-relationship diagrams for the System Map's Data model tab, drawn to ER
 * convention per the `doc-quality` standard: a digested data model is a graph,
 * and its shape reads far better as a diagram than a table.
 *
 * Pure server component — deterministic SVG, themed by tokens, no client JS.
 * Every FK edge is many-to-one and shown to convention: a **crow's foot** at the
 * record holding the key (the "many") and an **arrowhead** at the record it
 * references (the "one"). Entities are laid out in reference layers (parents
 * above the children that point to them), ordered to cut crossings.
 *
 * ── ONE DIAGRAM PER SOURCE ───────────────────────────────────────────────────
 * A service-per-database system has no foreign keys BETWEEN its databases, so a
 * single canvas over every entity is not one graph — it is N disconnected
 * islands, ranked against each other for space. The largest schema then wins
 * every slot and the smaller services vanish, which reads as "this is the data
 * model" when it is one of several.
 *
 * So entities are grouped by their `source` and each group gets its own diagram,
 * captioned with where it came from. The biggest is open; the rest sit in native
 * `<details>` — disclosure without shipping a line of JavaScript.
 *
 * ── EDGES ────────────────────────────────────────────────────────────────────
 * Two sources, because maps are written by different hands. A field NOTE may
 * spell the reference out ("FK -> Team"), and a field TYPE may simply BE another
 * entity — the shape an ORM's relation field takes ("owner: Team"). Reading only
 * notes silently drops every entity documented without them, which is most of any
 * map grown by scanning. Both are read; a type only counts when it names an entity
 * in the same group, so scalars and enums fall away on their own.
 */
import type { DataEntity } from "@/lib/system/system-map"

/**
 * Safety valve, per diagram rather than per map. High enough that a real service
 * schema draws in full — the point of splitting by source — and low enough that
 * a pathological one degrades instead of hanging the page.
 */
const MAX_NODES = 48

/** Rows of columns drawn inside a node before it is summarised. */
const MAX_ROWS = 5

/**
 * Characters an entity name can show before it is truncated. Derived from the
 * node width at the mono type scale, not guessed: overflowing SVG text draws
 * straight over the neighbouring node rather than clipping.
 */
const NAME_CHARS = 24
/** Column names get the same treatment, inset from the node's left edge. */
const COL_CHARS = 22

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…"
}

/** Corner radius where an orthogonal edge turns. 0 would be a hard right angle. */
const ELBOW = 6

/**
 * An ORTHOGONAL connector: up out of the source, across, up into the target,
 * with the corners rounded just enough to read as deliberate.
 *
 * Curves were the obvious first choice and the wrong one. On a sparse graph a
 * bezier is fine; once a schema has forty tables the curves all leave and arrive
 * at slightly different angles, so no two are parallel and the eye cannot follow
 * one line through a bundle. Right angles share segments — a dozen edges running
 * the same corridor read as a bus rather than a knot, which is why every schema
 * tool that handles real density draws them this way.
 *
 * Both endpoints stay vertical, so the crow's foot and arrowhead keep their fixed
 * geometry. A straight vertical drop skips the elbows entirely.
 */
function orthogonal(x1: number, y1: number, x2: number, y2: number): string {
  const my = (y1 + y2) / 2
  if (Math.abs(x1 - x2) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`
  const dir = x2 > x1 ? 1 : -1
  const r = Math.min(ELBOW, Math.abs(x2 - x1) / 2, Math.abs(y1 - my))
  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${my + r}`,
    `Q ${x1} ${my} ${x1 + dir * r} ${my}`,
    `L ${x2 - dir * r} ${my}`,
    `Q ${x2} ${my} ${x2} ${my - r}`,
    `L ${x2} ${y2}`,
  ].join(" ")
}

/** First token of an entity name — "DocumentVersion / DocumentPage" -> "DocumentVersion". */
function keyOf(name: string): string {
  return name.split(/[\s/,]+/)[0] ?? name
}

/** Strip an ORM type's optional/list decoration: `Message?` / `Tag[]` -> `Message`. */
function bareType(type: string | undefined): string {
  return String(type ?? "").replace(/[?[\]]/g, "").trim()
}

function isKeyField(f: { name: string; note?: string }): boolean {
  const n = f.note ?? ""
  return /\bPK\b|\bprimary key\b|\bunique\b/i.test(n) || /^id$/i.test(f.name)
}

export function DataModelDiagram({ entities }: { entities: DataEntity[] }) {
  // Group by source. A map with no sources at all still yields one group, so a
  // single-database project is unchanged by any of this.
  const groups = new Map<string, DataEntity[]>()
  for (const e of entities) {
    const src = e.source ?? ""
    if (!groups.has(src)) groups.set(src, [])
    groups.get(src)!.push(e)
  }
  const ordered = [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
  )

  const drawn = ordered
    .map(([source, group]) => ({ source, group, svg: buildDiagram(group) }))
    .filter((d) => d.svg !== null)

  if (drawn.length === 0) return null

  const [first, ...rest] = drawn

  return (
    <div className="flex flex-col gap-3">
      <Figure source={first.source} count={first.group.length} svg={first.svg!} />
      {rest.map((d) => (
        <details key={d.source} className="bg-card rounded-lg border">
          <summary className="text-2xs text-muted-foreground hover:text-foreground cursor-pointer px-4 py-3">
            <span className="font-mono">{shortSource(d.source)}</span>
            <span className="text-muted-foreground/70"> · {d.group.length} entities</span>
          </summary>
          <div className="px-4 pb-4">
            <Figure source={d.source} count={d.group.length} svg={d.svg!} bare />
          </div>
        </details>
      ))}
      {drawn.length > 1 && (
        <p className="text-2xs text-muted-foreground/70">
          One diagram per database: these schemas hold no foreign keys between
          them, so they are separate graphs rather than one.
        </p>
      )}
    </div>
  )
}

/** `apps/<name>/prisma/schema.prisma` -> `<name>`, else the raw path. */
function shortSource(source: string): string {
  const parts = source.split("/")
  const i = parts.indexOf("apps")
  if (i >= 0 && parts[i + 1]) return parts[i + 1]
  return source || "data model"
}

function Figure({
  source,
  count,
  svg,
  bare = false,
}: {
  source: string
  count: number
  svg: DiagramSvg
  bare?: boolean
}) {
  const body = (
    <>
      {/*
        Drawn at NATURAL size and scrolled, never scaled to fit. A wide schema
        shrunk into the column takes its 10px labels down to ~5 and the diagram
        stops being readable at all — the one thing it exists to be. Horizontal
        scroll costs a gesture; illegibility costs the whole figure.
      */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${svg.width} ${svg.height}`}
          width={svg.width}
          height={svg.height}
          role="img"
          aria-label={`Entity-relationship diagram for ${shortSource(source)}`}
        >
          {svg.content}
        </svg>
      </div>
      <p className="mt-3 text-2xs text-muted-foreground/70">
        <span className="font-mono">{shortSource(source)}</span> — each edge is a
        foreign key: the <span className="font-medium">crow&rsquo;s foot</span>{" "}
        marks the record holding it (many), the{" "}
        <span className="font-medium">arrow</span> points to the record it
        references (one).
        {svg.shownCount < count && (
          <>
            {" "}
            Drawing the {svg.shownCount} related of {count} entities here —
            unrelated tables and full field detail are below.
          </>
        )}
      </p>
    </>
  )
  if (bare) return body
  return <div className="bg-card rounded-lg border p-4">{body}</div>
}

interface DiagramSvg {
  content: React.ReactNode
  width: number
  height: number
  shownCount: number
}

/** Build one group's diagram, or null when nothing in it references anything. */
function buildDiagram(entities: DataEntity[]): DiagramSvg | null {
  const keys = entities.map((e) => keyOf(e.name))
  const keySet = new Set(keys)
  const indexByKey = new Map(keys.map((k, i) => [k, i]))

  // Edges: entity -> referenced entity. `refFields` remembers WHICH column
  // carries each reference, so the node can show the column beside the edge.
  const outgoing: Set<string>[] = entities.map(() => new Set<string>())
  const refFields: Map<string, string>[] = entities.map(() => new Map())
  entities.forEach((e, i) => {
    const self = keys[i]
    for (const f of e.fields ?? []) {
      // (a) the note spells the reference out
      for (const m of (f.note ?? "").matchAll(
        /(?:->|→|references?|FK\s+to)\s+([A-Z][A-Za-z0-9]+)/g
      )) {
        const target = m[1]
        if (keySet.has(target) && target !== self) {
          outgoing[i].add(target)
          if (!refFields[i].has(target)) refFields[i].set(target, f.name)
        }
      }
      // (b) the field's TYPE is another entity — an ORM relation field
      const t = bareType(f.type)
      if (t && keySet.has(t) && t !== self) {
        outgoing[i].add(t)
        if (!refFields[i].has(t)) refFields[i].set(t, f.name)
      }
    }
  })

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
  if (shown.size === 0) return null

  // Columns per node: the primary key, then the columns that carry the edges —
  // so a reader can see WHICH field points where rather than inferring it.
  const rowsFor = (i: number): { label: string; kind: "pk" | "fk" }[] => {
    const e = entities[i]
    const out: { label: string; kind: "pk" | "fk" }[] = []
    const seen = new Set<string>()
    for (const f of e.fields ?? []) {
      if (isKeyField(f) && !seen.has(f.name)) {
        out.push({ label: f.name, kind: "pk" })
        seen.add(f.name)
        break
      }
    }
    for (const [, field] of refFields[i]) {
      if (seen.has(field)) continue
      out.push({ label: field, kind: "fk" })
      seen.add(field)
    }
    return out.slice(0, MAX_ROWS)
  }

  const outAdj = new Map<number, number[]>()
  shown.forEach((i) => outAdj.set(i, []))
  edges.forEach(([s, t]) => outAdj.get(s)!.push(t))

  const layer = new Map<number, number>()
  const inProgress = new Set<number>()
  const computeLayer = (i: number): number => {
    const memo = layer.get(i)
    if (memo !== undefined) return memo
    if (inProgress.has(i)) return 0
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

  // Geometry. Node height is now CONTENT-driven (header + a row per column), so
  // each layer is spaced by its own tallest node rather than a fixed constant.
  const NODE_W = 178
  const HEAD_H = 24
  const ROW_H = 13
  const H_GAP = 26
  const V_GAP = 60
  const PAD = 18
  const nodeH = (i: number) => HEAD_H + rowsFor(i).length * ROW_H + (rowsFor(i).length ? 6 : 0)

  const rowWidth = (row: number[]) => row.length * NODE_W + (row.length - 1) * H_GAP
  const contentW = Math.max(...rows.map(rowWidth), NODE_W)
  const width = contentW + PAD * 2

  const layerH = rows.map((row) => Math.max(...row.map(nodeH), HEAD_H))
  const layerY: number[] = []
  let y = PAD
  layerH.forEach((h, l) => {
    layerY[l] = y
    y += h + (l < maxLayer ? V_GAP : 0)
  })
  const height = y + PAD

  const pos = new Map<number, { x: number; y: number }>()
  const centerX = new Map<number, number>()

  function bary(i: number): number {
    const targets = outAdj.get(i) ?? []
    const placed = targets.map((t) => centerX.get(t)).filter((x): x is number => x !== undefined)
    if (placed.length === 0) return centerX.get(i) ?? 0
    return placed.reduce((s, x) => s + x, 0) / placed.length
  }

  rows.forEach((row, l) => {
    const sorted =
      l === 0 ? [...row].sort((a, b) => a - b) : [...row].sort((a, b) => bary(a) - bary(b) || a - b)
    const startX = PAD + (contentW - rowWidth(sorted)) / 2
    sorted.forEach((i, j) => {
      const x = startX + j * (NODE_W + H_GAP)
      pos.set(i, { x, y: layerY[l] })
      centerX.set(i, x + NODE_W / 2)
    })
  })

  const content = (
    <>
      {edges.map(([s, t], k) => {
        const from = pos.get(s)
        const to = pos.get(t)
        if (!from || !to) return null
        const x1 = centerX.get(s)!
        const y1 = from.y
        const x2 = centerX.get(t)!
        const y2 = to.y + nodeH(t)
        return (
          <g key={`e${k}`} className="stroke-muted-foreground/45">
            <path d={orthogonal(x1, y1, x2, y2)} className="fill-none" strokeWidth={1} />
            <path
              d={`M ${x1} ${y1 - 9} L ${x1 - 5} ${y1} M ${x1} ${y1 - 9} L ${x1} ${y1} M ${x1} ${y1 - 9} L ${x1 + 5} ${y1}`}
              className="fill-none"
              strokeWidth={1}
            />
            <path
              d={`M ${x2 - 4} ${y2 + 6} L ${x2} ${y2} L ${x2 + 4} ${y2 + 6} Z`}
              className="fill-muted-foreground/60 stroke-none"
            />
          </g>
        )
      })}
      {[...shown].map((i) => {
        const p = pos.get(i)
        if (!p) return null
        const cols = rowsFor(i)
        const h = nodeH(i)
        return (
          <g key={`n${i}`}>
            <rect
              x={p.x}
              y={p.y}
              width={NODE_W}
              height={h}
              rx={6}
              className="fill-card stroke-border"
              strokeWidth={1}
            />
            {cols.length > 0 && (
              <line
                x1={p.x}
                y1={p.y + HEAD_H}
                x2={p.x + NODE_W}
                y2={p.y + HEAD_H}
                className="stroke-border"
                strokeWidth={1}
              />
            )}
            {/*
              Entity names run long in a namespaced schema, and SVG text does
              not wrap or clip to its box — an untruncated label simply draws
              over its neighbours. Truncate to what the node can hold and keep
              the full name in a <title>, which is both the tooltip and what a
              screen reader announces.
            */}
            <text
              x={p.x + NODE_W / 2}
              y={p.y + HEAD_H / 2}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-foreground font-mono text-2xs"
            >
              <title>{entities[i].name}</title>
              {truncate(keyOf(entities[i].name), NAME_CHARS)}
            </text>
            {cols.map((c, r) => (
              <text
                key={r}
                x={p.x + 8}
                y={p.y + HEAD_H + 6 + r * ROW_H + ROW_H / 2}
                dominantBaseline="central"
                className={
                  c.kind === "pk"
                    ? "fill-muted-foreground font-mono text-3xs"
                    : "fill-muted-foreground/80 font-mono text-3xs"
                }
              >
                <title>{c.label}</title>
                {c.kind === "pk" ? "◆ " : "↗ "}
                {truncate(c.label, COL_CHARS)}
              </text>
            ))}
          </g>
        )
      })}
    </>
  )

  return { content, width, height, shownCount: shown.size }
}
