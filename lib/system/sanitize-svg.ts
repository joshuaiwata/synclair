/**
 * Defense-in-depth scrub for repo-committed SVG that gets injected via
 * `dangerouslySetInnerHTML` (seed brand marks, foundation icon grids). The
 * seed is nominally trusted, but "trusted" repo data is exactly the
 * supply-chain surface — a poisoned checkout must not execute in the hub,
 * whose server actions are same-origin. Strips executable vectors while
 * leaving presentation SVG untouched:
 *
 *  - <script>/<foreignObject>/<iframe>/<object>/<embed> elements (paired or void)
 *  - on* event-handler attributes
 *  - javascript: URLs in href/xlink:href/src
 *
 * For UNtrusted or external content, don't reach for this — render through
 * the sanitized Markdown pipeline (components/markdown.tsx) instead.
 */
export function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<\s*(script|foreignObject|iframe|object|embed)\b[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|foreignObject|iframe|object|embed)\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/((?:xlink:)?href|src)\s*=\s*(['"]?)\s*javascript:[^'">\s]*\2/gi, '$1=$2#$2')
}
