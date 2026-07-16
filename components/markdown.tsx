import ReactMarkdown from "react-markdown"
import rehypeRaw from "rehype-raw"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"

/**
 * Renders markdown in the app's neutral, dense voice (no typography plugin).
 * `html` additionally renders raw HTML in the source — inline SVG diagrams in
 * particular (they inherit the app's CSS variables, so tokens theme them).
 * Only enable it for repo-committed content, never for external input.
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
        rehypePlugins={html ? [rehypeRaw] : []}
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
