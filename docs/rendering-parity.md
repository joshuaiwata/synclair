# Rendering parity — a lens, never a third source of truth

> How the hub reaches Storybook-grade freshness on the slice where they overlap
> (rendering the components that actually exist in the app), and why it will
> never become the failure mode Storybook is criticized for (a fictional
> catalog nobody maintains). Mechanisms: `lib/system/host-scan.ts`,
> `host-docgen.ts`, `host-status.ts`, `host-hygiene.ts`,
> `components/host-previews/registry.tsx`, and the `check:coverage` /
> `scan:hygiene` scripts.

## The contract

A team already has two real sources of truth: **Figma** (design intent) and
**shipped code** (what actually exists). The documented failure of authored
catalogs — Storybook installs listing 40 components while the product uses 23 —
comes from adding a **third place where a component is defined** and letting it
drift. Synclair's posture is that the hub is a **lens over the two real
sources, never a third definition**. Three rules make that enforceable:

1. **If it can be derived, it must be derived.** Props, usage counts, coverage,
   freshness — computed from the live host source on read, never transcribed
   into JSON by hand or by agent. Derived content cannot drift because nobody
   writes it.
2. **If it's authored, it carries a verifiable anchor.** Judgment content
   (descriptions, intent, classifications, curated examples) is agent-written —
   and every entry pins the `sourceHash` / commit it documented, so staleness
   is machine-detectable.
3. **Anything that fails its anchor gets badged or pruned — never trusted.**
   Stale, ghost, or unused entries surface as warnings in the UI and the check
   scripts. A wrong catalog is worse than a smaller one.

## The derive/author split

| Content | Kind | Mechanism | Freshness |
|---|---|---|---|
| Props / API table | **derived** | `host-docgen.ts` — TS compiler over the host source, per read, cached by file hash | can't drift (authored `props` = CI fallback only) |
| What components exist | **derived** | `host-scan.ts` — live enumeration of host component files, diffed against the catalog both ways | can't drift |
| Host usage counts | **derived** | `host-usage.ts` — JSX-tag counts against the live host web source per render (a "~" pulse); intake snapshot only as non-web/CI fallback | can't drift (web surfaces) |
| Live previews | **imported** | `host-previews/registry.tsx` — the host's *actual* component in a scoped product theme (`port-host-component`, live-import path) | rendered from source |
| Screenshots | **authored** | captured from the *running host*, never Figma exports | `check:host` (source hash) |
| Descriptions, intent, basis, notes | **authored** | agent judgment — the content Storybook has no organ for | `sourceHash` anchor + `check:host` |
| Foundation hygiene | **derived @ scan** | `scan-host-hygiene.mjs` over the live host source | re-run on host movement (report carries host commit) |

## The freshness loop

- **Ambient detection (free, every render).** The chrome badge (`host-status.ts`)
  shows host commits since intake + uncataloged candidates; the components
  gallery shows the live coverage line; entries that fail `check:host` show
  stale. Storybook rebuilds its index at every startup — this is the same move
  for a repo we observe rather than build.
- **On-demand sweeps.** `npm run check:coverage` (both fiction directions:
  in-app-but-uncataloged, cataloged-but-unused — live-counted) · `npm run
  check:host` (anchored entries vs live source) · `npm run scan:hygiene` (the
  host vs its own foundation) · `npm run check:previews` (presentation coverage:
  every native, registered, and external item shows a live import, `live()`
  preview, screenshot, or embed — part of verify-ui, so the code-only gap
  can't reopen silently).
  The `synclair-steward` skill is the eyes-on gate on top of all of these.
- **Deliberate refresh.** Drift never auto-rewrites anything — the intake
  diggers re-run on exactly the flagged entries, and a human reviews the
  result. Chromatic's baseline model: comparison automatic, acceptance human.

## Candidates vs components

The live scan is deliberately mechanical, and an initial dig always surfaces
files that export PascalCase functions but aren't design-system pieces (page
sections, providers, icons). So enumeration produces **candidates**, and
coverage is **advisory everywhere** — a count plus a triage list, never a hard
failure and never auto-cataloging. The judgment call stays with the diggers and
humans. That's how the catalog covers *everything real* without inflating into
fiction — the opposite corner from both Storybook failure modes (stale
authored lists *and* dogmatic "everything must have a story").

## What the Storybook criticisms mean here

| Criticism of Storybook | Synclair's structural answer |
|---|---|
| Third source of truth; catalog becomes fiction | Lens contract above; both fiction directions machine-detected (`check:coverage`), ghosts fail `check:host` |
| ~20% maintenance tax on engineers (`.stories` for everything) | Watcher mode costs the host team **zero** — no files, no deps, nothing in their repo; refresh cost is agent tokens on flagged entries only |
| Isolation hides in-context bugs | The hub documents components **as they ship**: real usage snippets, host import graph, screenshots of the running app — plus blocks/views tiers so larger compositions carry UX docs in context |
| Redundant if the code is self-documenting | The component list is the *overlap*, not the value: hygiene, shadcn-vs-custom basis, System Map, knowledge, UX specs on views are what clean code still can't tell a stakeholder |
| Heavy config, framework friction in the host | Nothing is added to the host build; live imports happen in the hub's build via the `@host` alias, gated by a compat check, with documented-only as the honest fallback |

## What parity means, honestly

- **Derived slice (props, existence, index): exact parity** — same mechanism as
  Storybook docgen, so the same can't-drift guarantee.
- **Live previews: parity where the host is executable.** Embedded clones and
  dependency-compatible watchers import the real component; server-only or
  incompatible components stay documented and say so ("documented" badge).
  That residual is topology, not engineering debt.
- **Judgment content: beyond parity.** Storybook has no freshness story for
  hand-written docs; here every authored artifact is anchored, drift-checked,
  and agent-refreshable.

## Related

- `.claude/skills/port-host-component/` — the live-import path that populates the preview registry.
- `.claude/skills/existing-project-intake/` — produces the catalog; closes with coverage + hygiene sweeps.
- `docs/setup-modes.md` — why watcher mode never touches the host repo.
- `scripts/check-host-drift.mjs` — the anchored-entry freshness check this builds on.
