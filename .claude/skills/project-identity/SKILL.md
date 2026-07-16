---
name: project-identity
category: knowledge
layer: foundation
description: What THIS project is — the product being built — and how to keep the Synclair foundation out of the answer. Use whenever the user asks what the project/repo is, what's being built, for an executive summary / overview / brief, about scope, goals, or roadmap, to onboard onto the project, or "what does <product> do". The default lens for any question about the project as a subject. NOT for maintaining Synclair itself (use the `synclair` skill for that).
---

# Project identity — the product is the subject, Synclair is the vehicle

This repo contains **two different things, and only one of them is "the project":**

- **The product** — what this repo exists to build. This is the subject. Product
  knowledge lives in the `product-spec` skill (and the project's own domain skill,
  if it has one) and the `/knowledge` manifest.
- **Synclair** — the reusable foundation/hub the product is *built on*. It is
  **infrastructure, not the subject.** Architecture: `docs/foundation-model.md`.

> Note: in a fresh Synclair clone the product is not defined yet — reseed it (see
> `docs/new-project.md`) and fill in `product-spec` before this skill has a product
> to answer about.

## The rule

**When the subject is the project, answer about the product. Keep Synclair out of it.**

The user and every builder-agent treat Synclair as invisible scaffolding — the same
way you don't describe a company by its office building. So when asked *what the
project is, what's being built, for a summary/overview/brief, about scope/goals/
roadmap,* or *to onboard someone:*

- **Do** describe the product — what it does, who it's for, its areas/features,
  its goals. Draw from `product-spec` (its overview digest is the best starting
  point) and the project's domain skill.
- **Don't** lead with, or dwell on, Synclair, the "foundation," the brain/adapter/
  seed layers, `foundation-model.md`, the governance-hub framing, or
  "clone-don't-sync." Those answer *"how is this repo structured?"*, not *"what are
  we building?"* Mentioning them in a product overview is the mixing error this
  skill exists to prevent.

A one-line "this is built on the Synclair foundation" footnote is fine *if it adds
something*; a Synclair-first framing of a product question is not.

## The one exception

Synclair becomes the subject **only when the task is Synclair itself** — maintaining
the foundation, deciding foundation-vs-seed, restructuring `lib/system` / adapters /
the knowledge layer / the hub shell, or promoting an improvement upstream. That
work has its own skill: **`synclair`**. If you're not doing that, you're building the
product, and Synclair stays invisible.

## Quick test

> "If this same question were asked on a *different* product also built on Synclair,
> would my answer change?"

If **yes**, you're answering about the product — good. If your answer would be
identical (because it's really about the foundation), you've drifted into Synclair
and should refocus on the product — unless the user actually asked about the
foundation.

## Where the product knowledge lives

| Need | Go to |
|---|---|
| One-screen product overview | `product-spec` → its overview digest |
| A specific area's requirements | `product-spec` → `references/<area>.md` |
| Industry/domain concepts & vocabulary | the project's domain skill (if any) |
| Source-of-record docs (PRDs/decks/Figma) | `/knowledge` · `lib/system/knowledge/sources.ts` |
| Non-obvious project facts | `memory/MEMORY.md` |

## Related

- `synclair` — the *other* side of the boundary: maintaining the foundation.
- `product-spec` — the product knowledge you answer from (plus the project's domain skill, if any).
