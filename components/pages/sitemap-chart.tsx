import type { SitemapDatum } from "@/components/pages/sitemap-tree"
import { synclair } from "@/lib/system/routes"

/**
 * The sitemap as a branched chart — boxes for views, elbow connectors for the
 * route hierarchy, laid out left-to-right (root on the left, children flowing
 * right). Same house style as the System Map's DataModelDiagram: a pure server
 * component drawing deterministic SVG themed by tokens, in a horizontally
 * scrolling frame. Left-to-right (not top-down) because a route tree has many
 * siblings per parent — stacking them vertically stays readable where a wide
 * org-chart would not. Page-node boxes link to their detail page.
 */

const COL_W = 220
const ROW_H = 44
const BOX_W = 188
const BOX_H = 34
const PAD = 20

interface Placed extends SitemapDatum {
  x: number
  y: number
  depth: number
}

export function SitemapChart({ nodes }: { nodes: SitemapDatum[] }) {
  const placed: Placed[] = []
  const edges: { from: Placed; to: Placed }[] = []
  let leaf = 0
  let maxDepth = 0

  const layout = (node: SitemapDatum, depth: number): Placed => {
    maxDepth = Math.max(maxDepth, depth)
    const x = PAD + depth * COL_W
    let y: number
    const kids = node.children.map((c) => layout(c, depth + 1))
    if (kids.length === 0) {
      y = PAD + leaf * ROW_H
      leaf += 1
    } else {
      y = (kids[0].y + kids[kids.length - 1].y) / 2
    }
    const self: Placed = { ...node, x, y, depth }
    placed.push(self)
    for (const k of kids) edges.push({ from: self, to: k })
    return self
  }
  for (const n of nodes) layout(n, 0)

  if (placed.length === 0) return null

  const width = PAD * 2 + maxDepth * COL_W + BOX_W
  const height = PAD * 2 + Math.max(leaf, 1) * ROW_H

  return (
    <div className="overflow-x-auto rounded-lg border bg-card p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="max-w-full"
        role="img"
        aria-label="Branched sitemap of the app's routes"
      >
        {/* Connectors, under the boxes: horizontal cubic from a parent's right edge to a child's left edge. */}
        {edges.map(({ from, to }, i) => {
          const x1 = from.x + BOX_W
          const y1 = from.y + BOX_H / 2
          const x2 = to.x
          const y2 = to.y + BOX_H / 2
          const mx = (x1 + x2) / 2
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
              className="stroke-muted-foreground/40 fill-none"
              strokeWidth={1}
            />
          )
        })}
        {/* Boxes. Page nodes link to their detail; grouping nodes are static. */}
        {placed.map((n) => {
          const label = truncate(n.title || (n.seg === "/" ? "Home" : n.seg), 24)
          const box = (
            <g>
              <rect
                x={n.x}
                y={n.y}
                width={BOX_W}
                height={BOX_H}
                rx={6}
                className={
                  n.id
                    ? "fill-card stroke-border"
                    : "fill-muted/40 stroke-border/60"
                }
                strokeWidth={1}
              />
              <text
                x={n.x + 12}
                y={n.y + BOX_H / 2}
                dominantBaseline="central"
                className={n.id ? "fill-foreground text-2xs" : "fill-muted-foreground text-2xs"}
              >
                {label}
              </text>
              {n.dynamic && (
                <circle cx={n.x + BOX_W - 12} cy={n.y + BOX_H / 2} r={3} className="fill-muted-foreground/40" />
              )}
              <title>{n.route}</title>
            </g>
          )
          return n.id ? (
            <a key={n.key} href={synclair(`/pages/${n.id}`)} className="[&:hover_rect]:stroke-foreground">
              {box}
            </a>
          ) : (
            <g key={n.key}>{box}</g>
          )
        })}
      </svg>
      <p className="text-muted-foreground/70 mt-3 text-2xs">
        Route hierarchy left-to-right — filled boxes are pages (click to open), muted boxes are
        grouping paths. A dot marks a dynamic route.
      </p>
    </div>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s
}
