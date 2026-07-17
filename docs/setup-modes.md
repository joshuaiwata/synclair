# Setup modes — embedded vs watcher

> How a Synclair clone is wired to the product it serves. There are exactly
> **two** operating modes, defined by repo **topology**. This is the design
> contract; the mechanism is `lib/system/setup.ts`, the marker is
> `data/setup.json`, and the modes surface as a badge in the hub chrome.

Synclair is always *a foundation for a product*. The one structural question is
**where the clone sits relative to that product** — inside its repo, or beside
it. That single fact drives how updates flow, whether agents get Synclair's
skills ambiently, and how the hub frames what it documents. Recording it once,
explicitly, means every agent and every page reads the same answer instead of
re-guessing it.

## The two modes

| | `embedded` | `watcher` |
|---|---|---|
| **Topology** | Synclair lives **inside** the product repo (one repo) | Synclair is a **separate** repo **beside** the product (two repos) |
| **How you get here** | The clone **is** the product (new project built in it), **or** Synclair was dropped into an existing repo (`co-locate-synclair`) | The default sibling companion clone (`docs/existing-project.md`) |
| **Direction** | **Two-way** — skills/knowledge travel with the code; agents building in the repo get them ambiently | **One-way** — observes and documents the host; nothing lands in the host repo |
| **On disk** | `product/` (with Synclair at the root, or vendored at `product/synclair/`) | `product/` and `product-synclair/` as peers |
| **Install path** | `docs/new-project.md` · `co-locate-synclair` skill | `docs/existing-project.md` |

```
embedded (one repo)                 watcher (two repos)
┌─────────────────────────┐         ┌──────────────┐   ┌──────────────────┐
│ product repo            │         │ product repo │   │ synclair clone   │
│  ├─ <the product app>   │         │  └─ app/…    │──▶│  └─ /synclair (:4100)│
│  └─ synclair/ (+ .claude) │         └──────────────┘   └──────────────────┘
└─────────────────────────┘          host, untouched     observes the host
   skills travel with code                              (one-way documentation)
```

### Onboarding labels (the bootstrap skill's Mode A / B / C)

The interactive `project-bootstrap` flow presents **three** human-facing setup
paths, but they are onboarding labels, not extra modes — each maps onto one of
the two topologies above:

| Bootstrap label | What it is | Topology marker |
|---|---|---|
| **Mode A** — new project | the clone **is** the new repo | `embedded` |
| **Mode B** — beside an existing app | sibling companion clone (two repos) | `watcher` |
| **Mode C** — inside an existing repo / monorepo | co-located at `./synclair` (one repo) | `embedded` |

So A and C both resolve to `embedded`, B to `watcher`. The marker records the
**topology** (`embedded` / `watcher`), never the onboarding label — a "Mode C
install" is an `embedded` clone. Keep the two vocabularies bridged here so the
setup UI and the persisted marker never read as two different systems.

### Why "standalone / new-project" is not a third mode

A brand-new project that clones Synclair and builds the product *in the clone*
is **already `embedded`** — the product and Synclair share one repo from commit
one. "Standalone" is just `embedded` **before the product files have been
added**. Adding a third mode for the empty-but-will-be-embedded state would split
one topology into two names and force every consumer to collapse them again.
Instead, that pre-product state is the **blank / unresolved** marker (below), not
a mode of its own.

## Name by topology, never by "sync"

Two *different* syncs pull in opposite directions, and naming the modes after
either one would mislead:

- **Code ↔ knowledge tightness** favors **embedded** — one repo means skills,
  digests, and the catalog live with the code and version with it; agents get
  them without being pointed anywhere.
- **Foundation-update ease** favors **watcher** — a separate clone pulls upstream
  Synclair changes as an ordinary `synclair-sync` merge, with no risk of
  entangling the product repo's history or tooling.

Because the two tugs point at different modes, "the sync mode" is ambiguous and
would name the same clone two different things depending on which sync you meant.
**Topology is the one unambiguous axis** — a clone is either inside the product
repo or beside it — so the modes are named for that. The sync tradeoffs are a
*consequence* of the topology, documented here, not the label.

## The marker

`data/setup.json` — the durable, agent-readable record. Schema and readers live
in `lib/system/setup.ts` (same pattern as `lib/system/external.ts` /
`lib/system/system-map.ts`).

```jsonc
{
  "mode": "embedded" | "watcher",   // the resolved topology
  "resolvedAt": "2026-07-13T…Z",    // ISO date it was resolved
  "resolvedBy": "install" | "detected" | "user"
}
```

| Field | Meaning |
|---|---|
| `mode` | The resolved topology. `null` / absent / unreadable ⟹ **blank / unresolved**. |
| `resolvedAt` | When the mode was recorded. |
| `resolvedBy` | `install` — written by an install/setup path (trusted); `detected` — inferred from topology and confirmed; `user` — an explicit human override. |

**Blank is a first-class state, not an error.** The mother repo ships
`{ "mode": null }` — it is the upstream foundation and is never itself "set up".
`getSetupMode()` returns `null` for absent/blank/corrupt, and every consumer
treats `null` as "unresolved" and falls back safely. `synclair-reset.sh` blanks
the marker on reseed so each new project re-resolves its own mode.

Readers/writers (`lib/system/setup.ts`):

- `getSetupMode(): Promise<SetupMode | null>` — the resolved mode, or `null`.
- `getSetupRecord(): Promise<SetupRecord | null>` — the full record.
- `recordSetupMode(mode, resolvedBy)` — persist authoritatively (the *record* step).
- `detectSetupMode(): Promise<SetupDetection>` — topology inference (the *determine* step).
- `SETUP_MODE_META` — per-mode label + blurb for UI (the chrome badge).

## Boot-time resolution: determine → confirm → record

The resolution is deliberately three steps, and only the install paths skip the
first two by writing the marker authoritatively.

1. **Determine** — `detectSetupMode()` reads repo topology and proposes a mode:
   | Signal | Mode | Confidence |
   |---|---|---|
   | A declared host whose root is an **ancestor** of this repo (Synclair nested inside it) | `embedded` | high |
   | A declared host on a **separate/sibling** path | `watcher` | high |
   | No host, but this repo sits inside a **wrapping repo** (`.git` + `package.json` above it) | `embedded` | medium |
   | Neither | `null` (blank) | low |
2. **Confirm** — detection is **never silently trusted**. The setup skill shows
   the proposed mode + its `signal` and asks the user to confirm or override.
   *(This step is a documented seam today — see the TODO below — not yet an
   interactive prompt.)*
3. **Record** — `recordSetupMode(mode, resolvedBy)` writes `data/setup.json`.
   Install paths call this directly with `resolvedBy: "install"`; a confirmed
   detection uses `"detected"`; an explicit override uses `"user"`.

**Install paths write it authoritatively; detection is the fallback** for clones
that reach the hub without a marker. That ordering keeps the trusted source
(install) primary and the heuristic (detection) as a safety net that still
requires a human "yes".

> **TODO (seam for the setup skill):** wire the interactive confirm. The
> `project-bootstrap` / `existing-project-intake` / `co-locate-synclair` flows
> should call `recordSetupMode(...)` at the end of setup (`resolvedBy:
> "install"`). For a clone that boots unresolved, a skill should run
> `detectSetupMode()`, surface the `signal`, confirm with the user, then record
> with `resolvedBy: "detected"`. The detection logic is wired; only the
> interactive prompt is pending.

## How consumers use the mode

- **`isExistingProjectMode()`** (`lib/system/external.ts`) now derives from the
  marker: a `watcher` marker means Synclair is paired beside an existing host, so
  it is always existing-project mode. For `embedded` or unresolved, the marker
  alone can't say whether a host is being documented (a co-located embedded hub
  *over* a host vs. a new-project clone that *is* the product), so it falls back
  to the catalog — true iff a host is declared. That fallback is exactly the
  pre-marker behavior, so clones with no marker (and new-project embedded clones,
  which have no hosts) are unchanged.
- **Hub chrome badge** — `app/synclair/(hub)/layout.tsx` resolves the mode and passes a
  `SETUP_MODE_META` label to the sidebar, which renders a small outline badge
  ("Embedded mode" / "Watcher mode") under the header. Blank/unresolved renders
  no badge, so the mother repo's chrome is byte-for-byte unchanged.

## Deferred / follow-ups

Out of scope for this pass; captured so they're not re-discovered:

- **CLI / upgrade mechanism** — a `synclair` CLI with an `upgrade` command,
  codemods, and checksums to make foundation updates a first-class operation
  (beyond today's `synclair-sync` git merge). Explicitly **not built here**; the
  marker gives such a tool a reliable mode to branch on when it exists.
- **In-product Synclair docs + built-in knowledgebase** — a surfaced need: a
  booting hub should be able to explain *itself* (what Synclair is, the two
  modes, how sync works) **in-product**, surfaced in the foundation/system UI,
  rather than only in `docs/*.md` that a reader has to find in the repo. The
  `/synclair/how-it-works` page is the seed of this; the follow-up is to ship
  Synclair's own docs as a first-class, browsable knowledgebase in the hub. This
  spec (and `docs/foundation-model.md`) is the source content such a surface
  would render. **Described only — not built here.**

## Related

- `docs/foundation-model.md` — the architecture (Brain / adapter / seed); §8 seed inventory lists `data/setup.json`.
- `docs/new-project.md` — the embedded new-project install path.
- `docs/existing-project.md` — the watcher (sibling companion) install path.
- `.claude/skills/co-locate-synclair/SKILL.md` — the embedded co-located variant.
- `.claude/skills/synclair-sync/` — the foundation-update sync (the tug that favors watcher).
