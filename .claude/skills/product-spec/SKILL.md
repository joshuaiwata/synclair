---
name: product-spec
category: knowledge
layer: foundation
ambient: true
description: Distilled product requirements for this project — the compressed, per-area digest of what each view/feature must do, sourced from the PRDs/specs/decks in the knowledge manifest. Use when building or scoping a specific product area and you need the requirements, entities, states, and rules — before or alongside build-view. Complements the project's domain skill (industry knowledge) with THIS product's decisions.
---

# Product spec (distilled)

This skill is the **distilled brain** for this project's product requirements — the
compressed, durable version of the PRDs/specs/decks so agents don't re-read raw
docs every time. It is the product-decisions counterpart to the project's domain skill
(which is industry knowledge, not our specific choices).

**The raw sources are never copied here — they're linked** from the knowledge
manifest (`lib/system/knowledge/sources.ts`, surfaced at `/knowledge`). This skill
holds the distillation; each area's digest links back to its source of record.

## How to use it

1. Identify the **area** you're building.
2. Read that area's digest in `references/<area>.md` (loads only when you open it).
3. If there's no digest yet, or it's thin, look the area up in the knowledge
   manifest and launch the **`prd-retriever`** agent to fetch the source of record
   in its own context and return a brief.
4. **Write back:** when a dig surfaces durable requirements, add/update
   `references/<area>.md` and set `distilledInto` on the manifest entry. That's the
   flywheel — the next build reads a cheap digest instead of digging again.

## What a good area digest contains

Keep each `references/<area>.md` tight and decision-focused:

- **Purpose** — what this view/feature is for, in one or two lines.
- **Requirements** — the must-dos; hard requirements vs. nice-to-haves.
- **Entities & states** — data objects, key fields, lifecycle + empty/loading/error.
- **Roles & context** — who uses it, and in what context.
- **Rules & edge cases** — business rules, permissions, cross-role visibility.
- **Deviations** — where our product intentionally differs from the industry norm, with a one-line why.
- **Source** — link back to the PRD/deck/Figma in the manifest.

## Status

No area digests yet — `references/` is seeded empty. They get authored as areas
are built (the write-back loop above), starting when the real PRD/spec/deck
sources are added to the knowledge manifest. This is SEED content: a new project
replaces these digests with its own product's specs.
