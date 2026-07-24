# Synclair — Foundation Model

> **Synclair** is the reusable setup/foundation this repo becomes — it gives
> *clarity* to a project's setup: one aligned source of truth for design tokens,
> components, and AI context, for humans and agents alike.
>
> This is the spec for turning Synclair from "a shadcn admin tool" into a
> **platform-agnostic governance layer** that can be cloned as the starting
> foundation for any project — web or mobile — while its own UI stays
> Next + shadcn + Tailwind.
>
> **Repo direction:** this repo *is* Synclair (the foundation). The
> project-specific layer — brand ramps, the Figma
> manifest, the domain skill/agent — is "seed" content that gets
> extracted/reseeded. Each new project is a clone of Synclair.

This document is the boundary contract. Humans read it to understand what's
reusable vs. what's this-project-only. Agents read it to know which files are
safe to treat as a stable framework and which are meant to diverge.

---

## 1. What this thing is (and isn't)

Synclair is a **context and governance layer** for the design system of the
app you're building. Its purpose is to be the single aligned source of truth —
for humans browsing and for agents building — so everyone stays consistent.

Three principles fix the architecture:

1. **Synclair documents the app's design system; it does not execute it.**
   A component in the gallery is a *documented entity* — tokens, spec, usage
   rules, code snippet, and a picture. Live-rendering the component inline is
   just *one way to draw the picture*, and it only works today because Synclair
   and the app happen to share a stack. It is not the definition.

2. **One source, two renderings.** Every fact (a token, a component's usage)
   lives once in `lib/system/*` data and is projected two ways: an HTML page for
   humans and a machine-readable form for agents. They cannot drift because they
   derive from the same bytes.

3. **Clone, sync deliberately.** The foundation is cloned as a project's
   starting point and diverges freely — nothing syncs automatically, and the
   project's seed never syncs at all. But clones keep the foundation as a git
   `upstream` remote (ancestry preserved), so a project can *choose* to pull
   foundation updates with an ordinary merge: seed conflicts resolve "keep
   ours", Brain/Synclair-skin conflicts "take upstream's". The seed inventory (§8)
   is the merge contract; the mechanism is `scripts/synclair-sync.sh` + the
   `synclair-sync` skill. The reverse direction (promoting a project's
   foundation improvement upstream, §"flywheel") becomes a cherry-pick + PR
   for the same reason.

**Non-goals:** Synclair is not a runtime dependency of the app, not a live
playground bound to the app's stack, and not a package the app imports.

---

## 2. The three layers

| Layer | What it is | Rate of change | On a new project |
|---|---|---|---|
| **Brain** (portable) | The governance model: token vocabulary + semantics, tiers, the docs contract, search, AI setup, the invention gate, and the **knowledge layer** (§9 — how project docs/PRDs/decks become agent context) | Stable across projects | Cloned, kept; content reseeded |
| **Adapter** (swappable) | The platform-specific seams: how a preview is *depicted*, how tokens are *exported*, how components are *distributed* | Swapped per target platform | Pick one: `web-shadcn`, `react-native`, `swiftui` |
| **Synclair skin** (fixed) | The UI itself — routes, gallery, docs renderer, ⌘K, sidebar | Same on every project | Always Next + shadcn + Tailwind |

The key realization: **Synclair's skin being shadcn is unrelated to what the app is
built in.** A React Native project still gets a web-based, shadcn Synclair UI. Only
the *adapter* changes.

---

## 3. File-by-file: what's brain, adapter, or skin

Grounded in the current `lib/system` + `components` tree.

### Brain — clone and keep
- `lib/system/search-index.ts` — pure metadata index. Fully portable.
- `lib/system/tiers.ts` — the Components / Blocks / Templates concept. Portable
  (only the prose "shadcn primitives" is web-flavored; reword per platform).
- `lib/system/doc-types.ts` — the `ComponentDoc` contract + the `Preview` union
  and `live()` helper. ✅ The §4a refactor is **done**: examples/states carry a
  `Preview`, not a raw node, so the contract is now platform-neutral.
- `lib/system/tokens.ts` — the token *vocabulary*, *semantics*, and *usage
  strings* (platform-neutral). The brand *values* have been extracted to
  `seed/` (below). **Adapter-tinted:** the `bg` / `className` / `w` fields are
  Tailwind bindings (see §4b).
- `lib/system/git-dates.ts` — infra. Portable.
- `lib/system/external.ts` — the external (host-app) component catalog for
  existing-project mode: schema, loader, and ComponentDoc synthesis for host
  components documented without being imported. The *mechanism* is Brain; the
  catalog *data* (`data/external-catalog.json`) is seed. Freshness is
  machine-checked by `scripts/check-host-drift.mjs` (`npm run check:host`).

### Adapter — swap per platform
- `lib/system/adapters/` — ✅ the platform seam: `types.ts` (`PlatformAdapter`),
  `web-shadcn.tsx` + `react-native.tsx` (render each `Preview.kind`), `index.ts`
  (`adapterFor(surface)` — a per-item registry keyed by surface platform, §5/§5b).
  Add an adapter file here to target another platform.
- `lib/system/components.ts` — reads shadcn's `registry.json`. The
  `RegistryComponent` *shape* is brain; the **format it parses** is web-adapter.
- `registry.json` + `public/r/*.json` — shadcn distribution format. Web-adapter.
- `components/**/*.tsx` + `components/**/*.docs.tsx` — the actual app components
  and their live-render previews. Web-adapter + app content.
- `preview-server`, `shadcn`, `build-view`, `component-library` skills — assume
  a shadcn/Tailwind/Next target. Web-adapter.

### Seed — reseed per project (the extractable seed layer)
- `lib/system/seed/brand-ramps.ts` — the project's brand
  color ramps, extracted out of `tokens.ts`. Swap this one file for new brand.
- `app/globals.css` theme values, `data/figma-manifest/*`, `app/figma-manifest/*`.
- the project's domain skill + advisor agent (if one exists) — distilled
  domain knowledge. The *pattern* is Brain (§9); the *content* is seed.
- Full checklist in §8.

### Synclair skin — same everywhere
- Synclair is a **hub-only** app, mounted under **`/synclair`** (`app/synclair/*`).
  Its routes live in the `app/synclair/(hub)/` route group —
  `{page,foundations,components,blocks,templates,ai-setup,environment,
  knowledge,references,figma-manifest,…}` — wrapped by `app/synclair/(hub)/layout.tsx`
  (the sidebar + ⌘K shell). `app/synclair/preview/[name]` sits OUTSIDE the group on
  purpose: the chrome-free stage where self-referential blocks render their real
  composition (`components/library/preview-scenes.tsx`), embedded on doc pages via
  the `scene()` preview helper.
- `app/layout.tsx` is the bare shared shell (html/body/fonts/theme only); the root
  `app/page.tsx` simply redirects `/` to the hub. There is no co-located product
  app — the product lives elsewhere (its own repo/app on its own server) and this
  app only catalogs it.
- The product name is the one seed constant `project` (`lib/system/seed/project.ts`),
  read by the hub header; the mount point is the constant `SYNCLAIR_BASE`
  (`lib/system/routes.ts`), and every Synclair link goes through the `synclair()` helper.
- `components/blocks/app-sidebar`, `command-palette`, `source-editor`.
- These *render the brain data*. They stay Next + shadcn regardless of target.

---

## 4. The one refactor that unlocks platform-independence

Two places bake in "Synclair == the app's stack." Generalize both and the model
holds for mobile.

### 4a. `ComponentDoc.render` → a `Preview` representation

Today `DocExample.render` and `DocState.render` are `ReactNode` — i.e. the doc
*executes* the component. Replace the raw node with an adapter-supplied union so
a non-web adapter can hand back an image or embed instead:

```ts
type Preview =
  | { kind: "live"; node: ReactNode }   // web adapter: live render (today's behavior)
  | { kind: "image"; src: string; alt?: string } // mobile: screenshot / Figma frame
  | { kind: "embed"; url: string }      // Storybook / Expo Snack / device preview
  | { kind: "code" }                    // snippet only, no visual

interface DocExample {
  title: string
  description?: string
  code?: string
  preview: Preview        // was: render: ReactNode
}
```

The web adapter implements `preview` as `{ kind: "live", node }` — nothing
changes visually for this project. A mobile adapter implements it as `image` or
`embed`. Everything else in `doc-types.ts` (props, states, notes) is untouched.

### 4b. Token bindings become an adapter export

`tokens.ts` keeps the values, semantics, and usage. The *class bindings*
(`bg-primary`, `rounded-md`, `w-4`) move behind an adapter that turns a token
into platform code:

- `web-shadcn` → Tailwind utility class + CSS custom property
- `react-native` → StyleSheet value / a theme object key
- `swiftui` → a `Color`/spacing constant

The `figma-export-tokens` skill already emits many of these formats — the
adapter is largely wiring that output into the gallery's swatch rendering.

---

## 5. The PlatformAdapter interface

The whole swappable seam, in one shape:

```ts
interface PlatformAdapter {
  id: "web-shadcn" | "react-native" | "swiftui"

  /** Turn a design token into code the app consumes. */
  exportToken(token: Token): { code: string; className?: string }

  /** How a component is depicted in the gallery (see §4a). */
  preview(item: RegistryComponent): Preview

  /** How a component gets installed into the app. */
  distribution: {
    /** Command or snippet the gallery shows under "Install". */
    install(name: string): string
    /** How the registry is read (shadcn json | package | copy). */
    format: "shadcn-registry" | "npm" | "copy"
  }
}
```

The brain calls the adapter; it never imports platform code directly. ✅
Resolution is **per item, not per clone**: `lib/system/adapters/index.ts` keys
adapters by surface platform (`adapterFor(item.surface)` — see §5b), so a
single-platform project behaves like a global swap while a multi-surface
project has adapters *coexisting*.

## 5b. Surfaces — coexisting platforms

A **surface** is one deployable frontend of the product: "the responsive web
app", "the React Native companion app". Most projects have exactly one; a
monorepo (or sibling-repo pair) sharing a backend has several. The mechanism is
Brain (`lib/system/surfaces.ts`); the list is Seed
(`lib/system/seed/surfaces.ts`, empty by default = one implicit web surface).

The invariants:

- **Single-surface collapse.** With zero/one declared surfaces,
  `isMultiSurface()` is false and every piece of multi-surface UI renders
  nothing — it is byte-for-byte the single-app Synclair. All surface
  fields in data schemas are optional; old data files load unchanged.
- **Per-surface things:** component catalogs (names unique per
  `(surface, name)` — a web `button` and an RN `button` coexist), the library
  views (the `/library` explorer: a dense filterable tree + per-surface scoped
  routes `/synclair/library/<surface>/<tier>/<name>` — surface is a scope carried
  in the path, GitHub-style, entered via a select defaulted to All), preview adapters, host roots (`hosts[]` in the external catalog),
  environment stacks.
- **Shared things:** the knowledge base (a source may be *tagged* to surfaces;
  untagged = applies to all), the system map (one map; entries tagged
  `surface` or `"shared"`), brand tokens (one seed; per-surface divergences are
  recorded, not averaged), references, summaries.
- **RN previews are tiered:** host RN components preview via screenshot/embed
  only (never imported — §1); components registered IN the clone may
  live-render through react-native-web when the surface opts in
  (`liveRender: true`) and the dep is installed. A per-project intake decision,
  not a foundation default.

---

## 6. What "start a new project" does

The `project-bootstrap` wizard becomes thin — it **clones this foundation** and
**prunes**, rather than carrying its own snapshot (which is why it drifted):

1. Clone the foundation repo as the project's starting point — keeping its
   history, with the foundation as the `upstream` remote (`docs/new-project.md` §1).
2. Interview: project name, brand, domain, **target platform**.
3. Select the adapter (`web-shadcn` by default; `react-native` / `swiftui`).
4. Reseed the brain: new brand tokens, empty registry, project domain skill.
5. Seed project memory.

The clone is the project's own, and it diverges. Nothing syncs automatically;
when the project *wants* foundation updates, `synclair-sync` pulls them as an
ordinary git merge (principle 3).

---

## 7. Open questions

- **Mobile preview source of truth** — *leaning resolved for React Native.*
  react-native-web maps RN primitives (`View`, `Text`, `Pressable`, `Image`) to
  the DOM, so the `react-native` adapter returns `{ kind: "live" }` and
  live-renders most **presentational** components inside Synclair — same as
  shadcn. It falls back to `{ kind: "image" | "embed" }` only for components
  that touch **native modules** (camera, native maps, gesture-handler/Reanimated
  native deps, `.ios.tsx`/`.android.tsx` splits), which can't run in a browser.
  This tiered default is why `Preview` is a union (§4a), not a boolean. Open
  sub-question: where the fallback image/embed comes from (Storybook vs. Expo
  Snack vs. captured screenshot vs. Figma frame).
- **Where the Synclair routes live** — *resolved.* Synclair is a hub-only app
  mounted at `/synclair`; the root `/` redirects there and no product app is
  co-located (the product lives elsewhere, on its own server). The mount point is a
  single swappable constant (`SYNCLAIR_BASE`), so relocating the hub remains a
  no-touch-links move.
- **Multi-frontend products (monorepo web + mobile)** — *resolved.* Surfaces
  (§5b): the seed declares one entry per frontend, catalogs/system-map/knowledge
  carry optional surface tags, adapters resolve per item, and Synclair shows a
  per-surface library drill-in. One surface = today's UI exactly.
- **Adapter packaging** — inline modules in the template vs. selectable presets
  the wizard drops in.

---

## 8. Seed inventory — the extractable seed layer

Everything below is project-specific *content*. A new project replaces these and
keeps the rest. Extraction is now a file/dir operation (no untangling):

| Seed artifact | Location | Reseed action |
|---|---|---|
| Product identity (name + tagline) | `lib/system/seed/project.ts` | Rename to the product being cataloged (re-labels the Synclair header) |
| App surfaces (multi-frontend projects, §5b) | `lib/system/seed/surfaces.ts` | Leave empty (single frontend) or declare one entry per frontend at intake |
| Brand color ramps | `lib/system/seed/brand-ramps.ts` | Replace with new brand ramps |
| Theme values | `app/globals.css` | Retheme (shadcn base + brand) |
| Figma manifest data | `data/figma-manifest/*` | Replace / clear |
| Figma manifest route | `app/figma-manifest/*` | Keep (brain skin), clear data |
| Domain knowledge | the project's domain skill | Swap for the new project's domain skill (§9) |
| Domain digger | the project's advisor agent | Swap for the new project's advisor |
| References library | `lib/system/references.ts` (surfaced at `/references`) | Starts empty; grows per project as agents research (the mechanism is brain, the entries are seed) |
| Host component catalog (existing-project mode) | `data/external-catalog.json` + `public/external/` screenshots | Starts empty; populated via the `existing-project-intake` skill when Synclair runs beside an existing app |
| System map (codebase anatomy digest — areas, API, data model, jobs) | `data/system-map.json` | Starts empty; generated by the `codebase-map` skill / `system-mapper` agent (this repo or the host); mechanism is Brain (`lib/system/system-map.ts`, `/synclair/system`), the digest is seed |
| Setup mode (embedded vs watcher topology — [`docs/setup-modes.md`](setup-modes.md)) | `data/setup.json` | Blank/unresolved in the mother repo; resolved per project by the install paths (`resolvedBy: "install"`) or by confirmed detection; mechanism is Brain (`lib/system/setup.ts`, chrome badge), the marker is seed |
| Project knowledge | the knowledge layer (§9) | Reseed distilled skills + source links |

Everything else (`lib/system/*` brain, `lib/system/adapters/*`, the Synclair routes,
the registered UI components) is portable and stays.

---

## 9. The knowledge layer — Synclair's brain-for-agents

The purpose from day one: Synclair is the **master place that gives agents the
project context they need so they never start blank**. This is a first-class part
of the Brain — the *mechanism* is portable Synclair; the *content* is seed.

### The core split: sources of truth vs. the distilled brain

Two different things, handled two different ways:

- **Sources of truth** — PRDs, slide decks, Figma files. Heavy, changing, often
  Google-native or binary, already living in Drive / Figma. **Never copied into
  the repo** (a pasted 40-page PRD goes stale the day the Doc is edited and blows
  the context window when read raw). They stay canonical and are **linked**.
- **The distilled brain** — the compressed, durable knowledge *extracted* from
  those sources. **This lives in the repo as skills** and is what agents read
  most of the time. A domain skill is exactly this: nobody pastes
  a vendor manual into it — someone distills it to what a builder in that domain needs.

### The two levers that give rich context without overloading

1. **Progressive disclosure** (how skills work): a skill's one-line description is
   always in context (cheap); its body loads only when triggered; files it points
   to (`references/*.md`) load only when the body references them. A 5,000-line
   knowledge base costs ~15 words until it's relevant.
2. **Subagent context isolation** (how digger agents work): a digger has its own
   context window. It reads the whole 40-page PRD, distills it, and returns one
   paragraph to the main thread. The heavy read happens in a context you throw
   away — only the answer comes back.

### The five layers

1. **Router** — the root `AGENTS.md` (agent-neutral; `CLAUDE.md` `@`-imports it)
   plus the memory index at `memory/MEMORY.md` (non-obvious durable facts —
   external IDs, provenance, tool quirks — readable by every agent). Loaded every
   session, so it holds **no knowledge, only a map**: "PRDs live in Drive folder X,
   distilled into the `product-spec` skill; Figma is mapped in memory; building a
   domain view → consult the project's domain skill." 
2. **Distilled-knowledge skills** — the in-repo brain. A domain skill is
   the exemplar; add a `product-spec` skill (or one per major area) with the same
   shape: `SKILL.md` = essentials + a "area → source-of-record link" table;
   `references/*.md` = per-area digests that load only when that area is built.
   Each digest links back to the canonical PRD/deck/Figma.
3. **Source pointers, not copies** — stable links (Drive doc IDs, Figma file keys,
   deck URLs) stored in the skill digests and memory. (Do the same for
   Figma workspace maps and PRDs/decks.)
4. **Digger agents** — narrow retrieval workers. A domain advisor agent
   can exist; add a `prd-retriever` ("read the PRD for this view, return the
   requirements that matter *now*") and optionally a `figma-frame-reader`. Narrow
   diggers return tighter answers than one omni-agent. Existing-project mode
   ships five more (`codebase-surveyor`, `system-mapper`, `knowledge-harvester`,
   `token-archaeologist`, `component-cataloger`), orchestrated by the
   `existing-project-intake` skill to populate Synclair from a host codebase.
5. **The flywheel** — distill at intake, then refine by write-back. **Linking a
   source and distilling it are one act, not two**: adding an entry to the manifest
   *includes* writing its digest and setting `distilledInto`/`distilledAt` (route by
   kind — written docs → `product-spec`, Figma → `figma-distiller`). An entry with no
   digest is unfinished work, so the KB is always a set of *digests with links back*,
   never a bag of undigested links; the only exception is an explicit, `notes`-recorded
   `TODO: distill …` deferral when the source is genuinely unreachable. **Write-back**
   is the second half of the same wheel: when a build later surfaces something durable,
   the digger *refines* the existing digest. Intake pays the first dig up front so no
   builder ever hits a linked-but-undigested source; write-back keeps the digest true
   over time. Over weeks the distilled brain converges on "what a builder routinely
   needs," and raw sources are consulted only for novel detail.

### Synclair framing (why this belongs here)

- **Brain (portable):** the 5-layer *pattern* — the router template, the
  distilled-skill shape, the digger-agent pattern, the write-back rule. Every
  clone inherits it.
- **Seed (per project):** the *content* — this project's `product-spec`, its PRD
  and deck links, its domain skill, the filled-in router.

### Wiring blocker (not architecture)

Digger agents can only *fetch* Drive/Notion/Figma sources when those MCP
connectors are authorized (claude.ai connector settings, or `claude mcp` / `/mcp`
in an interactive session). Until then, diggers work off links + whatever is
already distilled. Also: `build-view`'s "PRD location: TBD — ask the user" is the
exact gap the router (layer 1) closes once the PRD home is known.

---

## 10. Rules as mechanism — machine-enforced conventions

A foundation rule stated only as prose ("no raw hex/px", "register on
creation", "use the `synclair()` helper") is advisory: it works only while every
agent has read it, remembers it, and chooses to comply. Agents obey compilers
and linters far better than instructions — so **whenever a convention can be
machine-checked, the convention ships with its check**. Prose in the router
states the *why*; the checker enforces the *what*.

The gate is one command, `npm run verify-ui`:

| Check | Enforces | Where |
|---|---|---|
| `tsc --noEmit` | types | `package.json` |
| ESLint foundation guardrails | no raw hex (class strings / templates / inline styles), no arbitrary px, no hardcoded `/synclair` paths | `eslint.config.mjs` |
| Registry drift check | `registry.json` ↔ component file ↔ `.docs.tsx` ↔ `lib/system/docs.ts` stay in sync, both directions | `scripts/check-registry.mjs` |

CI runs the same gate on every push/PR (`.github/workflows/verify.yml`), and
`build-view` / `component-library` name it as the definition-of-done.

Design principles for guardrails:

- **Error messages are fix instructions.** Each message says what to use
  instead and where the vocabulary lives ("Use a semantic token from
  `lib/system/tokens.ts` — see /synclair/foundations"). For an AI agent the
  message lands in-context immediately after it wrote the offending line —
  the guardrail doubles as a perfectly-timed re-prompt, for any agent brand.
- **Exemptions are the sanctioned homes of raw values**, not convenience
  escapes: `lib/system/tokens.ts` + `lib/system/seed/` (document literal
  values), `lib/system/routes.ts` (defines the mount point), vendored
  `components/ui/` (upstream shadcn idiom).
- **A rule firing on legitimate code means missing vocabulary.** The fix is to
  extend the token scale / registry (e.g. the repeated `text-[11px]` that
  became `text-2xs`/`text-3xs`), never to `eslint-disable` around it.

Synclair framing: the guardrail *pattern* (the ESLint blocks, the drift-check
script, the `verify-ui` gate, the CI workflow) is **Brain** — portable. The
specific vocabulary it points to (which tokens exist) is **seed**.

---

## 11. The state model — git is the database

Synclair is multiplayer from day one, but not through a server: **each person
runs Synclair locally from a clone, and the repo is the shared database.** Sync
is `git pull` / `git push`. This is deliberate, not a stopgap — it's what keeps
humans and agents reading the same bytes (§1's "one source, two renderings").

The rule of thumb: **if a change deserves a commit message, it's a file in
git; if it doesn't, it's UI state — and UI state eventually belongs in a
database.** Concretely, Synclair's state falls into three categories:

| Category | Examples | Store | Why |
|---|---|---|---|
| **Foundation content** | tokens, `registry.json`, docs, knowledge digests, references, the Figma manifest | **git, forever** | Changes deserve history/review; agents read files; guardrails + drift checks run on files. A DB here would break the alignment story. |
| **Synclair state** | stars/curation flags, read-markers, preferences | git *if shared curation*; gitignore *if personal*; DB once hosted | Small mutable JSON. Committing is fine while the semantic is "the team says this matters" (e.g. `data/figma-manifest/stars.json`). Per-**user** state has no home in a repo file. |
| **Collaborative/live state** | comments, assignments, presence, activity feeds | **DB only** (doesn't exist yet) | Inherently per-user + real-time; never a commit. |

**The forcing function for a database is hosting, not team size.** Local
clones have writable filesystems, so file-writing features (stars, distill
controls) work. A *hosted* shared Synclair (one URL, no clone) runs on a read-only
filesystem — the moment Synclair is deployed rather than run locally, every
mutable feature in categories 2–3 needs a real store (likely Postgres/Supabase
with auth). Foundation content stays in git even then; Synclair would read it
from the deployed clone exactly as it does locally.

Until that trigger, don't add the DB: it's a second source of truth, an auth
system, and a migration story that categories 1–2 don't need.

---

## 12. Setup mode — embedded vs watcher

A clone's relationship to the product it serves is captured explicitly, not
re-guessed. There are exactly **two** modes, defined by repo **topology**:
**`embedded`** (Synclair inside the product repo — one repo; new-project or
co-located; two-way) and **`watcher`** (a separate repo beside the product — the
sibling companion; one-way). "Standalone / new-project" is not a third mode — it
is `embedded` before the product files land; the transient pre-setup state is the
**blank / unresolved** marker.

The mode is named for topology, never for "sync," because the two syncs pull
opposite ways (code↔knowledge tightness favors embedded; foundation-update ease
favors watcher) — so topology is the one unambiguous axis. The durable marker is
`data/setup.json` (schema/readers in `lib/system/setup.ts`), resolved
**determine → confirm → record**: install paths write it authoritatively, and
`detectSetupMode()` is the confirmable fallback. `isExistingProjectMode()` derives
from it (falling back to catalog contents when unresolved), and the hub chrome
shows a mode badge. Full contract: [`docs/setup-modes.md`](setup-modes.md).
