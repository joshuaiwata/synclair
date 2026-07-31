import type { KnowledgeSource } from "./types"

/**
 * A distilled digest that lives in-repo as markdown and can be opened in the app
 * drawer (vs. an external Figma/Doc/GitHub link that opens a new tab).
 */
export interface InAppDoc {
  /** `<skill>:references/<path>.md` — the server action resolves this to a file. */
  ref: string
  skill: string
  /** Repo-relative path, for display. */
  path: string
  /** Bare filename, for the drawer subtitle. */
  file: string
}

// A digest reference inside `distilledInto`, in either spelling: the token form
// `<skill>:references/…​.md`, or the repo-path form
// `.claude/skills/<skill>/references/…​.md` (what intake agents naturally write).
// Dots are disallowed in the path (except the `.md`) so `..` can never match —
// the server action re-checks containment regardless.
const DOC_RE = /([a-z0-9-]+):(references\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.md)/
const DOC_PATH_RE =
  /\.claude\/skills\/([a-z0-9-]+)\/(references\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.md)/

/**
 * Whether a source's distillation is an in-repo markdown digest we can render
 * in-app. Returns null for prose distillations (e.g. "lib/system/tokens.ts …")
 * and external-only sources — those keep their new-tab link.
 */
export function resolveInAppDoc(source: KnowledgeSource): InAppDoc | null {
  const match =
    source.distilledInto?.match(DOC_RE) ?? source.distilledInto?.match(DOC_PATH_RE)
  if (!match) return null
  const [, skill, path] = match
  return {
    ref: `${skill}:${path}`,
    skill,
    path: `.claude/skills/${skill}/${path}`,
    file: path.split("/").pop()!,
  }
}

/** An http(s) link that must open externally; internal ("/…") ones stay in-app. */
export function isExternalUrl(url: string | undefined): boolean {
  return !!url && /^https?:\/\//.test(url)
}
