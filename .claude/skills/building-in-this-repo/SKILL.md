---
name: building-in-this-repo
category: build
layer: foundation
ambient: true
description: How to build a screen, page, component, or feature in THIS product app without drifting from the foundation — reuse before you invent, build from the design and requirements (don't approximate or invent), and use design tokens (not raw colors). Use whenever you're about to add or change UI in the app, especially as a fast-moving/"vibe" build. The ambient, host-safe front door to the deeper build skills that live in the co-located Synclair hub.
---

# Building in this repo (foundation-first)

This app is cataloged by **Synclair**, a co-located hub (`cd synclair && npm run dev`
→ http://localhost:4100/synclair) that holds this project's **design tokens,
component catalog, requirements (PRD digests), and design (Figma digests)**. You do
not need the hub *running* to build — its distilled knowledge is already here as
skills. Read this before adding or changing UI, then build.

The three rules below are what keep a fast build from silently drifting. They are
distilled from the hub's deeper `build-view` and `component-library` skills (read
those in `synclair/.claude/skills/` when you want the full method or you're working
in the hub itself).

## 1. Build from the design and the requirements — don't approximate or invent

Before you build a screen, get its **requirements** and its **design**:

- **Requirements** → the `product-spec` skill (already ambient here). Its
  `references/<NNNN>-<area>.md` digests give you the fields, states, rules, and edge
  cases per feature. Read the digest first; it is build-ready.
- **Design** → the Figma digests distilled by `figma-distiller`
  (`synclair/.claude/skills/figma-distiller/references/figma/…`). A digest names the
  **exact** screens, content, and the components each one composes.

If a digest exists, **use its content verbatim** — the named reports, the real
column set, the actual copy. Do **not** invent plausible-looking stand-ins (made-up
report names, guessed labels) to approximate the design. Inventing content that a
digest already specifies is the most common drift; the digest exists precisely so
you don't have to guess. If no digest exists for the screen you need, say so and
distill one (`figma-distiller` / `product-spec`) rather than free-handing it.

## 2. Reuse before you invent — and surface anything you must invent

- **Check what already exists first.** This app has a component set (e.g. its
  `@…/ui` package or `components/` dir) and the hub catalogs it at
  `/synclair/components`. Grep the component index and reuse the real primitive with
  its real API — don't re-implement a Button, Field, Dialog, Badge, or Table that
  already exists, and don't guess a component's props (open its source or its hub doc
  page; a wrong-API guess costs more than a 10-second read).
- **If the design needs a primitive the set doesn't have** (a Checkbox, a Stepper, a
  co-brand header…), you may build it — but **do not bury it as an unnamed inline
  block inside a screen file.** Inline-invented primitives are invisible to the
  catalog and become drift no one can find. Give it its own file in the component
  set (so `check:coverage` can see it), or at minimum flag it — the hub's invention
  gate lives in `component-library`, and `library-curator` / `tier-arbiter` (agents
  in `synclair/.claude/agents/`) can triage whether it belongs in the design system.

## 3. Use design tokens, not raw values

Reach for a **semantic token / utility class** (the project's `text-*`, `bg-*`,
`border-*` scale) for every color, radius, and space. **No raw hex, no inline
`style={{…}}` colors, no arbitrary `[…]` values** — those bypass theming and are
flagged by the hub's `scan:hygiene` (viewable at `/synclair/hygiene`). The one
legitimate exception is genuinely dynamic, data-driven values (e.g. a partner's
brand color from data) — keep those rare and localized.

## After you build

- Verify it renders and works (drive the flow, don't just typecheck).
- The hub keeps itself honest with catalog checks — run them from `synclair/`:
  `npm run check:pages` (new routes), `npm run scan:hygiene` (raw-value drift),
  `npm run check:coverage` (uncataloged components). Regenerate the affected catalog
  (`pages-map`, the component cataloger) so the new page/component is **recorded**,
  not just shipped. A screen that isn't in the catalog is invisible to the team.

## When you're maintaining the hub itself (not just building in the app)

Read the full skills in `synclair/.claude/skills/`: `build-view`,
`component-library`, `figma-distiller`, `pages-map`, `codebase-map`,
`existing-project-intake`, `synclair-steward`. Specialist agents (diggers,
reviewers, cataloger, tier-arbiter, visual validator) live in
`synclair/.claude/agents/`.
