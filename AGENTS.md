<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Synclair — project router

**This is the shared router for _every_ agent working in this repo** — Claude Code,
Codex, Cursor, Copilot, Gemini, Aider, or a human. Read it at the start of any task.
It holds **no knowledge, only a map**; the knowledge lives in the files it points to.
(Claude Code loads this via an `@` import from `CLAUDE.md`; other agents read it
directly as `AGENTS.md`.)

Synclair is this project's foundation — one aligned source of truth (design tokens,
components, and knowledge) for humans and agents. Architecture:
**[`docs/foundation-model.md`](docs/foundation-model.md)** (read before restructuring anything).

> **The project is the product, not Synclair.** This repo *builds* a product;
> Synclair is the foundation it's built on — infrastructure, not the subject. When asked
> what the project is / what's being built / for an overview or summary, answer
> about the **product** and keep Synclair out of it (→ the `project-identity`
> capability below). Treat Synclair as the subject **only** when the task is
> maintaining or syncing the foundation itself (→ the `synclair` capability).

## The hub and the product it catalogs

This repo IS **Synclair** — a **hub-only** app (see [`docs/foundation-model.md`](docs/foundation-model.md)):

- **Synclair** (`app/synclair/*`, mounted at **`/synclair`**) catalogs the
  components and views a product produces. Its mount point is the one constant
  `SYNCLAIR_BASE` in `lib/system/routes.ts`; link into it via the `synclair()`
  helper, never a hardcoded `/synclair`. The root `/` just redirects to the hub.
- **The product itself lives elsewhere** — its own repo/app on its own server
  (existing-project/companion mode), never a route in this app. This app catalogs
  it; it is not the product. The product remains the *subject* of the project.

## Where things live

Everything below is a **Synclair** route (under `/synclair`).

| Need | Source of truth | Human view |
|---|---|---|
| Design tokens (color, type, spacing) | `lib/system/tokens.ts` (brand values in `lib/system/seed/`) | `/synclair/foundations` |
| Components / blocks / templates | `registry.json` | `/synclair/components` · `/synclair/blocks` · `/synclair/templates` |
| Component usage / API | colocated `*.docs.tsx` + `lib/system/docs.ts` | `/synclair/{tier}/[name]` |
| Skills & agents | `.claude/skills`, `.claude/agents` | `/synclair/ai-setup` |
| **Knowledge sources** (specs/PRDs/Figma/decks) | `lib/system/knowledge/sources.ts` | `/synclair/knowledge` |
| **Project summaries** (onboarding briefs/diagrams per audience; regenerate via `product-summary` skill) | `data/knowledge/summaries/` | `/synclair/knowledge` |
| **References** (project library — prior art, findings, recommendations; append as you research) | `lib/system/references.ts` | `/synclair/references` |
| **Host component catalog** (existing-project mode — the host app's components; props derived live from host source, coverage via `npm run check:coverage`, freshness via `npm run check:host`; live imports via `port-host-component` Path A — contract: [`docs/rendering-parity.md`](docs/rendering-parity.md)) | `data/external-catalog.json` (schema: `lib/system/external.ts`) | `/synclair/components` (`origin: "external"`, shown as "Host") |
| **Foundation hygiene** (where host code steps outside its own foundation — inline styles, raw colors, arbitrary values, bypassed primitives; regenerate via `npm run scan:hygiene`) | `data/host-hygiene.json` (schema: `lib/system/host-hygiene.ts`) | `/synclair/hygiene` |
| **App surfaces** (multi-frontend projects — e.g. web + React Native sharing a backend; empty seed = single frontend, zero extra chrome; spec §5b) | `lib/system/seed/surfaces.ts` (mechanism: `lib/system/surfaces.ts`) | `/synclair/library` (per-surface drill-in) · `/synclair/library/[surface]/...` scoped explorer |
| **System map** (what the codebase consists of beyond the UI — areas, API surface, data model, jobs, integrations; regenerate via `codebase-map` skill) | `data/system-map.json` (schema: `lib/system/system-map.ts`) | `/synclair/system` |
| **Setup mode** (how this clone is wired to the product — `embedded` inside the repo vs `watcher` beside it; topology, not "sync" — [`docs/setup-modes.md`](docs/setup-modes.md)) | `data/setup.json` (schema: `lib/system/setup.ts`) | mode badge in the hub chrome |
| **Foundation freshness** (opt-in call-home: is this clone behind the mother repo? Baseline sha + GitHub compare API, `npm run call-home`; pulling stays deliberate via `synclair-sync`) | `data/mother.json` (mechanism: `lib/system/mother.ts`) | `/synclair/environment` › Synclair view |
| Repo activity (recent commits + diffs; git is the shared DB — spec §11) | local git (`lib/system/git-log.ts`) | `/synclair/github` |
| Non-obvious project facts | `memory/MEMORY.md` (index) | — |

## Capabilities (skills) — how any agent uses them

This project's reusable know-how is packaged as **skills**: plain-markdown guides at
`.claude/skills/<name>/SKILL.md`, each with a one-line description of *when* it
applies. They are not Claude-only — the format is portable:

- **Claude Code** auto-surfaces them by description and invokes them by name.
- **Any other agent:** when a task matches a skill's *when*, **open and read that
  `.claude/skills/<name>/SKILL.md`** (and any `references/*.md` it points to) before
  proceeding. That is the manual version of the same progressive disclosure.

Every skill and agent frontmatter carries two classifiers, surfaced on
`/synclair/ai-setup` so a human can see what each is and where it came from:
**`category:`** (`build` · `knowledge` · `intake` · `foundation` · `tooling` —
the taxonomy in `lib/system/capability-categories.ts`) groups them, and
**`layer:`** (`foundation` = ships with Synclair and syncs from upstream;
`project` = this repo's own, never syncs) drives the "Origin" badge. Set both
when you create a capability — a missing `category` lands in "Other", a missing
`layer` defaults to `project`.

**Before adding a new skill or agent**, clear the **capability gate** in the
`synclair` skill: prove no existing capability covers it (extend/distill into it
instead), pick skill-vs-agent by whether it needs its own context window, and
declare its layer + category. The way this set stays solid is a gate at
creation, not a size limit.

Key ones for orientation (browse `.claude/skills/` for the full set):

| When | Read |
|---|---|
| "What is this project / what's being built / overview / summary" | **`project-identity`** — answer about the product, not the foundation |
| Maintaining/syncing the Synclair foundation itself | **`synclair`** |
| Building any view/screen/feature | **`build-view`** (Figma is a guide, not a spec) |
| A specific product area's requirements | **`product-spec`** → `references/<area>.md` |
| Creating/changing a reusable component | **`component-library`** (invention gate + registry) |
| UX documentation for any library item — intent, wireframes, interactions, responsive; "docs stale" / `check:ux-docs` drift | **`ux-doc`** — depth per tier, wireframe vocabulary, commit-anchored sync; drafts via the `ux-doc-writer` digger |
| Distilling a Figma file into knowledge | **`figma-distiller`** (per-page digests via the `figma-frame-reader` digger) |
| Authoring/reviewing any generated read (summary, System Map, UX doc, reference) so it's scannable + consistent | **`doc-quality`** — medium follows content shape; the shared artifact frame; diagram conventions |
| Populating Synclair from an existing HOST codebase (companion-clone mode) | **`existing-project-intake`** — survey → system map → knowledge → tokens → component catalog, via the `codebase-surveyor` / `system-mapper` / `knowledge-harvester` / `token-archaeologist` / `component-cataloger` diggers |
| Visibility into what's IN the repo — backend, APIs, database, jobs ("what is this system made of") | **`codebase-map`** — generates/refreshes `/synclair/system` via the `system-mapper` digger; works on this repo or the host |
| Bringing up the dev/preview server | **`preview-server`** (port 4100) |

## When to consult what

- **Building any view** → `build-view` skill first (Figma is a guide, not a spec).
- **Need a spec/PRD/design detail** → check `lib/system/knowledge/sources.ts` (or
  `/synclair/knowledge`) for the source-of-record. Read the *distilled digest*
  (`distilledInto`, in `product-spec`) first; dig into the raw source via the
  `prd-retriever` agent (in its own context) only when the digest is insufficient —
  then **write the durable part back** into `product-spec`.
- **Creating/changing a component** → `component-library` skill (pass the invention gate; register it).
- **Styling** → reach for a semantic token (`lib/system/tokens.ts`); no raw hex/px.
  This is **lint-enforced** — so are hardcoded `/synclair` paths (use `synclair()`). The
  error messages tell you the fix; don't `eslint-disable` around them.

## Set up this foundation for a project

This is a fresh Synclair clone with the seed blanked. Two paths:

- **New project** (the project IS the clone): [`docs/new-project.md`](docs/new-project.md)
  — reseed brand/theme, an optional domain skill, knowledge sources, and identity.
- **Existing project** (Synclair as a companion next to an app that
  already exists): [`docs/existing-project.md`](docs/existing-project.md) — sibling
  clone, separate server on port 4100; Synclair is at `localhost:4100/synclair`, never a
  route inside the host app.
- **Staying current** (any clone, later): the `synclair-sync` skill /
  `scripts/synclair-sync.sh` — pulls foundation updates from the mother repo as a
  git merge; seed never syncs.

## Rules

- **Link, don't copy.** Raw PRDs/decks/Figma stay canonical in Drive/Figma/GitHub
  and are *linked* from the knowledge manifest. The repo holds distilled digests,
  not raw dumps.
- **Distill back (the flywheel).** When a dig surfaces something durable, add it to
  the relevant skill/digest so the next agent doesn't start blank.
- **Verify before done.** `npm run verify-ui` (typecheck + lint guardrails +
  registry drift check + render coverage — every library item must render
  visually, `check:previews`) must pass before any view/component work is called
  finished. It is the machine-enforced version of the styling and registration
  rules above; the `synclair-steward` skill is the eyes-on review gate that
  runs after it.
- **Dev server on port 4100** (never 3000). Don't `next build` in the dev dir — it
  hangs Turbopack; clear `.next` to recover.
