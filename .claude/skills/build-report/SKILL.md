---
name: build-report
category: intake
layer: foundation
description: Produce a build/coverage REPORT of this project as Synclair sees it — a plain-English, per-section read of what's there, what's next, and ranked recommendations, rendered at /synclair/reports. Use after an intake, after shipping work against prior recommendations ("re-run the report", "update the report"), or when asked "how's the build looking / what should we do next / audit the app". Digger-driven and data-verified: it reads the host via the intake diggers and cross-checks every count against the hub's own data. NOT a code review of a single diff (that's a normal review) and NOT the design-side foundations audit.
---

# build-report — the project's build/coverage report

A report answers, in plain terms: **what is this build, how ready is it, and what
to do next** — one block per Synclair section (Knowledge, System Map, Foundations,
Component Library, Environment & AI Setup), plus a ranked recommendation list. It
renders at **`/synclair/reports`** from `data/reports/<id>.json` (schema:
`lib/system/reports.ts`). This skill WRITES that JSON; the page only renders it.

**Append-only, never destructive.** Every run writes a **new** dated file
(`data/reports/2026-07-14.json`, then `…-post-fixes.json`, …). Old reports are the
archive — the page lists them and opens any one. Re-running after fixes, or an
agent updating recommendation `status` as it clears them, produces a *new* report;
it never overwrites the baseline. That's how "run it again after fixes" works.

## The contract (same as intake)

Diggers READ the host and PROPOSE; **only you (the main thread) WRITE** the report
JSON in this repo. You never bulk-read the host yourself; diggers never edit.

## Procedure

### 1. Gather — launch the diggers (each in its own context)
- **`library-curator`** — component health AND the view-layer gap: repeated UI
  that *should* be a registered component/block but isn't (sidebars, layouts,
  cards, page frames living inside app folders), and coverage of the **full view
  layer** (every screen/section), not just what's already registered. This is the
  "UI/UX that isn't a component but should be" finding — the heart of the report.
- **`codebase-surveyor`** / **`system-mapper`** — structure, surfaces, and
  backend/architecture coverage, so the report accounts for the build *as built*.
- Read what the hub already knows: the catalog (`getCatalog()`), the system map
  (`data/system-map.json`), the knowledge manifest, foundations seed. The report
  describes the SAME reality these render.

### 2. Verify counts — no "X here / Y there"
Every numeric claim must equal what the hub displays. Derive counts from the hub's
own data, and mark count-bearing stats with **`derivedFrom`** (`"components"` |
`"blocks"` | `"templates"`) so the page re-derives + verifies them at render:
```json
{ "label": "components", "value": "15", "derivedFrom": "components" }
```
If a stat has no `derivedFrom` it's taken as-authored — so only omit it for genuinely
qualitative numbers (scores, percentages). The Reports page shows a **count-mismatch
banner** if any derived stat disagrees with `getCatalog()`; a clean report shows none.
Cross-check area counts (sources, areas, entities) against `/synclair/knowledge` and
`/synclair/system` the same way before you write them into prose.

### 3. Write the report JSON (append-only)
Write `data/reports/<id>.json` conforming to `ReportDoc` (`lib/system/reports.ts`):
`id` (= filename stem, date-first, unique), `type`, `subject`, `date`, `headline`,
`dek`, `stats[]`, optional `surfaces[]`/`pillars[]`, `areas[]` (per-section
`{ id, name, status, found, gap, next, href }`), and `recommendations[]`
(`{ id, track, area, title, detail, status, delta }`). Ranked, plain-English,
backend-free — each rec a change the user *chooses* to run.

- **Re-run after fixes:** copy the prior report to a new dated `id`, flip cleared
  recommendations to `status: "done"` (or `"in-progress"`), update the affected
  area's `found`/`gap`/`next`, and re-verify counts. Keep the old file.
- **Stable rec ids** (`A1`, `B2`, …) so progress is traceable across reports.

### 4. Confirm it renders
Bring the hub up (`preview-server`) and open `/synclair/reports`: the new report is the
default, the archive lists prior runs, the header reads **verified** (no mismatch
banner). If it reads "N count mismatch," a stat disagrees with the catalog — fix the
number, not the badge.

## Layer

The report **content** is SEED (a project's `data/reports/*.json`) — it stays in the
clone, like knowledge and system-map data. The schema, loader, page, and this skill
are foundation. Don't commit a specific project's report to the foundation repo.

## Wiring into intake

`existing-project-intake` ends by producing the first report: after the galleries,
knowledge, system map, and foundations are populated, run this skill so the intake
closes with a `/synclair/reports` baseline the user can read and act on. See
`existing-project-intake` and `component-library` (the invention gate the
view-layer findings feed).
