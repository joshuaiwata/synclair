---
name: doc-quality
category: foundation
layer: foundation
description: The presentation standard for every distilled knowledge artifact Synclair generates — Knowledge summaries, the System Map, UX docs, References, product summaries. Use when authoring or reviewing any generated "read" — deciding whether something should be prose, a table, a diagram, or a wireframe; formatting it for scan; and framing it consistently with its siblings so Synclair stays one system, not a Frankenstein of one-off layouts. The rubric the `doc-quality-reviewer` enforces and every generator authors against.
---

# Doc quality — the standard for distilled artifacts

Synclair's whole promise is *one aligned source of truth*. A UI where the
Knowledge summary is a bordered card, the System Map summary is a bare column,
and every diagram is drawn its own way breaks that promise — it becomes a
Frankenstein. This is the shared standard so every generated **read** looks and
reads like it came from the same system.

**Applies to** the distilled artifacts Synclair *generates*: Knowledge summaries
(`product-summary`), the System Map (`codebase-map`), UX docs (`ux-doc`), Figma
digests (`figma-distiller`), References. **Not** raw source, and **not** live UI
screens — visual correctness of a built screen is `ui-visual-validator`'s job.

## 1. Medium follows content shape

The first question is never "how do I word this paragraph" — it's **"is prose
even the right medium?"** Most orientation content is *not* best as prose. Match
the shape:

| The content is… | Render it as… | Not as… |
|---|---|---|
| A run of labeled facts (a stack, a config, key numbers) | a **labeled grid / definition list** — `label` + `value` cells | a run-on paragraph of bolded terms |
| A set of like items with attributes | a **table** | repeated prose or bullet clumps |
| Entities + relationships (a data model, a dependency map) | a **diagram** (§3) | a table alone, if shape matters |
| The anatomy / layout of a screen or component | a **wireframe** (`wireframe-kit`) | a description of where things sit |
| A flow, sequence, or ordered procedure | a **step ladder / numbered sequence** | a paragraph with "first… then…" |
| Genuine narrative / orientation ("how this fits together") | **prose — but sectioned** (§2) | one undifferentiated wall |

A wall of prose is the default failure mode. If a reader has to *read* to find
what they could have *scanned*, the medium is wrong.

## 2. When it is prose, format it for scan

- **Section it.** More than ~2 paragraphs → break into headed sections
  (`## What it is` / `## How a request flows` / `## Where state lives` / `## Gaps`).
  Lead each with its answer.
- **Bold the load-bearing nouns**, `code`-format every real path / identifier so
  the eye lands on them.
- **One idea per section.** If a section earns a caveat, give it its own "Gaps &
  caveats" heading rather than trailing it onto a paragraph.

## 3. Diagrams — do them to convention or not at all

A diagram that misleads is worse than a table. If you draw one:

- **Direction must be visible** — real arrowheads (SVG markers), not bare lines.
  The caption must describe exactly what is drawn; never promise arrows a reader
  can't see.
- **Relationships carry cardinality** where it's known (crow's-foot or a clear
  label) — an ER/data-model diagram without cardinality is a hint, not a model.
- **Don't auto-lay-out the world.** Beyond ~8–10 nodes, naive layout becomes a
  crossing-heavy tangle. Show the **core / most-connected entities** as the
  orientation graph and let the long tail live in the table/accordion beneath it.
- **Deterministic + theme-aware** — server-rendered SVG using tokens (so it
  themes light/dark), or Mermaid where a conventional notation (ER, sequence)
  earns it. No client-only chart libs for a static digest.

## 4. Frame it like its siblings (the consistency rule)

Resolve the two container idioms so surfaces stop diverging:

- **Synclair artifact frame = `rounded-lg border` panel**, padded, rendering the
  read through `<Markdown>`. This is the canonical frame for every distilled read
  in `/synclair/*` — Knowledge, System Map, References all use *this*, identically.
- **Headings inside a read come from `##` in the markdown**, styled by the shared
  `Markdown` component — NOT bespoke `<h2>` treatments, custom sizes, or ordinal
  numbers. Two reads with different heading treatments is the exact Frankenstein
  this prevents. Structured section data (e.g. the System Map's `overviewSections`)
  is composed into `## heading` markdown at render, so it matches a plain-markdown
  read like the Knowledge summary byte-for-byte.
- **The `Card` component** (its `rounded-xl` + ring treatment) is reserved for
  **gallery / preview tiles** (component & block galleries), not artifact reads.
- Use the shared primitives — `SectionHeader`, `Markdown`, `wireframe-kit`,
  `step-ladder`, `stat-card` — never a bespoke re-implementation of one. Reaching
  for a one-off `<div>` when a primitive exists is how the Frankenstein starts.

## Wiring

Every generator authors to this standard (each links here): `product-summary`,
`codebase-map` (+ its `system-mapper` agent), `figma-distiller`, `ux-doc`. The
`doc-quality-reviewer` agent applies §1–4 adversarially before an artifact is
called done — it is the backstop, not the primary mechanism; the win is
generating it right, not catching it after.

## Relations

- `ux-doc` owns the *content* standard for library UX docs (what each tier must
  cover); this owns the cross-artifact *presentation* standard they all share.
- `component-library`'s invention gate still governs any new primitive — extend
  the shared ones (§4) before inventing.
