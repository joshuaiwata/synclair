---
name: synclair-steward
category: tooling
layer: foundation
description: The post-work review gate for any library or view change — verify every touched item RENDERS (live import, live preview, screenshot, or embed; never a bare code snippet), meets the UX-doc and doc-quality expectations for its tier, and passes the machine checks, by actually loading the pages, before the work is called done. Use after porting/creating/modifying components, blocks, templates, or views; when the user asks "does everything render?", "check the library", or "review this against our UX expectations"; or when a doc page is suspected of rendering code-only. NOT for authoring docs (ux-doc), formatting reads (doc-quality), or the registration ceremony itself (component-library) — this skill is the inspector that runs AFTER those.
---

# Synclair steward — verify the work renders and meets expectations

The failure this skill exists to catch: work that *passes typecheck and lint*
but ships a doc page where the preview area is a bare code snippet, a stale
screenshot, or a broken layout. Machine checks catch structure; the steward
also **looks**.

## The loop (run all four; order matters)

1. **Machine checks.** `npm run verify-ui` — typecheck, lint guardrails,
   `check:registry`, `check:ux-docs`, and `check:previews` (every native,
   registered, and external item must render visually: a Path A live import, a
   `live()`/`image`/`embed` preview, or be superseded by a port). In companion
   mode also `npm run check:host` (anchored freshness) and
   `npm run check:coverage` (the anti-fiction sweep — triage its output, don't
   just read the count). Red here = stop and fix; nothing below substitutes.

2. **Render spot-check (eyes on pages).** Bring up the hub (the
   `preview-server` skill owns ports/recovery) and LOAD the doc page of every
   item the change touched — plus 2–3 untouched pages as a control. Confirm:
   - the preview shows the item visually (not `<name />` placeholder text,
     not code-only) and in the **product's scoped theme** where applicable;
   - a block/template Example renders the REAL item — a wireframe-only
     Example is a fail even if the page "shows something"; self-referential
     blocks must embed their `scene()` (load `/synclair/preview/<name>`
     directly too — a 404 or error there renders as a blank iframe);
   - interactive demos respond (click a control, watch state change);
   - screenshots match current reality — if the source moved since capture
     (`check:host` drift, or the commit log says so), recapture;
   - the gallery card thumbnail (first example) is representative.
   **Crucially: confirm the server you're checking is THIS worktree's** —
   `lsof -nP -iTCP:<port> -sTCP:LISTEN -t | xargs -I{} lsof -a -p {} -d cwd`
   — a sibling worktree's server on the canonical port renders *its* code,
   and every observation you make against it is about the wrong tree.

3. **UX-expectation review (per tier).** Against the `ux-doc` depth ladder
   and the `doc-quality` rubric: components need examples + props + notes
   (with the host-source path recorded for ports — and NO authored props when
   the host is on disk; the table derives live); stable blocks/templates
   additionally need intent, anatomy, interactions, states, responsive.
   Anything falling short is either fixed now or demoted to
   `meta.status: "beta"` — never left reading as done.

4. **Sweep the residue.** Anything discovered but out of scope for this
   change goes into the project's tracking surface (the Workbench queue, a
   memory entry, or the next build report's findings) — not silently dropped,
   not fixed inline into an unrelated diff.

## Report format

State plainly: what was checked (item list + pages loaded), what rendered,
what failed and where it was fixed or filed. "verify-ui green" alone is not a
steward report — the render spot-check and doc review are the point.

## Relations

- `component-library` / `port-host-component` — the ceremonies whose output this inspects.
- `ux-doc`, `doc-quality` — the expectations enforced in step 3.
- `preview-server` — how the hub comes up for step 2.
- `scripts/check-previews.mjs` — the machine half of step 2; the steward is the eyes.
- the `render-auditor` agent — the runtime sweep (loads every item URL) when a change is broad enough to warrant it.
- `docs/rendering-parity.md` — the contract this gate protects.
