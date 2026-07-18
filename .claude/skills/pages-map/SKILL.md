---
name: pages-map
category: intake
layer: foundation
description: Generate or refresh the app SITEMAP (/synclair/pages) — an inventory of every view/route, a live preview of each, how they tie together, and the components/blocks/templates each one composes. Use when asked to "map the pages/views/routes", "build a sitemap", "what pages does this app have", "what components does each screen use", when /synclair/pages shows its empty state, or when `npm run check:pages` reports drift. Works on THIS repo (new-project mode) or the HOST repo (existing-project mode). NOT the backend/architecture digest (that's codebase-map / the System Map) and NOT the component library (component-library / existing-project-intake).
---

# Pages Map — the app sitemap

The Pages map is the view-layer inventory: every route the app serves, what each one looks like (a real route iframed and scaled down), how they navigate to each other, and which catalog components/blocks/templates each composes. One source of truth (`data/pages-map.json`, schema `lib/system/pages-map.ts`), two renderings — `/synclair/pages` for humans (a route tree + a live-thumbnail gallery, per-page detail with the full preview), the JSON for agents. It is a **digest**: one node per route, `file` for depth.

It is the sitemap counterpart of the System Map (`codebase-map`): the System Map answers "what does this system consist of"; the Pages map answers "what views does it present and what do they use". Author to the **`doc-quality`** standard.

## Generate (or regenerate — same procedure)

1. **Resolve the target repo.** Existing-project mode → the host (`data/external-catalog.json` `hosts[].root`). Otherwise this repo (`root: null`). Ambiguous → ask.
2. **Send the `page-mapper` agent** (its own context) at the target. It enumerates routes and returns, per page: `route`, `id`, `file`, `kind`, `title`, `summary`, `links`, `previewUrl`/`previewable`, and (multi-surface only) `surface`. It does **not** hand-resolve `items`/`sourceFiles`/`sourceHash` — those are computed deterministically in steps 4–5. For a **host** target, make sure `repo.previewBaseUrl` is set to the host dev server origin so the previews frame the real host routes.
3. **Validate.** Sanity-check the returned JSON: it parses; `repo.name` + `repo.digestedAt` present (`commit` too when the target is a git repo — it anchors freshness); `id`s are unique; `route` strings follow the derivation rule (groups dropped, `[dynamic]` kept) so `check:pages` won't read every page as drifted; spot-check 2-3 `file` paths exist; and a mechanical secrets sweep (grep the JSON for `sk-`, `AKIA`, `postgres://`, `://…:…@`) — strip any hit. Then write to `data/pages-map.json` whole — regeneration replaces the file; there is no partial-merge protocol.
4. **Resolve composition deterministically (THIS-repo / Next targets only).** Run `npm run resolve:pages` (`scripts/resolve-page-items.mjs`): for each page it walks the route's own import graph from `file`, records every `@/components/*` it composes, and resolves each against the catalog (`registry.json` + native `components/ui/`) — writing accurate `items` (library items linked; local components not in the library flagged `catalogued: false`) and the route-local `sourceFiles` closure. This is the source of truth for `items` on the hub's own repo, NOT the agent's judgment — an LLM under-reports imports. (`npm run resolve:pages -- --check` reports without writing.) **In HOST mode (`repo.root` set) it self-skips** — the host uses its own router/imports and is cataloged in `external-catalog.json`, which this resolver doesn't read; there the page-mapper's agent-resolved `items` stand (running it is safe — it won't blank them).
5. **Anchor the hashes.** Run `npm run check:pages -- --reanchor`: it fills each page's `sourceHash` from the resolved `sourceFiles` using the loader's exact algorithm (lockstep with `lib/system/pages-map.ts`), so the per-page freshness signal is trustworthy. Never hand-write a hash.
6. **Verify.** `/synclair/pages` renders — the sitemap tree, the gallery thumbnails, and a detail page's **live preview** (dev server per the `preview-server` skill; same-origin route iframing is unblocked in this repo). `npm run check:pages` is clean, and `npm run verify-ui` still passes (it now includes `check:pages`).
7. **Commit** with the snapshot commit in the message (e.g. `pages map: sitemap at <hash>`), so map history tracks code history — git is the database (foundation-model §11).

## Refresh — keeping the sitemap in sync as pages are added and merged

The map is a snapshot; routes change under it. The sync loop:

- **`npm run check:pages`** re-derives the live route set and re-hashes every mapped page → reports **new** (in the app, not the map), **removed** (in the map, not served), and **changed** (source moved since digested). Non-fatal by default; `--strict` exits 1 (for a CI gate / pre-merge hook); `--queue` appends drift to `data/pages/queue.json`. It runs inside `verify-ui`, so drift surfaces on every verification without breaking the build. On the detail page a changed route also shows a "source changed" badge (live-hash compare via `getPageSourceSync`).
- **When it reports drift, re-run this skill** (step 2 onward). Regeneration is whole-file and cheap; the agent picks up the new/changed routes and drops the removed ones. To target just the drifted routes, hand the `page-mapper` the `check:pages --queue` output. Then resolve + re-anchor (steps 4–5) and commit. If only a page's *composition* changed (imports added/removed, no route change), `npm run resolve:pages && npm run check:pages -- --reanchor` refreshes `items` without a full agent run.
- **Toward full automation:** wire `check:pages --strict` into CI or a pre-merge hook so a PR that adds a route fails until the sitemap is refreshed — the mechanism is here; the hook is a per-project choice.

## The flywheel

The map is the *surface*. When mapping surfaces something durable:

- A view that composes something **not in the library** (`catalogued: false`) is a coverage gap — feed it to `component-library` (register the missing piece) or, in companion mode, `port-host-component`.
- Non-obvious routing facts (a route only mounts behind a flag, an auth boundary) → `memory/`.
- Product-level intent for a view (what the dashboard MUST do) → `product-spec`, not the map.

## Relations

- `codebase-map` / System Map = repo *anatomy* (backend); this = repo *views* (frontend). Complementary; a template registered in the library is a *design*, a page here is a *served route*.
- `existing-project-intake` populates the component catalog this map links into — run it first in companion mode so `items` resolve to real catalog entries.
- `/synclair/github` shows repo *activity*; `/synclair/pages` shows the app's *surface*.
