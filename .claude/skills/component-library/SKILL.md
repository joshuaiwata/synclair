---
name: component-library
category: build
layer: foundation
description: Conventions for this project's component library — the invention gate, the shadcn registry (Components / Blocks / Templates), the per-tier gallery pages with card previews and per-item doc pages, colocated .docs.tsx files, and global ⌘K search. Use when creating or modifying any reusable component, block, or template, or when deciding whether something new needs to be invented.
---

# Component Library

We are building a real component library as a by-product of building screens: reusable TSX files, tracked in a shadcn-style registry, rendered in an in-app visual library that keeps designers, engineers, and the AI in sync. Every screen built should make the next one cheaper.

## The invention gate

Before creating ANYTHING new, prove the ladder is exhausted (see `build-view`): no shadcn primitive fits, no existing registry component/block fits, plain composition isn't enough. Figma showing an invented component is **not** justification by itself — mocks get rebuilt on foundations. When the gate is passed, invent confidently: new components are expected and welcome, as long as they're tracked.

## The three tiers (Components → Blocks → Templates)

```
components/ui/       # Tier 0: upstream shadcn primitives — never edit beyond the theme; keep diffable
components/          # Components: focused custom UI pieces (StatusBadge, StatCard, PageHeader)
components/blocks/   # Blocks: larger reusable parts (AppSidebar, SourceEditor, QuoteTable)
app/<route>/         # Templates: full screens assembled from blocks + components
```

(Root-level Next.js App Router layout — no `src/` dir. Routes in `app/`, fixtures in `lib/fixtures/`, tokens in `app/globals.css`.)

- **Components** are focused, single-purpose UI pieces built on primitives; variants via `cva` (`variant: "primary" | "secondary"`, never boolean styling props). Registry `type: registry:component`.
- **Blocks** are larger reusable parts meant to be dropped whole into multiple screens — a chat/activity panel, a quote table, a document viewer. A block owns its internal layout and states but takes data via props/fixtures; it never fetches or knows about routes. Registry `type: registry:block`.
- **Templates** are **documented views** — full screen designs assembled from blocks + components, larger than any block because they own the page. A template's registered source IS the route(s) that instantiate the design: `files` lists the `page.tsx` route file(s) (`type: registry:page`, one design reused by several routes registers all of them), and the `.docs.tsx` colocates with the route (or the shared route group). Registered once built via the `build-view` loop; they show up in `/templates` and in the library. **The doc page is UX documentation of the view, not a re-mount of it**: intent + anatomy + interactions + responsive carry the weight, and the Example embeds the *running route* via the `route()` helper (`preview: route("/orders", { height })`) — an iframe of the real page, chrome and data included, so the doc never renders the whole page inside itself. A template's props table documents its **URL contract** (route params + query params) — that is a view's API. Reference implementation: `library-tier-page`.
- **Register on creation, even for single use.** If a piece of UI *could* serve another screen (a status badge, a step list, a stat card), it gets extracted and registered the moment it's born — not when a second screen happens to need it. An unregistered component is invisible: other screens (and the AI) can't discover it, so they'll reinvent it. The only things that stay page-local are true one-offs meaningless outside their screen (a page's unique hero arrangement, a bespoke empty state).

The tier definitions are also in code, one source of truth, at `lib/system/tiers.ts` — surfaced on the `/library` index.

**When the tier isn't obvious** (and it often isn't — a wired shell panel, a domain drawer, an elaborate compound component), don't eyeball it: apply the **tier-arbiter rubric** (`.claude/agents/tier-arbiter.md` — screen ownership → data shape → internal regions → composition direction → placement; ties to the lower tier; size is never a signal), or hand the call to the `tier-arbiter` agent when it's contested or you're auditing many items. The tier decides the doc bar (blocks/templates owe intent/interactions/states/responsive), so getting it right at registration is cheaper than re-documenting later.

## The registry (the manifest)

Every Component / Block / Template is registered in `registry.json` at the repo root, shadcn registry format, built with `npx shadcn build`:

- Type: Component → `registry:component`; Block → `registry:block`; Template → `registry:page`.
- Each entry: `name`, `title`, `description` (one line, written so an AI can decide relevance from it alone), `categories` (e.g. `["data-display"]`, `["inputs"]`, `["panels"]`, `["navigation"]`), `files`, `registryDependencies`, `docs` (path to the colocated `.docs.tsx`), and optional `meta.status` (`stable | beta | deprecated`). All fields stay shadcn-build-valid.
- **`meta.layer` — foundation vs. project.** The library galleries + ⌘K show only the **project's** design system. Items are `project` by default. Synclair's own hub-skin (the sidebar/command-palette/source-editor and the generic status/stat/header pieces it's built from) carry `meta.layer: "foundation"` and are hidden from the galleries (still registered + documented; reachable by direct URL). When registering, ask: is this the *app's* component, or the *hub's* own UI? App → omit `layer` (project). Hub infra → `"layer": "foundation"`. See the `synclair` skill.
- **`meta.surface` — multi-surface projects only.** When `lib/system/seed/surfaces.ts` declares more than one frontend, an item registered for a non-default surface (e.g. an RN component ported into the clone) carries `"meta": { "surface": "<id>" }`. Names are unique per `(surface, name)` — a web `button` and an RN `button` coexist, each in its own scoped gallery. Single-surface projects: never set it. The adapter that depicts the item's previews resolves from its surface (`lib/system/adapters` `adapterFor`); RN `live()` previews render only when the surface opts into `liveRender` + `react-native-web` is installed — otherwise author `image`/`embed` previews.
- **The registry is the AI's index.** When building a screen, read `registry.json` FIRST to know what exists. A component that isn't registered doesn't exist as far as reuse is concerned — so registration happens in the same change as creation, no exceptions.
- **Added / Updated dates are derived from git** (`lib/system/git-dates.ts`) — never hand-maintained. Don't add date fields to the registry.
- This also makes our components installable/shareable via the shadcn CLI, exactly like upstream shadcn.

## Documentation: colocated `.docs.tsx` + the library pages

The library renders in a two-pane **explorer** (dense filterable tree + content pane, `components/library/library-explorer.tsx`). Each tier keeps its page: **Components** (`/components`), **Blocks** (`/blocks`), **Templates** (`/templates`) — linked directly from the sidebar on single-surface projects. Multi-surface projects get one **Library** sidebar entry instead: `/library` is the surfaces overview (one row per surface + Shared), and entering a surface scopes everything to `/library/<surface>/<tier>/<name>` — surface lives in the PATH, never a query param. Items sharing a `concept` across surfaces present as one entry with availability chips; the bare `/{tier}/[name]` URL is the concept page when implementations span surfaces. Each is a card gallery grouped by category — every card shows a live preview thumbnail (the item's first doc example), its display title, and status — linking to a **detail page** at `/{tier}/[name]` (e.g. `/components/status-badge`). These are the sync point for designers, engineers, and the AI. Galleries live in `components/library/` (`tier-gallery.tsx`, `component-card.tsx`); the detail page is the shared `component-doc-view.tsx`.

Every registered item ships a colocated doc module next to its source:

```
components/status-badge.tsx
components/status-badge.docs.tsx     ← default-exports a ComponentDoc
```

- The `ComponentDoc` shape (`lib/system/doc-types.ts`): `examples[]` (title, optional description, optional `code`, and a `preview`), `props[]` (name, type, default, description), `states[]` (empty/loading/error — expected for blocks & templates, each with a `preview`), and `notes` (markdown: intended behavior, edge cases, where it's used, and any deliberate Figma deviations with a one-line rationale).
- **UX documentation fields** — `intent`, `anatomy` (wireframe + regions), `interactions[]`, `responsive[]` — are REQUIRED for stable blocks and templates (enforced by `check:registry`) and governed by the **`ux-doc` skill**: required depth per tier, the wireframe-kit vocabulary, the ViewportFrame device switcher, and the commit-anchored staleness flow (`npm run check:ux-docs`). Read it whenever authoring or updating a block/template doc.
- **`preview` is the platform seam, not a raw node.** A `preview` is a `Preview` (`live` node / `image` / `embed` / `code`) that the active platform adapter renders — see `docs/foundation-model.md` §4a. On this (web-shadcn) project, author the common case with the `live()` shorthand: `preview: live(<StatusBadge status="success">Connected</StatusBadge>)`. Do **not** hand a bare JSX node — always wrap it. (Keeping this indirection is what lets the same doc contract serve a future React Native target.)
- **Self-referential blocks render via a preview scene.** A block that can't mount twice inside the hub chrome (it IS the chrome, it renders the page it's documented on, or it needs page-level providers) registers its real composition in `components/library/preview-scenes.tsx` and authors its example as `preview: scene("<name>", { height })` — the doc page embeds the chrome-free `/synclair/preview/<name>` route in an iframe. Never a wireframe or hand-mocked stand-in as the Example: `check:previews` fails a block/template whose docs never render the real thing.
- **Templates render via `route()`.** A template's Example is `preview: route("<path>", { height })` — an embed of the route itself, running (hub routes go through the `synclair()` helper: `route(synclair("/components"))`). Since a template's source is a route, one always exists; `check:previews` verifies the path resolves in the app tree (pass a concrete path for dynamic segments — `route("/orders/1042")`, never the `[param]` pattern). An embed scales down unreadably as a card thumb, so templates set a screenshot `meta.previewImage` (same rule as `scene()`-led blocks).
- **Register the doc**: add one import + map line in `lib/system/docs.ts` and point the registry entry's `docs` field at the file. Missing from the map ⇒ the item renders "no docs yet" and is flagged on the index. An undocumented component is **unfinished**.
- The detail page (`/{tier}/[name]`) renders it generically — you author data, not layout. The first example's `preview` also becomes the card thumbnail in the gallery, so make it representative; a complex block whose live thumb scales down unreadably (or whose first example is a `scene()` embed) opts into a screenshot thumb via `meta.previewImage` — the doc page still renders live, cards only.

## Global search (⌘K)

`components/blocks/command-palette.tsx` is a global ⌘K / Ctrl-K palette over the whole system — components, blocks, templates, skills, agents, and routes. Its index is built server-side in `lib/system/search-index.ts` from the registry + skill/agent loaders. **Nothing to author**: a newly registered item appears in search automatically. Extend `search-index.ts` only when adding a whole new searchable entity type.

## Styling rules

- Tokens are CSS custom properties in the global stylesheet, consumed via the Tailwind theme — shadcn naming (`--background`, `--primary`, `--radius`, ...) extended with the project's brand tokens (from `lib/system/seed/`). No raw hex/px values in components; a missing token means "add the token."
- **This rule is lint-enforced** (`eslint.config.mjs` → foundation guardrails): raw hex in class strings/inline styles and arbitrary px values (`p-[13px]`, `text-[11px]`) are errors; so are hardcoded `/synclair` paths (use the `synclair()` helper). The dense-UI micro type steps exist as tokens: `text-2xs` (11px) and `text-3xs` (10px). Sanctioned exemptions: `lib/system/tokens.ts`, `lib/system/seed/`, vendored `components/ui/`.
- **Our theme is the source of truth**, not the Figma file. Figma values inform the theme when we set it up; after that, components consume the theme and mocks are approximations.
- Accessibility is part of done even in a prototype: Radix handles most of it; for custom work — keyboard operability, visible focus ring from the ring token, `aria-*` on stateful widgets.

## Shared UI patterns (don't reinvent these)

Recurring cross-screen states have ONE implementation each — reach for it, never
hand-roll a one-off `<div>` (that is how the hub becomes a Frankenstein):

- **Empty states** — every "no data yet" / "no match" screen uses the `Empty`
  primitive (`components/ui/empty.tsx`): `Empty` › `EmptyHeader` › `EmptyMedia`
  (icon chip) · `EmptyTitle` · `EmptyDescription`. For a genuine *no-data-yet*
  surface (not a transient filter miss), the description must **educate how it
  populates** — the skill/agent that fills it, or the user action — in a sentence
  or two. Use `variant="warning"` on `EmptyMedia` for error states.
- Section headings → `SectionHeader`; prose → `Markdown`; anatomy → `wireframe-kit`;
  sequences → `step-ladder`; metric tiles → `stat-card`. (See the `doc-quality`
  standard for how generated *reads* choose their medium and frame.)

## Definition of done (component, block, or template)

- [ ] Passed the invention gate (ladder documented in the notes if non-obvious)
- [ ] Variants via `cva`; consumes theme tokens only
- [ ] All interactive + data states (blocks/templates: also empty/loading/error)
- [ ] Keyboard + focus behavior works
- [ ] Registered in `registry.json` with an AI-legible `description` and at least one `category`
- [ ] Colocated `<name>.docs.tsx` with examples + props + notes, registered in `lib/system/docs.ts`
- [ ] UX docs at tier-required depth (`ux-doc` skill): stable blocks/templates need intent + interactions + states + responsive (templates also anatomy) — then anchored via `npm run check:ux-docs -- --update <name>`
- [ ] Appears as a card on its tier page and its `/{tier}/[name]` detail page renders (no "no docs" flag)
- [ ] `npm run verify-ui` passes — typecheck + lint (token & route guardrails) + `scripts/check-registry.mjs`, which fails on any drift between `registry.json`, the component file, its `.docs.tsx`, and `lib/system/docs.ts`
