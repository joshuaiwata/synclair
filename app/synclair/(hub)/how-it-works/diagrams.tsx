/**
 * Vector graphics for the "How Synclair works" explainer. All are deterministic,
 * theme-token SVG (no raw hex, no arbitrary px) so they render server-side and
 * recolor in light/dark exactly like the rest of the hub — same convention as
 * `data-model-diagram.tsx`. Geometry lives in numeric SVG attributes (not class
 * strings), color/type in token utilities (`fill-*`, `stroke-*`, `text-*`).
 */

/** Shared frame: a bordered, scroll-safe card that holds one diagram. */
function DiagramFrame({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border bg-card/40 p-4">{children}</div>
}

/**
 * The centrepiece: humans and the AI they build with, reading from one surface.
 * Two cards (product team ↔ AI teammates) flanking an emphasized Synclair hub,
 * joined by two-way connectors — the "one shared surface" idea in one picture.
 */
export function SharedSurfaceDiagram() {
  return (
    <DiagramFrame>
      <svg
        viewBox="0 0 760 240"
        className="max-w-full"
        role="img"
        aria-label="Product team and AI teammates both reading from one shared Synclair surface"
      >
        {/* Connectors (drawn under the cards), two-way arrows both sides. */}
        <g className="stroke-muted-foreground/50" strokeWidth={1.5}>
          <line x1="212" y1="120" x2="298" y2="120" className="fill-none" />
          <line x1="462" y1="120" x2="548" y2="120" className="fill-none" />
        </g>
        <g className="fill-muted-foreground/70 stroke-none">
          <path d="M 298 120 L 289 115 L 289 125 Z" />
          <path d="M 212 120 L 221 115 L 221 125 Z" />
          <path d="M 462 120 L 471 115 L 471 125 Z" />
          <path d="M 548 120 L 539 115 L 539 125 Z" />
        </g>
        <text x="255" y="108" textAnchor="middle" className="fill-muted-foreground text-3xs">
          curate
        </text>
        <text x="505" y="108" textAnchor="middle" className="fill-muted-foreground text-3xs">
          build
        </text>

        {/* Left — the product team (humans). */}
        <g>
          <rect x="20" y="72" width="192" height="96" rx="12" className="fill-card stroke-border" strokeWidth={1} />
          <g className="fill-muted-foreground">
            <circle cx="94" cy="99" r="5" />
            <circle cx="116" cy="99" r="5" />
            <circle cx="138" cy="99" r="5" />
          </g>
          <text x="116" y="128" textAnchor="middle" className="fill-foreground text-sm font-semibold">
            Product team
          </text>
          <text x="116" y="147" textAnchor="middle" className="fill-muted-foreground text-2xs">
            PMs · design · engineering
          </text>
        </g>

        {/* Right — the AI teammates. */}
        <g>
          <rect x="548" y="72" width="192" height="96" rx="12" className="fill-card stroke-border" strokeWidth={1} />
          {/* Minimal robot glyph. */}
          <g className="fill-muted-foreground">
            <rect x="632" y="90" width="24" height="18" rx="4" />
            <rect x="643" y="83" width="2" height="7" />
            <circle cx="643" cy="82" r="2.5" />
          </g>
          <g className="fill-card">
            <circle cx="639" cy="99" r="2" />
            <circle cx="649" cy="99" r="2" />
          </g>
          <text x="644" y="128" textAnchor="middle" className="fill-foreground text-sm font-semibold">
            AI teammates
          </text>
          <text x="644" y="147" textAnchor="middle" className="fill-muted-foreground text-2xs">
            any agent &amp; its diggers
          </text>
        </g>

        {/* Center — the shared surface, emphasized. */}
        <g>
          <rect x="300" y="46" width="160" height="148" rx="16" className="fill-primary" />
          <text x="380" y="104" textAnchor="middle" className="fill-primary-foreground text-base font-semibold">
            Synclair
          </text>
          <text x="380" y="126" textAnchor="middle" className="fill-primary-foreground/80 text-2xs">
            one shared surface
          </text>
          <line x1="330" y1="140" x2="430" y2="140" className="stroke-primary-foreground/25" strokeWidth={1} />
          <text x="380" y="160" textAnchor="middle" className="fill-primary-foreground/70 text-3xs">
            tokens · components
          </text>
          <text x="380" y="174" textAnchor="middle" className="fill-primary-foreground/70 text-3xs">
            knowledge · context
          </text>
        </g>
      </svg>
      <p className="text-muted-foreground/70 mt-3 text-2xs">
        The same bytes power both sides — nobody works from a different truth.
      </p>
    </DiagramFrame>
  )
}

/** One station on the flywheel — a compact, uniform chip centred on a point. */
function WheelNode({
  cx,
  cy,
  title,
  sub,
}: {
  cx: number
  cy: number
  title: string
  sub: string
}) {
  const w = 152
  const h = 54
  return (
    <g>
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx="12" className="fill-card stroke-border" strokeWidth={1} />
      <text x={cx} y={cy - 3} textAnchor="middle" className="fill-foreground text-sm font-semibold">
        {title}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" className="fill-muted-foreground text-2xs">
        {sub}
      </text>
    </g>
  )
}

/**
 * The knowledge flywheel — three stations on a turning wheel. Diggers seed it
 * once (the dashed chip); from then on Build → Document → Knowledge spins
 * clockwise on its own, each turn leaving the hub richer. Geometry is computed
 * so the wheel stays symmetric and the rotation arrows ride true on the circle.
 */
export function FlywheelDiagram() {
  const C = { x: 472, y: 190, r: 130 }
  const rad = (d: number) => (d * Math.PI) / 180
  const pt = (deg: number, r = C.r) => ({
    x: C.x + r * Math.cos(rad(deg)),
    y: C.y + r * Math.sin(rad(deg)),
  })
  // Three stations 120° apart: Build (top), Document (lower-right), Knowledge
  // (lower-left). Arcs run edge-to-edge, leaving a gap where each chip sits.
  const GAP = 30
  const nodes = [-90, 30, 150]
  const segments = nodes.map((d, i) => ({ from: d + GAP, to: nodes[(i + 1) % 3] + (i === 2 ? 360 : 0) - GAP }))

  return (
    <DiagramFrame>
      <svg
        viewBox="0 0 720 350"
        className="max-w-full"
        role="img"
        aria-label="A knowledge flywheel: diggers seed the hub once, then Build, Document and Knowledge spin clockwise in a continuous loop"
      >
        {/* The wheel track. */}
        <circle cx={C.x} cy={C.y} r={C.r} className="fill-none stroke-border" strokeWidth={1} />

        {/* Rotation arrows — three arcs riding the circle, clockwise. Each is
            capped with an auto-oriented marker so all three arrowheads are
            identical in size and point true along the path (no manual rotation). */}
        <defs>
          <marker
            id="flywheel-arrow"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="11"
            markerHeight="11"
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
          </marker>
        </defs>
        <g className="fill-none stroke-primary" strokeWidth={2.5} strokeLinecap="round">
          {segments.map((s, i) => {
            const a = pt(s.from)
            const b = pt(s.to)
            return (
              <path
                key={i}
                d={`M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${C.r} ${C.r} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`}
                markerEnd="url(#flywheel-arrow)"
              />
            )
          })}
        </g>

        {/* Centre label — the hub the wheel turns around. */}
        <text x={C.x} y={C.y - 5} textAnchor="middle" className="fill-foreground text-base font-semibold">
          Knowledge
        </text>
        <text x={C.x} y={C.y + 15} textAnchor="middle" className="fill-foreground text-base font-semibold">
          flywheel
        </text>
        <text x={C.x} y={C.y + 33} textAnchor="middle" className="fill-muted-foreground text-2xs">
          faster every turn
        </text>

        {/* Priming — diggers seed the wheel once, before the loop takes over. */}
        <g>
          <rect x="20" y="163" width="150" height="54" rx="12" className="fill-primary/5 stroke-primary/40" strokeWidth={1.5} strokeDasharray="5 3" />
          <text x="95" y="187" textAnchor="middle" className="fill-foreground text-sm font-semibold">
            Diggers explore
          </text>
          <text x="95" y="204" textAnchor="middle" className="fill-muted-foreground text-2xs">
            code · PRDs · designs
          </text>
        </g>
        <path d="M 170 196 C 218 210, 246 226, 286 240" className="fill-none stroke-muted-foreground/50" strokeWidth={1.5} strokeDasharray="4 3" />
        <path d="M 286 240 L 275 237 L 279 247 Z" className="fill-muted-foreground/70" />
        <text x="226" y="214" textAnchor="middle" className="fill-muted-foreground text-3xs">
          seeds it once
        </text>

        {/* The three stations, on the wheel. */}
        <WheelNode cx={472} cy={60} title="Build" sub="a view or component" />
        <WheelNode cx={585} cy={255} title="Document" sub="as you build" />
        <WheelNode cx={359} cy={255} title="Knowledge" sub="next build starts here" />
      </svg>
    </DiagramFrame>
  )
}

/**
 * One source, two renderings — a single data source projected to a human page
 * and a machine-readable form, so the two can't drift.
 */
export function TwoRenderingsDiagram() {
  return (
    <DiagramFrame>
      <svg
        viewBox="0 0 720 200"
        className="max-w-full"
        role="img"
        aria-label="One source projected two ways: a human HTML view and a machine-readable agent view"
      >
        {/* Fork connectors. */}
        <g className="fill-none stroke-muted-foreground/50" strokeWidth={1.5}>
          <path d="M 232 108 C 340 108, 340 66, 452 66" />
          <path d="M 232 108 C 340 108, 340 150, 452 150" />
        </g>
        <g className="fill-muted-foreground/70">
          <path d="M 452 66 L 443 61 L 443 71 Z" />
          <path d="M 452 150 L 443 145 L 443 155 Z" />
        </g>

        {/* Source. */}
        <g>
          <rect x="24" y="76" width="208" height="64" rx="12" className="fill-primary" />
          <text x="128" y="104" textAnchor="middle" className="fill-primary-foreground text-sm font-semibold">
            One source
          </text>
          <text x="128" y="123" textAnchor="middle" className="fill-primary-foreground/80 font-mono text-2xs">
            lib/system/* · data/*
          </text>
        </g>

        {/* Human view. */}
        <g>
          <rect x="452" y="38" width="244" height="56" rx="12" className="fill-card stroke-border" strokeWidth={1} />
          <text x="490" y="63" className="fill-foreground text-sm font-semibold">
            Human view
          </text>
          <text x="490" y="81" className="fill-muted-foreground text-2xs">
            browsable HTML pages
          </text>
        </g>

        {/* Agent view. */}
        <g>
          <rect x="452" y="122" width="244" height="56" rx="12" className="fill-card stroke-border" strokeWidth={1} />
          <text x="490" y="147" className="fill-foreground text-sm font-semibold">
            Agent view
          </text>
          <text x="490" y="165" className="fill-muted-foreground text-2xs">
            machine-readable context
          </text>
        </g>
      </svg>
      <p className="text-muted-foreground/70 mt-3 text-2xs">
        Both are projected from the same bytes, so the docs humans read and the context
        agents load can never disagree.
      </p>
    </DiagramFrame>
  )
}

/**
 * A friendly robot head — the face of the agent crew. Pure token-themed SVG so
 * it recolors with the theme. Sized by the caller via `className`.
 */
export function RobotHead({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 172" className={className} role="img" aria-label="A friendly robot">
      {/* Antenna. */}
      <line x1="80" y1="20" x2="80" y2="40" className="stroke-primary" strokeWidth={3} />
      <circle cx="80" cy="16" r="6" className="fill-primary" />
      {/* Ears. */}
      <rect x="26" y="82" width="12" height="34" rx="5" className="fill-muted-foreground/40" />
      <rect x="122" y="82" width="12" height="34" rx="5" className="fill-muted-foreground/40" />
      {/* Head. */}
      <rect x="34" y="40" width="92" height="96" rx="22" className="fill-card stroke-border" strokeWidth={3} />
      {/* Eyes. */}
      <circle cx="62" cy="80" r="11" className="fill-primary" />
      <circle cx="98" cy="80" r="11" className="fill-primary" />
      <circle cx="59" cy="77" r="3.5" className="fill-card" />
      <circle cx="95" cy="77" r="3.5" className="fill-card" />
      {/* Smile. */}
      <path d="M 60 106 Q 80 120 100 106" className="fill-none stroke-primary" strokeWidth={3} strokeLinecap="round" />
    </svg>
  )
}
