---
name: codebase-map
category: intake
layer: foundation
description: Generate or refresh the System Map (/synclair/system) — the digest of what a codebase consists of beyond the UI - areas, API surface, data model, background jobs, integrations. Use when asked to "map the codebase", "give us visibility into the repo/backend/database", "what is in this system", when /synclair/system shows its empty state, or when the map's snapshot commit has drifted far behind. Works on THIS repo (new-project mode) or the HOST repo (existing-project mode). NOT for the component library (component-library / existing-project-intake) and not for product requirements (product-spec).
---

# Codebase Map — backend & architecture visibility

The System Map is the visibility layer for everything the component catalog doesn't cover: what the codebase consists of, where it lives, and how it fits together. One source of truth (`data/system-map.json`, schema `lib/system/system-map.ts`), two renderings — `/synclair/system` for humans, the JSON for agents. It is a **digest at orientation altitude**: one screen per section, `source` paths for depth. Visibility and understandability first; completeness is explicitly not the bar.

Author to the **`doc-quality`** standard: pick the right medium (`stackFacts` grid over prose, tables for the callable surface, an ER diagram for the data model), format prose for scan (`overviewSections`, not a wall), and frame it like every other hub artifact.

## Generate (or regenerate — same procedure)

1. **Resolve the target repo.** Existing-project mode → the host (`data/external-catalog.json` `hosts[].root`, or `memory/MEMORY.md`). Otherwise this repo (`root: null`). Ambiguous → ask.
2. **Send the `system-mapper` agent** (its own context) at the target. Pass the resolved root and, if one exists, the codebase-surveyor's digest so it doesn't re-orient from zero. **Multi-surface projects** (`lib/system/seed/surfaces.ts` declares >1 frontend): tell the mapper the surface ids and roots — it tags `areas`/`api`/`jobs` entries with `surface` (or `"shared"`) and writes `surfacesNote`, so `/synclair/system` groups by frontend. Two sibling host repos: run the mapper against the repo holding the backend and let per-area `surface` tags cover the frontends' code.
3. **Validate + write.** Sanity-check the returned JSON: parses; `repo.name` + `repo.digestedAt` present (`commit` too whenever the target is a git repo — it anchors freshness); the top reads as **scannable structure, not a wall of prose** — `stackFacts` (the labeled "at a glance" grid) and `overviewSections` (headed sections), not the legacy `stack`/`overview` prose blobs; paths look real (spot-check 2-3 `source` paths exist); and a mechanical secrets sweep before writing — grep the JSON for `sk-`, `AKIA`, `postgres://`, `://…:…@`-style URLs; any hit means the mapper leaked a value, strip it. Then write to `data/system-map.json` whole — regeneration replaces the file; there is no partial-merge protocol (the map is cheap to rebuild and merging sections invites drift).
4. **Verify.** `/synclair/system` renders every section you expect (dev server per the `preview-server` skill); `npm run verify-ui` still passes.
5. **Commit** with the snapshot commit in the message (e.g. `system map: digest at <hash>`), so map history tracks code history — git is the database (foundation-model §11).

## Freshness

The map records the `commit` it was digested at and the page says "a snapshot, not live". There is no hash-per-entry drift check (unlike the component catalog — a whole-repo map would always be "drifted"); the working rule is **regenerate on structural change**: a new area/service, schema migration, API reshape, or when someone notices the page lying. Cheap to re-run — when in doubt, regenerate.

## The flywheel

The map is the *surface* layer. When mapping surfaces something deeper that's durable:

- Non-obvious operational facts (external IDs, deploy quirks, "the cron only runs in prod") → `memory/`.
- Area-level product knowledge (what the billing module MUST do) → `product-spec` references, not the map.
- Secrets discipline is absolute: variable and service NAMES only, never values — the mapper knows this; hold the line when writing too.

## Relations

- `existing-project-intake` runs this as part of intake (map phase) — this skill is the standalone/refresh path.
- `codebase-surveyor` orients agents (transient digest); the mapper produces the durable artifact. Survey first when both run.
- `/synclair/github` shows repo *activity*; `/synclair/system` shows repo *anatomy*.
