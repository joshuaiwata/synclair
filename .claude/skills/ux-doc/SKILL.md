---
name: ux-doc
category: build
layer: foundation
description: Author or update UX documentation for a component, block, or template — intent, anatomy wireframes, interaction tables, responsive rules, device-width previews — and keep it commit-anchored to the source it documents. Use whenever a block or template is being registered or reaches stable, when a doc page shows "docs stale", when check:ux-docs reports drift or a queue entry, or when asked to "document the UX" of anything in the library. Extends component-library (the registration ceremony); not a separate doc system.
---

# UX Documentation

Every registered item's `.docs.tsx` is its UX documentation — one artifact serving three readers at once: **engineers** (props, states, interactions), **stakeholders** (intent, anatomy, responsive story), and **agents** (structured data they can reason over without parsing prose). This skill defines the required depth per tier, the standardized vocabulary, and the commit-anchored sync that keeps docs honest. It extends the `component-library` registration ceremony — never a parallel system.

## Required depth by tier

Depth is dictated by tier, not chosen per page. `check:registry` enforces this for **stable** items (beta items are exempt but badged):

| Field (`ComponentDoc`, lib/system/doc-types.ts) | Component | Block | Template |
|---|---|---|---|
| `examples` + `props` + `notes` | required | required | required |
| `states` (empty / loading / error) | if stateful | **required** | **required** |
| `intent` — the job it does, for stakeholders & agents | recommended | **required** | **required** |
| `interactions` — trigger / behavior / result rows | if interactive | **required** | **required** |
| `responsive` — per-viewport behavior rows | — | **required** | **required** |
| `anatomy` — wireframe + labeled regions | — | only if complex | **required** |

**No partial docs.** A stable block/template with missing required fields fails `verify-ui`. Work-in-progress stays `meta.status: "beta"` (visible, badged, exempt) or unregistered. Never register something incomplete as stable to "fill the docs in later".

## Authoring the fields

- **`intent`** — markdown, 2–4 sentences: the JOB this piece does, who it serves, when to reach for it and when not to. Write for a stakeholder who's never seen the code. Not a feature list — the reason it exists.
- **`interactions`** — data, not prose: `{ trigger, behavior, result?, keyboard? }`. One row per meaningful interaction. Cover the keyboard path via `keyboard` whenever it differs from the pointer trigger. An agent should be able to answer "what happens when the user does X" from these rows alone.
- **`responsive`** — one row per canonical viewport (`mobile` 375 / `tablet` 768 / `desktop`): what collapses, reflows, hides, or switches. These widths are fixed project-wide — same vocabulary as the ViewportFrame switcher.
- **`anatomy`** — named `regions` (what each area is and why), optionally headed by a skeleton wireframe built **live from the wireframe-kit primitives** (`components/wireframe-kit.tsx`). The live example ALWAYS leads the page (Examples render first); anatomy is the labeled map under it. **Blocks: regions only, no wireframe** — the real render above already shows the structure (e.g. `app-sidebar` — the reference implementation). Reach for a wireframe only on templates or when structure is genuinely non-obvious from the render. A wireframe is **never a block's only visual** — Examples must render the real thing (see below).
- **`states`** — data states (empty / loading / error / confirm…), each with a preview. Reference: `components/blocks/source-editor.docs.tsx`. Template states usually belong to the blocks inside the view — depict them with small live stand-ins or the constituent block's own states; never screenshot the whole page per state.

## Templates: document the view, don't re-mount it

A template is a **documented view** — a full screen design registered from the route(s) that instantiate it. Its doc page is UX documentation first; the render is proof, not the point. Reference implementation: `library-tier-page` (`app/synclair/(hub)/(library)/library-tier-page.docs.tsx`).

- **Example = the running route.** `preview: route("<path>", { height })` embeds the real page — chrome, providers, data — in an iframe (hub routes via `synclair()`). Never mount the page component inside the doc, and never wireframe-as-Example. `check:previews` verifies the path resolves to a route in the app tree; pass a concrete instantiation for dynamic routes (`route("/orders/1042")`).
- **Fallback ladder** when the route can't embed: `scene()` if the view needs fixture providers the live route lacks → `image` screenshot for host views (companion mode, via the external catalog). In that order — each step down is less live.
- **Anatomy is the map.** Templates are the tier where the wireframe is *required*: chrome regions from the layout drawn `solid`, the view's own regions labeled, ONE focal region (the reason the view exists).
- **Props = the URL contract.** Document route params and query params in the props table (`route`, `?origin`, …) — that IS a view's API; there are no component props at this altitude.
- **Notes carry the reuse story.** Which routes instantiate the design, and which blocks own the internals (link the weight to the block's doc page instead of duplicating it — the template documents the *screen*, the block documents *itself*).
- **Card thumb = screenshot.** The first example is an embed, unreadable scaled down — set `meta.previewImage` (same rule as `scene()`-led blocks).

## The wireframe vocabulary (strict)

Built from `wireframe-kit` — **never** hand-rolled divs, **never** image exports:

- **Dashed border** = placeholder / grouping (content that isn't the point)
- **Solid border** (`solid`) = real chrome that exists in the actual UI
- **Primary tint** (`focal`) = THE element this section documents — one focal per wireframe
- Everything else stays greyscale (`SkeletonBar` / `SkeletonRow`). If a recurring entity needs identity across sections, use ONE semantic-token accent as the through-line — never more.

## Previews and the device switcher

- Blocks and templates get the **ViewportFrame** device switcher on their example previews automatically (`components/viewport-frame.tsx`); opt out per example with `viewports: false` (e.g. a placeholder card that has no responsive story). Components render in the plain frame.
- The frame is CSS width — container-driven layouts reflow, but `md:`/`lg:` media queries do NOT fire. For a full template's true responsive behavior, use the `route()` helper (an embed of the real route): the iframe viewport IS the frame width, so media queries fire at device size.
- **Embed real components, never lookalikes.** A live preview imports the actual component with minimal host state. If you're tempted to build a simplified copy for the doc, the doc will drift — render the real thing, nothing in between.
- **Self-referential blocks use a preview scene, not a wireframe.** A block that can't mount twice inside the hub chrome — it IS the chrome (app shell, library shell), it renders the page it's documented on, or it needs page-level providers — gets a **standalone scene**: register its real composition (real data, real providers, no mocks) in `components/library/preview-scenes.tsx` and author the example as `preview: scene("<name>", { height })` (`lib/system/doc-types.ts`). The doc page embeds the chrome-free `/synclair/preview/<name>` route in an iframe, so the block renders REAL and media queries fire at true device widths. `check:previews` fails a block/template whose docs never render the real thing (no self-import, no `scene()`, no image/embed), and fails any `scene()` call without a registered scene.
- **No Figma images, anywhere.** Designs stay canonical in Figma and are *linked* (AGENTS.md: link, don't copy). Exported PNGs go stale invisibly. `image` previews are only for screenshots of rendered code (host components, RN screens).
- **Every demo box declares its own surface.** Previews render on a tinted canvas (`bg-muted/40`), so a bordered stand-in with no `bg-*` class inherits the canvas color and disappears — an item must never share its container's background. Use `bg-card` for stand-ins, `bg-muted` when demoing a muted state, `bg-transparent` only when see-through is the point. Lint-enforced in `*.docs.tsx` (eslint.config.mjs `SURFACE_SELECTORS`).

## Commit-anchored sync (deliberate, never real-time)

Docs are anchored to a sha256 of the item's registered source files in `data/ux-docs/anchors.json`:

1. **After writing or re-affirming docs:** `npm run check:ux-docs -- --update <name>` (or `--update` for all). This records "the docs match the source as of this content".
2. **`npm run verify-ui`** runs `check:ux-docs` (non-fatal): source that moved since anchoring reports **stale**, and the item's doc page shows a "docs stale" badge. Drift never fails the build — a refactor shouldn't be punished — it queues review.
3. **Draining drift:** `npm run check:ux-docs -- --queue` appends stale items to `data/ux-docs/queue.json`; the `ux-doc-writer` agent drains it — re-reads the source, updates the affected doc fields, re-anchors. Also just fix-and-re-anchor directly when you caused the drift in the same change (the normal case: component change + doc touch-up + `--update` in one commit).

Design-side sync rides the same flow: when a Figma page digest is refreshed (figma-distiller), review the docs of items built from that page and re-anchor — the digest, not the Figma file, is what docs are written against.

## Definition of done

- [ ] Tier-required fields present (table above) — `npm run check:registry` passes
- [ ] Wireframes use wireframe-kit vocabulary; one focal element per wireframe
- [ ] Interactions cover keyboard paths; responsive covers all three viewports
- [ ] Live previews embed the real component (no lookalikes); no Figma images
- [ ] Block/template Examples render the REAL item — self-import or `scene()`; wireframes live in `anatomy` only
- [ ] Anchored: `npm run check:ux-docs -- --update <name>` run after the docs were finalized
- [ ] `npm run verify-ui` passes
