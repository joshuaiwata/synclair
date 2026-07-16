---
name: product-summary
category: knowledge
layer: foundation
description: Generate or regenerate a project summary — the on-demand distilled views (briefs, diagrams, custom cuts) on the Summary tab of /synclair/knowledge. Use when asked to "regenerate the summary", "write the product brief", "make a diagram of X", when the summary queue (data/knowledge/summary-queue.json) has pending requests, or when the Summary tab shows "Knowledge changed since generated". The written counterpart of figma-distiller's flow — button queues, agent drains.
---

# Product summaries — on-demand distilled views

A summary is **a saved, versioned view of the project knowledge**: an audience
brief (the doc a product owner hands new team members), a diagram, or any
custom cut (FAQ page, glossary…). They live on the Summary tab of
`/synclair/knowledge`, defined in `data/knowledge/summaries/index.json`.

**The product is the subject.** Follow `project-identity`: describe the
product this project builds, keep Synclair/the foundation out of it entirely.

## The data model

`index.json` holds an array of summary definitions:

```json
{ "id": "executive-brief", "title": "Executive brief", "kind": "brief|diagram|custom",
  "instructions": "<the generation spec: audience, angle, what to cover>",
  "archived": false, "current": "<version id>", "versions": [{ "id", "createdAt", "note" }] }
```

Each version is an immutable markdown file `data/knowledge/summaries/<versionId>.md`.
`current` is a pointer; the UI's Restore moves it. **Never delete or rewrite a
version file or its entry** — history is the feature. Archived summaries stay
in the index (`archived: true`); they're hidden, not gone.

## The mechanism (mirror of figma-distiller)

The hub UI can't run AI. "Create & queue" / "Generate" / "Reprocess" append
`{ summaryId, requestedAt }` to `data/knowledge/summary-queue.json`; an agent
(you) drains it:

1. Read the queue; look up each request's definition in `index.json` — the
   `instructions` field is your spec, `kind` sets the format.
2. Write the markdown to `summaries/<summaryId>-<YYYY-MM-DD>.md` (append `-b`,
   `-c`… if taken; ids must match `^[a-z0-9][a-z0-9-]{0,63}$`).
3. In `index.json`: **append** to that summary's `versions` (`note` = one line
   of provenance) and point its `current` at the new id.
4. Remove the drained request(s) from the queue file.
5. Verify on `/synclair/knowledge` (dev server — the port from `.claude/launch.json`, 4100 by default), then commit the
   version + index + queue together.

## Sources — ground every claim

Read, in order: the `product-spec` digests (`references/*.md`); the project's
domain skill (if one exists) for personas and vocabulary; the knowledge
manifest (`lib/system/knowledge/sources.ts`) for what exists. Dig into raw
sources (via the `prd-retriever` agent, or any committed mirrors under
`data/knowledge/`) only where a digest is thin — and distill the durable part
back into `product-spec` (the flywheel).

**Never invent facts.** No dates, metrics, or commitments that aren't in the
sources. If the knowledge has no timeline, say what IS known (MVP scopes,
sequencing, dependencies) and name where dates would come from. An honest gap
beats a plausible guess — these docs onboard people.

## Format by kind

Author to the **`doc-quality`** standard — medium follows content shape (facts →
grid, like-items → table, relationships → diagram, layout → wireframe, narrative
→ sectioned prose), and a brief is never a wall of prose.

- **brief** — sections adapted to the audience in `instructions`. The exec
  default: What it is · Who it's for · The product areas · How the pieces
  reinforce · Where it stands · FAQ · Where to learn more. Designer lens:
  personas, usage contexts, key surfaces, where designs live. Engineer lens:
  entities and SOR boundaries, integration contracts, where specs live.
- **diagram** — markdown with **inline SVG** (rendered via `Markdown html`).
  Rules: `viewBox` + `width="100%"` + `style="max-width:…px"`; color ONLY with
  the app's CSS variables (`var(--card)`, `var(--border)`, `var(--foreground)`,
  `var(--muted-foreground)`, `var(--muted)`) so it themes with the app; no
  external refs/scripts; `role="img"` + `aria-label`; keep node text ≥9px; a
  short "Reading the map" caption below.
- **custom** — whatever `instructions` asks for, same grounding rules.

## Related

- `project-identity` — the lens; `product-spec` (+ the project's domain skill,
  if any) — the content.
- `figma-distiller` — the same queue-drain pattern for Figma pages.
