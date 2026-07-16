---
name: build-view
category: build
layer: foundation
description: Build or extend a view/screen from requirements, using Figma as a guide (not a spec). Use whenever the user asks to build out a screen, view, page, flow, or feature — with or without a Figma link.
---

# Building a View

Views are built to **meet requirements**, on top of our foundations. The priority order for every decision:

1. **Requirements** (PRD / user's description of what the view must do)
2. **Foundations** — shadcn/ui + Tailwind primitives and our theme
3. **Our library** — existing custom components and blocks in the registry
4. **Figma** — a guide for intent and a first crack at layout, never a spec

Figma files bind the PRDs to the front end like a wireframe. They inform; they do not restrict. A strict rendering of Figma is explicitly NOT the goal — it slows us down and imports invented components we don't want.

## Step 0 — Determine the target surface (multi-surface projects only)

If `lib/system/seed/surfaces.ts` declares more than one frontend (e.g. web + React Native companion), decide WHICH surface this view is for before anything else — from the request ("the mobile screen…"), the PRD's `surfaces` tag in the manifest, or by asking. The surface scopes everything below:

- **Components**: use THAT surface's library — the scoped explorer at `/synclair/library/<surface>/components` (or filter the catalog by `surface`; shared `packages/ui` items appear inside every scope, badged). A web view never reaches for the RN surface's components, and vice versa. For an RN surface, rung 1 of the ladder is RN primitives / the host's cataloged RN components, not shadcn.
- **Knowledge**: sources tagged to another surface don't apply; untagged sources apply to every surface.
- Single-surface projects: skip this step entirely.

## Step 1 — Understand the requirement

- Get the requirement for the view from the user or the PRD. **Find the source of record in the knowledge manifest** (`lib/system/knowledge/sources.ts`, surfaced at `/knowledge`): look up the area you're building, read its distilled digest (`distilledInto`) first, and only dig into the raw source (via a digger agent, in its own context) when the digest is insufficient. If the area isn't in the manifest yet, ask the user for the source and add an entry. See the knowledge layer in `docs/foundation-model.md` §9 and the `/AGENTS.md` router.
- If the view touches a domain-specific workflow, consult the project's domain skill (if one exists) and, for anything novel or high-stakes, launch the project's domain advisor agent (if one exists) to check how established products solve it before designing from scratch.

## Step 2 — Read the Figma as a guide

- Pull `get_design_context` + `get_screenshot` for the relevant frames to understand **intent**: what information is shown, what actions exist, what the hierarchy is, roughly how it's laid out.
- Treat the layout as a proposal to evaluate, not a contract. Keep what serves the requirement; change what doesn't. Note meaningful deviations so designers can stay in sync (in the item's `.docs.tsx` notes on its `/library/[name]` page), but never contort the build to pixel-match.
- **Ignore invented components in the mock when a foundation component fits.** If the Figma shows a hand-rolled dropdown/table/dialog, build it with the shadcn primitive and our theme instead. The design's *intent* survives; its *implementation suggestion* doesn't bind us.
- **Resolve component instances through the Figma map.** Instance names in the mock ("Badge", "Button/Primary") are looked up in `lib/system/knowledge/figma-component-map.ts` (`resolveFigmaComponent`) — our stand-in for Code Connect (plan-gated). A mapped name means the component **already exists**; use it, never rebuild it. When you confirm an unmapped instance corresponds to a registry item or primitive, **append the mapping in the same change** — that's the flywheel; the next agent won't have to rediscover it.

## Step 3 — Compose from the ladder

For every piece of the view, work down this ladder and stop at the first rung that fits properly:

1. **shadcn/ui primitive** (Button, Table, Dialog, Tabs, Command, ...) — use it, themed, even when the mock invented its own version.
2. **Existing custom component or block** from our registry — check `registry.json` and the library pages (`/components`, `/blocks`, `/templates`) or ⌘K before building anything. Blocks (ActivityPanel, ChatPanel, QuoteTable, ...) are designed to be dropped into multiple screens — reuse them whole.
3. **Composition** of 1+2 arranged in the page file — most "new" things are just composition; that stays in the view, not the library.
4. **Invent a new component or block** — only when nothing above fits properly. Follow the `component-library` skill: build it as a real reusable TSX file, register it, document it, add it to /library. Inventing is normal and expected as we go — the point is that it's deliberate, tracked, and reusable, not accidental.

## Step 4 — Wire and populate

- Views are thin composition; keep logic out of them. Dummy data lives in `lib/fixtures/` modules with plausible domain data (see the project's domain skill, if one exists, for realistic vocabulary).
- Implement real interactive states (hover/focus/disabled/loading/empty/error) — this is a working prototype, not a picture.

## Step 5 — Close the loop

- **Gate: `npm run verify-ui` must pass before a view is done.** It runs typecheck + lint + the registry drift check. The lint layer machine-enforces the token rule (no raw hex / arbitrary px — use `lib/system/tokens.ts`) and the `synclair()` route helper; its error messages tell you the fix. Don't work around a failure with `eslint-disable` — a missing token means "add the token" (`app/globals.css` + `tokens.ts`).
- Run it, screenshot it, and evaluate it **against the requirement first**, the Figma second.
- Register anything new you invented (see `component-library`): give it a colocated `.docs.tsx`, add it to `lib/system/docs.ts`, and confirm its detail page (`/components|blocks|templates/[name]`) renders. Record deviations-from-Figma with a one-line rationale in the notes so design and engineering stay in sync.
- If the finished screen is itself a reusable, copy-and-adapt starting point, register it as a **Template** (`type: registry:page`) so it appears in `/templates` and the library. It gets a doc page like any other item.
