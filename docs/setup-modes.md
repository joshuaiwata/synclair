# Setup topology — embedded

> How a Synclair clone is wired to the product it serves. There is exactly
> **one** operating topology — `embedded` — recorded once in `data/setup.json`.
> The mechanism is `lib/system/setup.ts`; the mode surfaces as a badge in the
> hub chrome. The former second mode, `watcher`, is **retired and removed**
> (owner ruling 2026-08-20; history below).

Synclair is always *a foundation for a product*, and the clone lives **inside
that product's repo** — either the clone IS the repo (a new project built in
it) or Synclair was co-located into an existing repo at `./synclair`
(`co-locate-synclair`). One repo, so skills, digests, and the catalog travel
with the code and agents get them ambiently. Two-way by construction.

```
embedded (one repo)
┌───────────────────────────┐
│ product repo              │
│  ├─ <the product app>     │
│  └─ synclair/ (+ .claude) │   hub serves /synclair on its own port (4100)
└───────────────────────────┘
   skills travel with code
```

### Onboarding labels (the bootstrap skill's Mode A / C)

The interactive `project-bootstrap` flow presents human-facing setup paths;
they are onboarding labels, not modes — both map onto the one topology:

| Bootstrap label | What it is | Topology marker |
|---|---|---|
| **Mode A** — new project | the clone **is** the new repo | `embedded` |
| **Mode C** — inside an existing repo / monorepo | co-located at `./synclair` (one repo) | `embedded` |

(The former **Mode B** — a sibling companion clone — was the watcher layout;
it is no longer offered. An existing app gets Synclair via `co-locate-synclair`.)

### Why "standalone / new-project" is not a second mode

A brand-new project that clones Synclair and builds the product *in the clone*
is **already `embedded`** — the product and Synclair share one repo from commit
one. "Standalone" is just `embedded` **before the product files have been
added**. That pre-product state is the **blank / unresolved** marker (below),
not a mode of its own.

## The marker

`data/setup.json` — the durable, agent-readable record. Schema and readers live
in `lib/system/setup.ts`.

```jsonc
{
  "mode": "embedded",               // the resolved topology
  "resolvedAt": "2026-07-13T…Z",    // ISO date it was resolved
  "resolvedBy": "install" | "detected" | "user"
}
```

| Field | Meaning |
|---|---|
| `mode` | The resolved topology. `null` / absent / unreadable / a retired value ⟹ **blank / unresolved**. |
| `resolvedAt` | When the mode was recorded. |
| `resolvedBy` | `install` — written by an install/setup path (trusted); `detected` — inferred from topology and confirmed; `user` — an explicit human override. |

**Blank is a first-class state, not an error.** The mother repo ships
`{ "mode": null }` — it is the upstream foundation and is never itself "set
up". `getSetupMode()` returns `null` for absent/blank/corrupt, and every
consumer treats `null` as "unresolved" and falls back safely.
`synclair-reset.sh` blanks the marker on reseed so each new project re-resolves
its own mode. A legacy `watcher` marker also reads as unresolved, with a
one-line migrate note (see the retirement section).

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
   | A declared host on a **separate/sibling** path (the retired watcher layout) | `null` + migrate signal | high |
   | No host, but this repo sits inside a **wrapping repo** (`.git` + `package.json` above it) | `embedded` | medium |
   | Neither | `null` (blank) | low |
2. **Confirm** — detection is **never silently trusted**. The setup skill shows
   the proposed mode + its `signal` and asks the user to confirm or override.
   *(This step is a documented seam today — see the TODO below — not yet an
   interactive prompt.)*
3. **Record** — `recordSetupMode(mode, resolvedBy)` writes `data/setup.json`.
   Install paths call this directly with `resolvedBy: "install"`; a confirmed
   detection uses `"detected"`; an explicit override uses `"user"`.

> **TODO (seam for the setup skill):** wire the interactive confirm. The
> `project-bootstrap` / `existing-project-intake` / `co-locate-synclair` flows
> should call `recordSetupMode(...)` at the end of setup (`resolvedBy:
> "install"`). For a clone that boots unresolved, a skill should run
> `detectSetupMode()`, surface the `signal`, confirm with the user, then record
> with `resolvedBy: "detected"`. The detection logic is wired; only the
> interactive prompt is pending.

## How consumers use the mode

- **`isExistingProjectMode()`** (`lib/system/external.ts`) derives from the
  external catalog: true iff a host is declared. (The topology marker alone
  can't distinguish a co-located hub *over* a host from a new-project clone
  that *is* the product.)
- **Hub chrome badge** — `app/synclair/(hub)/layout.tsx` resolves the mode and
  passes a `SETUP_MODE_META` label to the sidebar, which renders a small
  outline badge ("Embedded mode") under the header. Blank/unresolved renders no
  badge, so the mother repo's chrome is byte-for-byte unchanged.

## The retired `watcher` mode (history and migration)

`watcher` was the two-repo layout: a separate Synclair clone **beside** the
product, observing it one-way. It was deprecated 2026-07-31 on evidence —
every clone that ever stuck is embedded; not one watcher clone was ever kept —
and **retired and removed by owner ruling 2026-08-20** after an embedded re-run
of the intake drills confirmed nothing needs it. The reasons compound:

- **Watcher can't commit its own wiring.** Paths cross a repo boundary, so
  `.mcp.json` and hooks must be absolute and gitignored; every developer
  re-runs setup by hand. The one thing a foundation should do — show up
  already working — is the thing watcher structurally cannot do.
- **It doubles the path bases in every mechanism** — each one a place where a
  wrong base yields an *empty* answer that reads like a clean one.
- **Skills don't travel.** The ambient bridge only exists in embedded.

What happens to a legacy watcher clone now:

- Its `data/setup.json` marker reads as **unresolved**; the hub logs a one-line
  migrate note and renders no badge.
- `detectSetupMode()` labels the sibling-host layout with a migrate signal
  instead of proposing a mode.
- Core scripts that need a host path (`mcp-install`, `install-agent-hooks`)
  refuse to guess and ask for `--host` explicitly.
- **The migration** is co-location: move the clone to `<host>/synclair`
  (`co-locate-synclair`), then re-record the mode (`embedded`).

The case watcher served — documenting a repo you cannot commit into — is
served by co-locating into a fork or a copy; a detached observer is no longer a
supported topology.

## Deferred / follow-ups

- **CLI / upgrade mechanism** — a `synclair upgrade` with codemods and
  checksums to make foundation updates a first-class operation (beyond today's
  `synclair-sync` git merge). The marker gives such a tool a reliable mode to
  branch on when it exists.
- **In-product Synclair docs + built-in knowledgebase** — a booting hub should
  explain *itself* in-product. The `/synclair/how-it-works` page is the seed;
  the follow-up is Synclair's own docs as a browsable knowledgebase in the hub.

## Related

- `docs/foundation-model.md` — the architecture (Brain / adapter / seed); §8 seed inventory lists `data/setup.json`.
- `docs/new-project.md` — the new-project install path.
- `docs/existing-project.md` — adding Synclair to an existing product (co-location + intake).
- `.claude/skills/co-locate-synclair/SKILL.md` — the co-location mechanics.
- `.claude/skills/synclair-sync/` — the foundation-update sync.
