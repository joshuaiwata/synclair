import { Markdown } from "@/components/markdown"

/**
 * Splits a leading `# Title` line off a markdown string so the shell can render
 * the title consistently (instead of letting each doc's first heading set its
 * own size). Returns `title: null` when the content has no leading H1.
 */
export function splitLeadingTitle(md: string): { title: string | null; body: string } {
  const m = md.match(/^\s*#\s+(.+?)\s*(?:\n|$)/)
  if (!m) return { title: null, body: md }
  return { title: m[1].trim(), body: md.slice(m[0].length) }
}

/**
 * The one shell every distilled summary renders through — Knowledge briefs, the
 * System Map overview, and any future summary. It normalizes the *shape*: a
 * bordered panel opening with one consistent title treatment, then the markdown
 * body. Source docs no longer decide their own title size — the title comes from
 * the leading `#` (stripped from the body) or `fallbackTitle`, so every summary
 * opens the same way regardless of how its markdown was authored.
 */
export function SummaryShell({
  content,
  fallbackTitle,
  meta,
  html = false,
}: {
  content: string
  fallbackTitle?: string
  meta?: React.ReactNode
  html?: boolean
}) {
  const { title, body } = splitLeadingTitle(content)
  const finalTitle = title ?? fallbackTitle
  return (
    <div className="rounded-lg border bg-card p-5">
      {finalTitle && (
        <div className="mb-5 border-b pb-4">
          <h2 className="text-2xl font-bold tracking-tight text-balance">{finalTitle}</h2>
          {meta && <div className="text-muted-foreground mt-1 font-mono text-xs">{meta}</div>}
        </div>
      )}
      <Markdown html={html}>{body}</Markdown>
    </div>
  )
}
