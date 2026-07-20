---
name: existing-project-intake
category: intake
layer: foundation
description: Discover and populate Synclair from a HOST codebase that already exists (existing-project mode) — survey the repo, harvest its knowledge sources, extract its design tokens, and catalog its components into the hub. Use when Synclair was just cloned beside an existing app and the hub is empty, or when asked to "populate synclair from the codebase", "catalog the host app", "intake the existing project", "make the hub reflect our app", or to refresh a stale host catalog (check:host drift). NOT for new projects (docs/new-project.md) and not for the initial clone/reseed mechanics (project-bootstrap + docs/existing-project.md — run those first).
---

# Existing-project intake — populate the hub from the host codebase

Synclair over an existing app starts as an empty hub. This skill fills it: five digger agents read the HOST repo (each in its own context), and **you write their digests into the seed files**. The result: `/synclair/knowledge`, `/synclair/system`, `/synclair/foundations`, and the component galleries describe the host's reality instead of nothing.

**Works in both existing-project topologies** (`docs/setup-modes.md`): **watcher** — this clone sits *beside* the host as a sibling repo; and **embedded** — this clone sits *inside* the host repo at `./synclair`, so the host root is the **parent/ancestor** of cwd. The only thing that differs is the host `root` path you record in Phase 0 (sibling `"../acme-app"` vs. embedded `".."` / `"../apps/web"`); every digger takes the root as input, so the survey is identical either way.

**Prerequisites** (else → `project-bootstrap` / `docs/existing-project.md` / `co-locate-synclair` first): this clone sits beside OR inside the host repo, `npm install` has run, and identity is reseeded (`lib/system/seed/project.ts` names the host product).

**Division of labor is strict:** diggers READ the host and PROPOSE; only you (the main thread) WRITE files in this repo. Diggers never edit; you never bulk-read the host.

## Phase 0 — confirm topology, pin the host(s) + declare surfaces

**FIRST, settle topology with the user — never default it.** Existing-project setup is two orthogonal axes (`docs/setup-modes.md`): this skill is the *seeding* axis (intake from existing code); the *topology* axis — **embedded** (this clone lives *inside* the host repo at `./synclair`, host root is the parent `..`) vs **watcher** (this clone is a *separate sibling* beside the host, host root is `"../acme-app"`) — is the **user's call**. It's not cosmetic: topology sets the host `root` you record AND it materially changes rendering — embedded keeps the host source in-repo so live-import (Path A, Phase 4) is clean and durable; watcher crosses a repo boundary so the compat gate is stricter and cards more often fall back to documented-only. So **if `data/setup.json` isn't already resolved** (a fresh `co-locate-synclair` / `project-bootstrap` install writes it), **ASK the user embed vs watcher before pinning anything** — don't infer it from whichever directory you happen to be running in, and don't pick the faster one for yourself.

Then confirm the host repo path with the user, and write it where every later run and digger finds it:

- `data/external-catalog.json` → `hosts: [{ name, root, surface }]` (roots **relative to this repo**). Pick by topology: **watcher/sibling** → `"../acme-app"`, or monorepo workspaces `"../acme/apps/web"`; **embedded** (this clone is `./synclair` inside the host) → the host root is the **parent**, so `".."`, and its monorepo apps are `"../apps/web"`, `"../apps/mobile"`. Declaring a host whose root is an ancestor of cwd is exactly what makes `detectSetupMode()` resolve `embedded` — so don't omit it.
- A `memory/` entry (host path(s) + one-line stack description) indexed in `MEMORY.md`.

**Record the setup mode** (the answer the user just gave). Write `data/setup.json` now that the host is pinned: `{ "mode": "embedded" | "watcher", "resolvedAt": "<ISO now>", "resolvedBy": "install" }` — `embedded` when the host root is `..`/an ancestor, `watcher` when it's a sibling; these MUST agree (a `..` root with `"mode": "watcher"` is a contradiction — re-confirm with the user). Matches `recordSetupMode()` in `lib/system/setup.ts`; blanked to `{ "mode": null }` by `synclair-reset.sh`, so re-record after a reset.

**Surfaces.** If the host ships MORE THAN ONE frontend (a web app + a React Native/Expo companion, a monorepo with two apps), each is a **surface** — see `lib/system/surfaces.ts`. After the survey confirms what exists (Phase 1's "Surfaces" section), **ask the user to confirm** the detected surfaces, then declare them in `lib/system/seed/surfaces.ts` (one entry per frontend: `id`, `label`, `platform`, `root`, `framework`) and give each catalog host its `surface` id. **Single frontend = leave the seed empty** — the hub then shows zero multi-surface chrome. Don't invent surfaces for one responsive web app; responsive ≠ a second surface.

**Live RN previews** are a per-project decision, not a default: host components only ever preview via screenshot/embed (their source is never imported). Offer `liveRender: true` on an RN surface only if the team will port RN components INTO this clone; if the host mobile app has Expo web or Storybook, record embed URLs in examples instead.

## Phase 1 — survey (`codebase-surveyor`)

Launch the surveyor with the host root(s). It returns stack, structure map, conventions, load-bearing areas, a **Surfaces** section (distinct deployable frontends), and **pointers for the other diggers**. Write back:

- Each host's `framework` + `surveyedAt` in `data/external-catalog.json`.
- Detected surfaces → confirm with the user → `lib/system/seed/surfaces.ts` (Phase 0 above).
- The 3-5 durable facts it flags → `memory/` entries.
- A pointer in the HOST repo's `AGENTS.md`/`CLAUDE.md` if missing (see `docs/existing-project.md` §4).

Phases 1b-4 all take the surveyor's pointers as input. 1b, 2, and 3 are independent — run those three diggers in parallel; 4 reads best with the survey in hand.

## Phase 1b — system map (`system-mapper`)

The backend/architecture half of visibility: launch the `system-mapper` with the host root + the surveyor's digest. It returns a complete `data/system-map.json` (schema: `lib/system/system-map.ts`) — areas, API surface, data model, jobs, integrations. Write-back, validation, and the freshness rule live in the **`codebase-map`** skill — follow its "Generate" procedure (validate → write whole file → `/synclair/system` renders). Secrets discipline: names only, never values.

## Phase 2 — knowledge (`knowledge-harvester`)

Returns proposed `KnowledgeSource` entries, distillation priorities, and questions. Write back:

- Entries → `lib/system/knowledge/sources.ts`. Respect the manifest convention: sources that are pure pointers with no digest yet stay `access: "linked"` (host-repo docs too — `kind`/`access: "repo"` is reserved for digests distilled into THIS repo), but a source only *earns* its place once distilled — so distill the top priorities next, not later.
- Distill the top 2-3 priorities now (or launch `prd-retriever` per area): digests land in `product-spec` `references/<area>.md`, then set `distilledInto`/`distilledAt` on the manifest entries.
- Figma files it found → the `figma-distiller` flow, not manual digests.
- Ask the user its open questions (where PRDs live, etc.) before inventing entries.

**Then generate the onboarding brief (don't leave Knowledge summary-less).** A
freshly-intaken hub that lands on an empty Summary tab reads as unfinished to a
product owner. Once the manifest + system map exist, author the **`onboarding-brief`**
summary via the `product-summary` skill: one page — what the product is, who it's
for, the core areas + the primary flow, how it's built at a glance, and any
license/enterprise boundary. Product-only (`project-identity`), grounded in the
survey + system map + harvested sources; assert no dates/metrics the repo doesn't
document. Write `data/knowledge/summaries/<id>-<date>.md` + its `index.json` entry
so the Summary tab opens on it. (If a domain skill or distilled `product-spec`
digests exist, use them; otherwise the survey/system-map facts are enough for a
first brief — regenerate later as knowledge deepens.)

## Phase 3 — tokens (`token-archaeologist`)

Returns proposed brand ramps, typography/spacing/radius, extra foundation categories, theme-slot mapping, and scale gaps. **Foundations syncs ALL of these, not just colors.** Write back:

- **Colors** → `lib/system/seed/brand-ramps.ts` (companion mode: use `bg-[#hex]` arbitrary classes so swatches are self-contained DATA that never restyle the hub).
- **Typography, spacing, radius, + agent-decided extra categories** → `lib/system/seed/foundation.ts` (`PROJECT_FOUNDATION`): host `fonts`, custom `type`/`spacing`/`radii` (leave an array EMPTY when the host uses its framework default — Foundations then says "framework default" rather than showing the hub's values — and note it in `notes`), and one `sections` entry per real extra category the dig found (logo, brand guidelines, iconography, elevation, motion; or a "brand is runtime/per-tenant" note for SaaS). These become the Foundations tabs.
- **Examples sample — REQUIRED, and it must not be empty.** Writing a `sample` makes the **Examples tab the default landing tab of Foundations**, so an authored `sample` with no composed tiles ships an *empty first impression* — the page opens on a blank box and reads as "Foundations wasn't filled out" even though Color/Type/Spacing/Shape all render. That is the specific failure to avoid. So it's all-or-nothing: **either** bundle the host's core custom properties verbatim into `sample` (`vars` + `fontFamily`) **AND in the SAME pass compose the tiles** inside `ExamplesShowcase` (`components/library/foundations.tsx`) against those var names — module page header, button hierarchy, status badges, a form field — so the default tab leads with real applied UI; **or** omit `sample` entirely so Foundations defaults to Color. Never author `sample` and leave the tiles uncomposed. Before calling Phase 3 done, open `/synclair/foundations` and confirm the **default** tab renders content, not an empty frame.
- **Companion mode keeps the hub neutral:** DON'T write host theme values into `app/globals.css` or `lib/system/tokens.ts` — that restyles the hub itself (the mistake to avoid). Those two files are only the sanctioned home for raw hex/px in **new-project** mode (the clone IS the product). In companion mode, everything the host contributes lives in `lib/system/seed/` as data.
- Where its proposal is low-confidence (mined, not declared; conflicting values), show the user the conflict and let them pick — don't launder ambiguity into the seed.

## Phase 4 — components (`component-cataloger`)

Launch with the surveyor's component pointers; let it discover by usage ranking (start with the top ~10-20, not everything). **Multi-surface projects: run the cataloger ONCE PER SURFACE** (separate context each), telling it the surface id + that surface's host root — each emitted entry carries `"surface"`. It returns `ExternalItem` JSON entries (schema: `lib/system/external.ts`). Write back:

- Entries → `data/external-catalog.json` `items` (merge by `(surface, name)` — the same name on DIFFERENT surfaces is legal and expected, e.g. a web `button` and an RN `button`). **Name collisions with Synclair's own stock primitives are fine — the host entry wins.** Catalog precedence is registered > external (host) > native, so a host `button` supersedes Synclair's scaffolding `button` in the gallery (the host component IS the project's design system). Only a REGISTERED item (one ported through the invention gate) outranks a host entry. So DON'T host-prefix a component just because Synclair ships a same-named primitive; keep the host's real name. Prefix only to disambiguate two genuinely different host components that share a name on the same surface.
- Screenshots are YOURS to capture, not the cataloger's (it has no browser): with the HOST app's dev server running, screenshot the component in situ (browser/webapp-testing tooling) → `public/external/<name>.png` (multi-surface: `public/external/<surface>/<name>.png`), referenced from an example's `image`. RN surfaces: screenshot via Expo web or a simulator, or record an Expo-web/Storybook `embed` URL. Optional — entries render fine with code-only examples; skip rather than block on a host server that won't start.
- **Don't author `props` when the host is on disk** — the doc page derives the props table live from the host's TypeScript (`lib/system/host-docgen.ts`), so authored props are dead weight that drifts. Author them ONLY as a fallback for entries whose source the derivation can't read (spot-check the doc page: no props table → author them).
- Its **port candidates** → surface to the user; porting goes through the `component-library` invention gate and REPLACES the external entry (a registered item supersedes it by name). **Prefer porting over screenshots for anything that can run in a browser** — components and blocks alike go live via `port-host-component`; screenshots are the fallback for native-module/server-only items, not the end state for web UI.
- **Tier calls (`kind`)** the cataloger flags as contestable → put them to the `tier-arbiter` agent before writing the catalog; its rubric (`.claude/agents/tier-arbiter.md`) is the single decision procedure for component vs block vs template.
- **Then make the rendered-previews DECISION — don't let it default silently.** A freshly cataloged library shows code-only entries, which reads as broken to anyone expecting a component library ("why don't the components render?"). Before calling intake done, put the explicit choice to the user for each surface's top primitives: **(a) live-import them** (`port-host-component` Path A — the host's actual source rendering in a scoped product theme; the default pick when the compat gate passes), **(b) rewrite-port** (Path B, when imports can't work), **(c) screenshots in situ** (host dev server running → `public/external/...`), or **(d) documented-only accepted** (record who accepted it and why in the intake notes/memory — and know that `check:previews` inside verify-ui stays red until every entry has a live import, port, or screenshot; (d) is accepting that red gate, not silencing it). Deferring is fine — but it's the USER's deferral, not the agent's.
- **Blocks and templates on a web surface are NOT a decision — they live-import.** For host `kind: "block"`/`"template"` entries whose surface is web and whose host is checked out, `check:previews` hard-fails documented-only entries: a screenshot is a card thumbnail, not a render, and a block gallery of PNGs is exactly the "why don't the components render?" failure. Live-import each one (Path A) as part of THIS phase — screenshots remain the path only for non-web surfaces (RN without `liveRender`) and absent hosts. Cataloging a web block isn't done until its doc page renders the host's actual block.
- Run `npm run check:host` — must pass (it verifies your written hashes against the host).
- Run `npm run check:coverage` — the anti-fiction sweep (docs/rendering-parity.md). It diffs the LIVE host scan against the catalog both ways: **uncataloged candidates** (triage — real design-system pieces get cataloged, page one-offs get ignored; the initial dig always leaves a tail, and the gallery shows the honest count) and **cataloged-but-unused** entries (zero host imports — dead host code worth flagging to the team, or catalog noise worth pruning; never leave them unexamined, that's how catalogs become fiction).
- Run `npm run scan:hygiene` — writes `data/host-hygiene.json` so `/synclair/hygiene` shows where the host steps outside its own foundation (inline styles, raw colors, arbitrary values, bypassed primitives). Advisory; feeds the build report's story.

## Phase 4b — app sitemap (`pages-map`)

Cataloging the *pieces* isn't the whole app — map the **screens** too, as part of intake, not as a follow-up. Run the **`pages-map`** skill against the host now: it launches the `page-mapper` digger and writes `data/pages-map.json` (every route/view, the components/blocks/templates each composes, navigation edges, and a live-preview URL per screen) so `/synclair/pages` shows the whole app at a glance instead of its empty state. Follow that skill's Generate procedure (validate → write whole file → `check:pages` passes).

- **Live route previews need the host running.** So this phase is also where you record the host's local dev server(s) in `data/dev-servers.json` (local URL + boot command — `lib/system/dev-servers.ts`), so `/synclair/pages` lights up real previews when the host is up and offers to boot it when not. If the host can't be booted here (e.g. it needs a local DB), still write the pages map from the router; note the previews are pending in the build report.
- Single-frontend hosts map one route tree; multi-surface hosts map per surface (the `page-mapper` takes the surface's host root, same as the cataloger).

## Phase 5 — build report (`build-report`) — REQUIRED, closes every intake

Intake does not end with populated galleries — it ends with the **first build
report**: run the **`build-report`** skill once every section above is written.
It launches `library-curator` (+ reads the survey/system-map you already have),
verifies every count against the hub's own data, and writes
`data/reports/<date>.json` so `/synclair/reports` renders the baseline in the
sidebar — per-section findings (including the view-layer gap: UI that should be
a component but isn't), readiness pillars, and ranked recommendations the user
acts on next. This is the intake's actual deliverable to a stakeholder; a chat
summary is not a substitute and does not satisfy it. "No findings" is still a
report — the baseline records what's clean, and later runs diff against it.

## Refresh (drift) — the recurring loop

**The hub is a LIVING mirror of the host, not a one-time snapshot.** As the host team ships new components, styles, and screens, the intake artifacts must keep up — each has a freshness signal:

- **Components** — `npm run check:host` compares each entry's `sourceHash` to the live host source. On drift: re-launch `component-cataloger` scoped to the stale names, merge the refreshed entries, re-run the check. Detection is also AMBIENT: the sidebar's Host badge (commits since intake + uncataloged count, `lib/system/host-status.ts`) and the components gallery's live-scan line surface drift on every render — when they go amber, run this loop.
- **Coverage / fiction** — `npm run check:coverage` on each refresh pass: triage new uncataloged candidates, and prune or flag cataloged-but-unused entries (the catalog must never list things the app doesn't have or use).
- **Hygiene** — re-run `npm run scan:hygiene` after the host moves (the report records the host commit it scanned).
- **Design foundation (colors/type/spacing/radius)** — the same `check:host` run WARNS when the host's `styleSources` (tailwind config, globals.css, theme module — recorded on `hosts[]`) change since the token dig. On that warning: re-launch `token-archaeologist`, refresh `brand-ramps.ts` + `foundation.ts`, and **update the `styleSources` hashes**. (Warning, not a hard fail — a stale palette is "may have drifted", not "wrong".)
- **System map** — no per-entry hashes; regenerate it whole via `codebase-map` on structural host changes (new area/service, schema migration, API reshape).
- **Knowledge / summary** — re-harvest on a new docs tree; regenerate the onboarding brief (`product-summary`) after knowledge changes (the Summary tab shows "Knowledge changed since generated").
- **Build report** — after any refresh pass or after shipping work against its recommendations, re-run `build-report` (append-only: a NEW dated `data/reports/*.json` with cleared recs flipped to `done`; the archive keeps the baseline).

Re-run the surveyor only on big host changes (new framework). Memory + manifest updates follow the same write-back paths as above. (In NEW-project mode there's no host to drift from — the clone IS the product, so Foundations/galleries read the repo's own tokens + registry LIVE and stay current automatically.)

## Definition of done (any intake or refresh pass)

- [ ] `data/external-catalog.json` has `hosts` (correct `root` for the topology — `..`/ancestor for embedded) + entries; `npm run check:host` passes
- [ ] `npm run check:coverage` run and triaged (uncataloged candidates dispatched or consciously deferred; zero-usage entries pruned or flagged)
- [ ] `npm run scan:hygiene` run; `/synclair/hygiene` renders the host's foundation drift
- [ ] **Topology was ASKED, not defaulted** — the user chose embed vs watcher; `data/setup.json` resolved (`"mode": "embedded"` or `"watcher"`, agreeing with the host root), not `null`
- [ ] Multi-frontend hosts: surfaces declared in `lib/system/seed/surfaces.ts` (user-confirmed) and every catalog entry carries its `surface`
- [ ] `data/system-map.json` written; `/synclair/system` renders the host's anatomy
- [ ] **App sitemap mapped** — `pages-map` run; `data/pages-map.json` written, `/synclair/pages` renders, `npm run check:pages` passes; host dev server recorded in `data/dev-servers.json` (or previews noted pending in the report)
- [ ] `lib/system/knowledge/sources.ts` populated; top priorities distilled with `distilledInto` set
- [ ] Onboarding brief generated (`data/knowledge/summaries/` + `index.json`) so the Knowledge Summary tab isn't empty
- [ ] Seed reflects the host brand (`brand-ramps.ts` + `foundation.ts`) or the user chose to keep neutral
- [ ] **Foundations' default tab isn't empty** — either `sample` + composed `ExamplesShowcase` tiles render on the Examples tab, or `sample` is omitted so Foundations opens on Color (verify by loading `/synclair/foundations`)
- [ ] **Rendered previews decided** — for each surface's top primitives: ported live (`port-host-component`), screenshotted in situ, or documented-only explicitly accepted by the user (never silently deferred)
- [ ] **Web-surface blocks/templates render LIVE** — every host block/template on a web surface with the host on disk is live-imported (Path A); `npm run check:previews` enforces this, screenshots don't satisfy it
- [ ] **Build report generated (`build-report`)** — `data/reports/<date>.json` written; `/synclair/reports` renders it with the verified badge (no count-mismatch banner). An intake without a report is not done.
- [ ] Memory entries written; host repo's router points here
- [ ] `npm run verify-ui` passes
- [ ] The flywheel note: anything durable a digger surfaced is distilled into a skill/digest, not left in the conversation

## Honest limits

External entries are *documented entities* — the hub can't live-render or lint host code, and host usage counts come from the cataloging pass, not this repo's import graph. First-class treatment (live previews, guardrails, registry) requires porting through the invention gate.
