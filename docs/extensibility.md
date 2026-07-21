# Synclair extensibility — Core vs Extensions

**Status: DRAFT / plan for discussion. No code yet.** Nothing in this document
changes a running clone. It exists to draw one line — **what is Core and what is
an Extension** — and to define how Extensions could plug in *without ever
breaking a working clone* (e.g. the toolbelt-frontend hub).

## Why

Synclair is a portal over a product's foundation. The mature open-source portals
work as **a stable core + a plugin ecosystem the community extends**:

- **Backstage** (Spotify's developer portal) — a small core, everything else is a
  plugin; the community ships integrations.
- **Docusaurus / Astro** — a config lists plugins/integrations; each hooks into
  the platform.

Synclair is the same shape, so it should have a stable **Core** plus
**Extensions** — capabilities you can turn on/off, add, or remove, and that
others can build: toggle Figma Manifest off, add a Vercel "cloud hub" deploy
Extension, add a React Native surface, etc. (The narrow Path A render shims from
`docs/rendering-parity.md` become *one kind* of Extension, not the whole idea.)

## Prime directive: additive, all-on, reversible

The number-one constraint. Introducing this must be a **no-op for every existing
clone**:

1. **All-on by default.** The Extension registry defaults every capability that
   already exists to **enabled**. A clone that syncs this in behaves *identically*
   until a human toggles something.
2. **Config-only + reversible.** Disabling an Extension hides its nav entry,
   route, and checks — it never deletes data or source. Re-enable = flip the flag.
3. **Incremental.** The registry + toggle plumbing land first, **inert** (all-on).
   Then capabilities are modularized **one at a time**, each verified in the hub
   before the next.
4. **This plan touches no clone.** Implementation lands in the mother repo and
   reaches clones only via a deliberate sync — all-on, so nothing visibly changes.

## Two axes: what ships vs what's shown

"Core" is **not** the same as "always visible." Two independent axes:

- **Distribution** — **Core** ships with the foundation and syncs from upstream;
  it can't be *uninstalled*. **Extension** is optional: *install / remove*, and
  community-contributable.
- **Visibility** — a per-clone **hide/show** toggle that applies to **both**. A
  clone can hide a Core section it doesn't want in its nav; it stays installed and
  keeps syncing. An Extension has visibility *and* install/remove.

So: Core = "always present, hideable." Extension = "optional, installable +
hideable." Phase 1 below is really the **visibility** layer (all-on); install/
remove is Extension-only and comes later.

## Core — always installed (still hideable)

The test (from Synclair's own definition + how it operates): **Core is whatever
the foundation's own loop — intake → setup → build → improve → sync — leans on,
plus the git substrate.** One aligned source of truth for humans and agents, and
the machinery that keeps it true.

| Core capability | Why it's Core |
|---|---|
| **Hub shell** — nav, routing, layout, theme, ⌘K search, the config/registry system | Without it there is no hub |
| **Foundations** — design tokens | The "aligned source of truth": tokens |
| **Component Library** — Components / Blocks / Templates, registry, docs, `verify-ui` | The "aligned source of truth": components |
| **Knowledge** — sources + summaries | The "aligned source of truth": knowledge |
| **System Map** | Intake-generated orientation — what the codebase consists of |
| **Pages** (sitemap) | System Map's twin — also intake-generated orientation (`pages-map` runs at intake) |
| **Reports** | The intake closer + the "what to do next" improvement loop |
| **GitHub / repo activity** | Git is the substrate — the foundation *is* a git repo, syncs via git, activity reads local git |
| **Environment / call-home** | Setup-mode + foundation freshness — how a clone is operated and kept current |
| **AI Setup** — skills & agents registry | The capability spine every agent reads |
| **Operating modes** — topology (embedded / watcher) + seeding (fresh / intake) | How a clone sits and how it's populated — **configured, not installed** |
| **Existing-project intake** — host catalog + Path A render + dev-servers + Hygiene | The machinery of the *intake* seeding path; a host is a first-class case, not an add-on |
| **References** | The built-in project research library |
| **Figma Manifest** | The built-in Figma knowledge source (see note under Extensions) |
| **Surfaces** — multi-frontend mechanism | Seed-configured (empty = single frontend) |
| **Seed / config + the Extension registry itself** | How a clone is configured and how Extensions plug in |

Core always ships and syncs; it can't be uninstalled, but a clone MAY **hide** any
of it via the visibility toggle (e.g. hide System Map on a design-system-only
clone with no backend). **Which topology/seeding a clone runs is Core** — an
operating mode, not an installable part.

## Extensions — the community plug-in surface (net-new capabilities)

Extensions do **not** re-carve what already ships, and an operating mode is never
an Extension. They **add new capabilities on top of Core**, install/remove-able
and community-built. **Nothing in base Synclair is an Extension today** — this is
the surface for what comes next:

- **Integrations** — plug in an external service: *[future]* a **deploy** target
  (Vercel / Netlify "cloud hub"), **Storybook** / **Chromatic**, **Linear**, or a
  deeper **GitHub-API** layer (PR checks, Actions) on top of the Core git substrate.
- **Surface / renderer add-ons** — support a surface Core can't render in the hub
  browser: *[future]* **React Native** native-component previews (the Path A
  render *adapters* generalize to this), desktop, CLI.
- **New sections** — a wholly new hub view a team or the community wants that isn't
  part of the base foundation.

**Figma is the reference, not an Extension.** It ships in Core (the Figma
Manifest), but it's the natural **template** for the integration-Extension shape —
a section + data source + config + optional skill — so it's the model to study
when defining the contract.

## What an Extension declares (the contract)

One manifest per Extension, so enable/disable is total and clean:

- `id`, `name`, `description`, `category`, `layer` (`foundation` = ships + syncs;
  `project` = this clone's own), `type` (section / integration / mode / surface /
  ops).
- **Contributes:** nav entries · routes · a data schema + seed · config keys (its
  on/off flag + settings) · skills · agents · npm scripts/checks · npm deps.
- **Defaults:** default `enabled` state · dependencies on other Extensions.
- **Graceful degrade:** what happens to references from other features when it's
  off (e.g. Pages links to a Component doc — fine; a widget that reads System Map
  data must handle "off").

## Registry & lifecycle

- A central manifest (candidate: `synclair.config.ts` **or** `data/extensions.json`)
  lists installed Extensions + enabled state.
- The hub reads it to **build the nav, mount/skip routes, run/skip checks, surface
  skills/agents**.
- **Disable** = hide nav + skip route (404 or a small "off" notice) + no-op its
  checks + **data untouched**.

### The Settings surface (`/synclair/settings`)

The one place to manage all of this — deliberately simple and always one click away:

- **Placement:** a **Settings** item (gear) in the sidebar's **System** group,
  beside AI Setup and Environment. Always visible.
- **Sections list:** every hub section as a labeled row + one-line description + a
  **show/hide switch**, grouped to mirror the nav. Core sections *hide* here, never
  uninstall — so it can't break a clone.
- **Extensions list:** installed Extensions with an **enable/disable switch** each
  (name · description · origin); empty state now, an **Add extension** entry later.
- **Behavior:** a switch writes to the clone-local config (the never-synced
  seed/data), the nav re-renders immediately; the config file is the headless/agent
  path. Fully reversible; choices survive foundation merges.

## The cloned-foundation wrinkle (sync)

Synclair is a **cloned foundation kept current by git merge**, not an installed
framework — so:

- **In-repo Extensions** (a folder + manifest, committed) sync cleanly;
  "installing" a community Extension = a folder + a PR. **This is the near-term
  shape.**
- **Package Extensions** (`@synclair/ext-*`, `npx synclair add vercel`) decouple
  install / version / remove from sync, but need a runtime plugin API — a later
  phase.
- **Enabled state lives in seed/config** (which never syncs), so a clone's on/off
  choices survive a foundation merge.

## Phased plan

No existing capability gets extracted or moved — Core stays Core. The work is a
visibility layer for Core plus a plug-in surface for net-new Extensions.

1. **Visibility layer + Settings page (all-on).** A per-section **hide/show**
   config honored by the nav + routes (fail-open: unknown/missing = visible), and
   the `/synclair/settings` page with the Sections list of switches. Every Core
   section defaults visible → no behavior change. **Verify the toolbelt-frontend
   hub is unchanged.**
2. **Extension contract + registry.** Define what an Extension may register (nav,
   route, data schema, config, skill, agent, check, deps) + the registry/manifest +
   enable/disable/remove lifecycle. Nothing that ships moves.
3. **First real Extension (proof).** Build ONE net-new capability as an Extension —
   e.g. a Vercel "cloud hub" deploy or an RN native-preview add-on — to validate the
   contract end-to-end, using **Figma** as the shape reference.
4. **Contribution docs + conventions.** Document the Extension folder shape so the
   community can PR one.
5. **[Later] Package Extensions + a CLI installer** (`npx synclair add …`), only if
   the ecosystem warrants the runtime plugin API.

## Settled in review

- Two axes (Distribution × Visibility); **Core ≠ non-toggleable** — Core hides but
  never uninstalls.
- **Reports, System Map, Pages, GitHub/repo-activity, Environment/call-home → Core.**
- **The operating mode is Core** — topology (embedded/watcher) and seeding
  (fresh/intake), including the existing-project **host** machinery (catalog, Path A
  render, dev-servers, Hygiene). Configured, not installed.
- **Nothing that ships today is an Extension.** Extensions are the plug-in surface
  for net-new capabilities. Figma is the *reference* for the pattern, not an Extension.

## Open questions (for discussion before Phase 1)

- Registry location/format: `synclair.config.ts` vs `data/extensions.json` vs both
  (config for shape, data for state)?
- The extension **contract** — the exact set of things an Extension may register
  (nav, route, data schema, config, skill, agent, check, deps) and how each is
  loaded/unloaded cleanly.
- First real target: is the cleanest proof-of-concept a **deploy** Extension
  (Vercel "cloud hub") or an **RN native-preview** add-on?
- Does an Extension's `check` join `verify-ui` only when enabled (yes) — and how
  does CI express that?

## Guardrail for whoever builds Phase 1

The toolbelt-frontend hub is a **working reference clone**. Phase 1 must be proven
inert against it (start it, click every section, confirm nothing changed) before
any capability is actually modularized. Modularize in the **mother**, sync to a
throwaway clone to test toggling, and only then let a real clone adopt it.
