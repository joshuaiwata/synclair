"use client"

/**
 * Entity-relationship diagrams for the System Map's Data model tab.
 *
 * ── WHY THIS IS A CANVAS ─────────────────────────────────────────────────────
 * This was server-rendered SVG, which is cheaper in every way except the one
 * that mattered: a static image has no viewport, so it cannot zoom. A real
 * schema is either drawn small enough to fit — labels below legibility — or
 * drawn legibly and scrolled past a slot at a time. Neither lets you see the
 * shape AND read a column, which is the whole job. So: a pannable, zoomable
 * canvas, at the cost of the diagram no longer being in the initial HTML.
 *
 * ── WHAT IS *NOT* DELEGATED ──────────────────────────────────────────────────
 * The LAYOUT. React Flow renders nodes at positions you give it; it does not
 * place them, and the usual reach for a force-directed pass is a mistake here —
 * a physics sim settles differently on every visit, so the same schema is a
 * different picture each time you open it and nothing is memorable. Positions
 * stay deterministic: reference layers (parents above the children pointing at
 * them), each row ordered by the barycentre of its already-placed targets to cut
 * crossings. Same input, same picture, every time.
 *
 * ── ONE DIAGRAM PER SOURCE ───────────────────────────────────────────────────
 * A service-per-database system has no foreign keys BETWEEN its databases, so a
 * single canvas over every entity is not one graph — it is N disconnected
 * islands ranked against each other for space, and the largest schema silently
 * takes every slot.
 *
 * ── EDGES ────────────────────────────────────────────────────────────────────
 * From a field NOTE that spells the reference out ("FK -> Team"), or a field
 * TYPE that names another entity ("owner: Team"). A LIST type is excluded: it is
 * the BACK-relation, whose foreign key lives on the other record. Counting lists
 * gives every relation an edge in both directions, which cycles each pair and
 * collapses the layering — the visible symptom being child tables floating
 * unconnected above their parent.
 */
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useMemo, useState } from "react"

import type { DataEntity } from "@/lib/system/system-map"

/** Safety valve per diagram — a budget for pathological schemas, not a target. */
const MAX_NODES = 60
/** Columns drawn before a node summarises the rest. Zoom makes this generous. */
const MAX_ROWS = 20

const NODE_W = 232
const HEAD_H = 30
const ROW_H = 17
const H_GAP = 56
const V_GAP = 96

/** Canvas height. Tall enough to orient in, short enough to scroll past. */
const CANVAS_H = 560

function keyOf(name: string): string {
  return name.split(/[\s/,]+/)[0] ?? name
}

/**
 * The entity a field REFERENCES, or "" when it does not reference one. Lists are
 * back-relations — see the header note.
 */
function referencedEntity(type: string | undefined): string {
  const raw = String(type ?? "").trim()
  if (raw.endsWith("[]")) return ""
  return raw.replace(/[?[\]]/g, "").trim()
}

function isKeyField(f: { name: string; note?: string }): boolean {
  const n = f.note ?? ""
  return /\bPK\b|\bprimary key\b|\bunique\b/i.test(n) || /^id$/i.test(f.name)
}

interface Col {
  name: string
  type: string
  kind: "pk" | "fk" | "plain"
}

type TableNodeData = { label: string; cols: Col[]; extra: number }

/**
 * One table. Handles are on the top and bottom edges only, matching the layered
 * layout: a child's TOP connects up to its parent's BOTTOM, so every edge runs
 * the same direction and the arrow always means "references".
 */
function TableNode({ data }: NodeProps<Node<TableNodeData>>) {
  return (
    <div className="bg-card border-border overflow-hidden rounded-md border shadow-sm">
      <Handle type="source" position={Position.Top} className="!bg-muted-foreground/40 !h-1 !w-1 !border-0" />
      <div className="border-border text-2xs bg-muted/40 truncate border-b px-2 py-1.5 text-center font-mono font-medium">
        {data.label}
      </div>
      <div className="py-1">
        {data.cols.map((c) => (
          <div key={c.name} className="text-3xs flex items-baseline gap-1.5 px-2 py-px font-mono">
            <span className="text-muted-foreground/60 w-2 shrink-0">
              {c.kind === "pk" ? "◆" : c.kind === "fk" ? "↗" : ""}
            </span>
            <span
              className={
                c.kind === "plain" ? "text-muted-foreground truncate" : "text-foreground truncate"
              }
            >
              {c.name}
            </span>
            <span className="text-muted-foreground/50 ml-auto shrink-0 truncate">{c.type}</span>
          </div>
        ))}
        {data.extra > 0 && (
          <div className="text-3xs text-muted-foreground/60 px-2 py-px font-mono">
            +{data.extra} more
          </div>
        )}
      </div>
      <Handle type="target" position={Position.Bottom} className="!bg-muted-foreground/40 !h-1 !w-1 !border-0" />
    </div>
  )
}

const nodeTypes = { table: TableNode }

export function DataModelDiagram({ entities }: { entities: DataEntity[] }) {
  /**
   * EVERY source gets an entry, including those that produce no graph. A
   * database whose tables hold no foreign keys to each other is a real and
   * interesting thing to find; dropping it silently reads as missing data, and
   * the reader has no way to tell "nothing to draw" from "we failed to draw it".
   */
  const groups = useMemo(() => {
    const g = new Map<string, DataEntity[]>()
    for (const e of entities) {
      const src = e.source ?? ""
      if (!g.has(src)) g.set(src, [])
      g.get(src)!.push(e)
    }
    return [...g.entries()]
      .map(([source, group]) => ({ source, group, graph: buildGraph(group) }))
      .sort((a, b) => b.group.length - a.group.length || a.source.localeCompare(b.source))
  }, [entities])

  const [selected, setSelected] = useState(0)

  if (groups.length === 0) return null
  const active = groups[Math.min(selected, groups.length - 1)]

  return (
    <div className="flex flex-col gap-3">
      {/*
        A PICKER, not stacked disclosures. These databases are peers — one being
        larger is not a reason to present it as the subject and the others as
        footnotes, which is exactly what "biggest open, rest collapsed" said.
        One at a time, equal weight, and the counts make the shape of the whole
        visible without opening anything.
      */}
      {groups.length > 1 && (
        <div role="tablist" aria-label="Database" className="flex flex-wrap gap-1">
          {groups.map((d, i) => {
            const on = i === (selected < groups.length ? selected : 0)
            return (
              <button
                key={d.source}
                role="tab"
                aria-selected={on}
                type="button"
                onClick={() => setSelected(i)}
                className={[
                  "text-2xs rounded-md border px-2.5 py-1.5 font-mono transition-colors",
                  on
                    ? "border-border bg-muted text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                ].join(" ")}
              >
                {shortSource(d.source)}
                <span className="text-muted-foreground/60 ml-1.5">{d.group.length}</span>
                {d.graph === null && (
                  <span className="text-muted-foreground/50 ml-1.5" title="No foreign keys between these tables">
                    ·
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {active.graph ? (
        <Canvas source={active.source} count={active.group.length} graph={active.graph} />
      ) : (
        <Standalone source={active.source} count={active.group.length} />
      )}

      {groups.length > 1 && (
        <p className="text-2xs text-muted-foreground/70">
          One diagram per database. These schemas hold no foreign keys between
          them — cross-database ids are resolved in application code — so they
          are separate graphs rather than one.
        </p>
      )}
    </div>
  )
}

/**
 * A database whose tables reference nothing internally. Said out loud rather
 * than rendered as an empty frame: the absence of a graph is the finding.
 */
function Standalone({ source, count }: { source: string; count: number }) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <div
        className="border-border text-muted-foreground flex items-center justify-center rounded-md border border-dashed px-6 text-center"
        style={{ height: CANVAS_H / 2 }}
      >
        <p className="text-2xs max-w-sm">
          <span className="text-foreground font-mono">{shortSource(source)}</span>{" "}
          holds {count} table{count === 1 ? "" : "s"} with{" "}
          <span className="text-foreground font-medium">
            no foreign keys between them
          </span>
          . There is no graph to draw — not a gap in the map. Each table stands
          alone; their field detail is below.
        </p>
      </div>
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

interface Graph {
  nodes: Node<TableNodeData>[]
  edges: Edge[]
  shownCount: number
}

function Canvas({
  source,
  count,
  graph,
  bare = false,
}: {
  source: string
  count: number
  graph: Graph
  bare?: boolean
}) {
  const body = (
    <>
      <div className="border-border overflow-hidden rounded-md border" style={{ height: CANVAS_H }}>
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: false }}
          nodesConnectable={false}
          edgesFocusable={false}
          /* Dragging a node is allowed — rearranging to follow a relationship is
             the point of a canvas — but it never persists, so a reload is always
             the deterministic layout again. */
          nodesDraggable
        >
          <Background gap={16} size={1} className="!bg-transparent" />
          <Controls showInteractive={false} />
          {graph.nodes.length > 12 && <MiniMap pannable zoomable className="!bg-card" />}
        </ReactFlow>
      </div>
      <p className="mt-3 text-2xs text-muted-foreground/70">
        <span className="font-mono">{shortSource(source)}</span> — each edge is a
        foreign key, drawn from the record holding it to the record it
        references. <span className="font-medium">◆</span> primary key,{" "}
        <span className="font-medium">↗</span> foreign key. Scroll to zoom, drag
        to pan.
        {graph.shownCount < count && (
          <>
            {" "}
            Drawing the {graph.shownCount} related of {count} entities here —
            unrelated tables and full field detail are below.
          </>
        )}
      </p>
    </>
  )
  if (bare) return body
  return <div className="bg-card rounded-lg border p-4">{body}</div>
}

/** Build one group's graph, or null when nothing in it references anything. */
function buildGraph(entities: DataEntity[]): Graph | null {
  const keys = entities.map((e) => keyOf(e.name))
  const keySet = new Set(keys)
  const indexByKey = new Map(keys.map((k, i) => [k, i]))

  const outgoing: Set<string>[] = entities.map(() => new Set<string>())
  const refFields: Map<string, string>[] = entities.map(() => new Map())
  entities.forEach((e, i) => {
    const self = keys[i]
    for (const f of e.fields ?? []) {
      for (const m of (f.note ?? "").matchAll(
        /(?:->|→|references?|FK\s+to)\s+([A-Z][A-Za-z0-9]+)/g
      )) {
        const t = m[1]
        if (keySet.has(t) && t !== self) {
          outgoing[i].add(t)
          if (!refFields[i].has(t)) refFields[i].set(t, f.name)
        }
      }
      const t = referencedEntity(f.type)
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
  const included = new Set(
    entities
      .map((_, i) => i)
      .filter((i) => degree[i] > 0)
      .sort((a, b) => degree[b] - degree[a] || a - b)
      .slice(0, MAX_NODES)
  )

  const pairs: [number, number][] = []
  included.forEach((i) =>
    outgoing[i].forEach((t) => {
      const ti = indexByKey.get(t)
      if (ti !== undefined && included.has(ti)) pairs.push([i, ti])
    })
  )
  const shown = new Set<number>()
  pairs.forEach(([s, t]) => {
    shown.add(s)
    shown.add(t)
  })
  if (shown.size === 0) return null

  // Columns: every field, marked. The FK marker uses the columns that actually
  // carry an edge, so a reader can trace an arrow back to its field.
  const fkNames = (i: number) => new Set(refFields[i].values())
  const colsFor = (i: number): { cols: Col[]; extra: number } => {
    const fks = fkNames(i)
    const all: Col[] = (entities[i].fields ?? [])
      // Relation-only fields (no column of their own) would read as duplicates
      // of the scalar that holds the key, so they are left out.
      .filter((f) => !keySet.has(referencedEntity(f.type)) || !refFields[i].size)
      .map((f) => ({
        name: f.name,
        type: String(f.type ?? ""),
        kind: isKeyField(f) ? "pk" : fks.has(f.name) ? "fk" : "plain",
      }))
    return { cols: all.slice(0, MAX_ROWS), extra: Math.max(0, all.length - MAX_ROWS) }
  }

  const outAdj = new Map<number, number[]>()
  shown.forEach((i) => outAdj.set(i, []))
  pairs.forEach(([s, t]) => outAdj.get(s)!.push(t))

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

  const cols = new Map<number, { cols: Col[]; extra: number }>()
  shown.forEach((i) => cols.set(i, colsFor(i)))
  const nodeH = (i: number) => {
    const c = cols.get(i)!
    return HEAD_H + (c.cols.length + (c.extra ? 1 : 0)) * ROW_H + 8
  }

  const layerH = rows.map((row) => Math.max(...row.map(nodeH), HEAD_H))
  const layerY: number[] = []
  let y = 0
  layerH.forEach((h, l) => {
    layerY[l] = y
    y += h + (l < maxLayer ? V_GAP : 0)
  })

  const pos = new Map<number, { x: number; y: number }>()
  const centerX = new Map<number, number>()
  const rowWidth = (row: number[]) => row.length * NODE_W + (row.length - 1) * H_GAP
  const contentW = Math.max(...rows.map(rowWidth), NODE_W)

  function bary(i: number): number {
    const targets = outAdj.get(i) ?? []
    const placed = targets.map((t) => centerX.get(t)).filter((x): x is number => x !== undefined)
    if (placed.length === 0) return centerX.get(i) ?? 0
    return placed.reduce((s, x) => s + x, 0) / placed.length
  }

  rows.forEach((row, l) => {
    const sorted =
      l === 0 ? [...row].sort((a, b) => a - b) : [...row].sort((a, b) => bary(a) - bary(b) || a - b)
    const startX = (contentW - rowWidth(sorted)) / 2
    sorted.forEach((i, j) => {
      const x = startX + j * (NODE_W + H_GAP)
      pos.set(i, { x, y: layerY[l] })
      centerX.set(i, x + NODE_W / 2)
    })
  })

  const nodes: Node<TableNodeData>[] = [...shown].map((i) => {
    const c = cols.get(i)!
    return {
      id: String(i),
      type: "table",
      position: pos.get(i)!,
      width: NODE_W,
      data: { label: keyOf(entities[i].name), cols: c.cols, extra: c.extra },
      draggable: true,
    }
  })

  const edges: Edge[] = pairs.map(([s, t], k) => ({
    id: `e${k}-${s}-${t}`,
    source: String(s),
    target: String(t),
    // Orthogonal routing: right angles share corridors, so a bundle of edges
    // reads as routes rather than a knot. Curves stop being followable at scale.
    type: "smoothstep",
    markerEnd: { type: "arrowclosed" as never, width: 14, height: 14 },
    style: { strokeWidth: 1 },
  }))

  return { nodes, edges, shownCount: shown.size }
}
