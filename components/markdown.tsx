import ReactMarkdown from "react-markdown"
import rehypeRaw from "rehype-raw"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"

/**
 * Sanitizer schema for `html` mode: the default safe HTML set plus the inline
 * SVG vocabulary our diagrams use. Everything else — event handlers, <script>,
 * <foreignObject>, javascript: URLs — is stripped, so a poisoned summary or
 * digest file can't execute in the hub (whose server actions it could
 * otherwise call, same-origin).
 */
const SVG_SCHEMA = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline",
    "polygon", "text", "tspan", "defs", "marker", "title", "desc",
    "linearGradient", "radialGradient", "stop",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className", "id"],
    svg: ["viewBox", "width", "height", "fill", "stroke", "strokeWidth", "xmlns", "role", "ariaLabel"],
    g: ["fill", "stroke", "strokeWidth", "transform", "opacity"],
    path: ["d", "fill", "stroke", "strokeWidth", "strokeLinecap", "strokeLinejoin", "strokeDasharray", "opacity", "markerEnd", "markerStart", "transform"],
    rect: ["x", "y", "width", "height", "rx", "ry", "fill", "stroke", "strokeWidth", "strokeDasharray", "opacity", "transform"],
    circle: ["cx", "cy", "r", "fill", "stroke", "strokeWidth", "opacity"],
    ellipse: ["cx", "cy", "rx", "ry", "fill", "stroke", "strokeWidth", "opacity"],
    line: ["x1", "y1", "x2", "y2", "stroke", "strokeWidth", "strokeDasharray", "markerEnd", "opacity"],
    polyline: ["points", "fill", "stroke", "strokeWidth", "opacity"],
    polygon: ["points", "fill", "stroke", "strokeWidth", "opacity"],
    text: ["x", "y", "dx", "dy", "fill", "fontSize", "fontWeight", "fontFamily", "textAnchor", "dominantBaseline", "transform", "opacity"],
    tspan: ["x", "y", "dx", "dy", "fill", "fontSize", "fontWeight"],
    marker: ["id", "viewBox", "refX", "refY", "markerWidth", "markerHeight", "orient"],
    linearGradient: ["id", "x1", "y1", "x2", "y2", "gradientUnits"],
    radialGradient: ["id", "cx", "cy", "r", "gradientUnits"],
    stop: ["offset", "stopColor", "stopOpacity"],
  },
} as typeof defaultSchema

/**
 * Renders markdown in the app's neutral, dense voice (no typography plugin).
 * `html` additionally renders raw HTML in the source — inline SVG diagrams in
 * particular (they inherit the app's CSS variables, so tokens theme them).
 * `html` content is sanitized (SVG_SCHEMA): repo-committed diagrams render,
 * scripts and event handlers never do — machine-generated summaries are data,
 * not audited prose.
 */
export function Markdown({
  children,
  className,
  html = false,
}: {
  children: string
  className?: string
  html?: boolean
}) {
  return (
    <div className={cn("text-foreground text-sm leading-relaxed break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={html ? [rehypeRaw, [rehypeSanitize, SVG_SCHEMA]] : []}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-6 mb-3 text-lg font-semibold first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-6 mb-2 text-base font-semibold first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-5 mb-2 text-sm font-semibold first:mt-0">{children}</h3>
          ),
          p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => (
            <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ className: codeClassName, children }) => {
            const isBlock = /language-/.test(codeClassName ?? "")
            if (isBlock) {
              return <code className={cn("font-mono text-xs", codeClassName)}>{children}</code>
            }
            return (
              <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre className="bg-muted/50 my-3 overflow-x-auto rounded-lg border p-3 text-xs">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="text-muted-foreground my-3 border-l-2 pl-3">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-border my-4" />,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b px-2 py-1 text-left font-medium">{children}</th>
          ),
          td: ({ children }) => <td className="border-b px-2 py-1 align-top">{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
