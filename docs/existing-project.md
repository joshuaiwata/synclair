# Using Synclair alongside an EXISTING project

[`new-project.md`](new-project.md) covers the primary flow: a new project **is**
a Synclair clone. This doc covers the other case — you already have a product
repo (its own framework, router, and dev server) and want Synclair next
to it: knowledge manifest, references library, design tokens,
Figma digests, and a place to prototype views.

## The mental model (read this first)

**Synclair is a separate server, not a route in your app.** Nothing gets mounted
into the host app's router. Two processes, two ports:

- `localhost:<host-port>` — your existing app, untouched.
- `localhost:4100` — the Synclair clone (product shell at `/`, Synclair at `/synclair`).

Visiting `<your-app>/synclair` will NOT show Synclair — it hits your app's router
(which may swallow it as a slug/org path and render something confusing).
Synclair lives at **`localhost:4100/synclair`**, always.

## 1. Clone as a sibling (not a subdirectory)

```bash
cd <parent-of-your-project>
git clone https://github.com/joshuaiwata/synclair.git <project>-synclair
cd <project>-synclair
git remote rename origin upstream        # the foundation stays reachable for syncs
git remote add origin <the-hub's-own-repo-url>   # optional, for backup
```

A sibling keeps the two git histories, lockfiles, and `node_modules` apart —
nesting a second repo inside the host confuses agents and tooling. Keeping the
foundation's history (don't `rm -rf .git`) is what lets `synclair-sync` pull
future foundation updates as an ordinary merge.

**Preflight — verify the clone is current.** It must contain
`docs/new-project.md`, `docs/existing-project.md`, and
`scripts/synclair-reset.sh`. If any are missing, you cloned a stale or wrong
repo (a pre-Synclair prototype shape) — the source of record is
`https://github.com/joshuaiwata/synclair`, default branch.

## 2. Blank and reseed

```bash
scripts/synclair-reset.sh . --yes
npm install
```

Then reseed per [`new-project.md`](new-project.md) §4, with the host project as
the subject: set `lib/system/seed/project.ts` `name`/`tagline` to the host
product's, and point `lib/system/knowledge/sources.ts` at the host project's
PRDs/specs/Figma. Theme is optional — pull the host's brand ramps in if you
want token parity, or leave the neutral theme for a pure hub.

## 3. Run

```bash
npm run dev   # port 4100 — never the host app's port
```

Synclair: `http://localhost:4100/synclair`. The host app keeps its own port and server.

## 4. Tell the host repo Synclair exists

Add a short pointer to the host repo's `AGENTS.md`/`CLAUDE.md` so agents
working there know where Synclair lives, e.g.:

> Synclair for this project: `../<project>-synclair` (dev server
> `localhost:4100`, at `/synclair`). Knowledge manifest and references live
> there, not in this repo.

## 5. Populate Synclair from the host codebase

A fresh companion clone is empty. The **`existing-project-intake`
skill** fills it from the host repo via five digger agents (each reads the host
in its own context and returns a digest):

| Phase | Digger | Fills |
|---|---|---|
| 1. Survey | `codebase-surveyor` | project memory, host pointer, orientation for the rest |
| 1b. System map | `system-mapper` | `data/system-map.json` → `/synclair/system` (areas, API, data model, jobs, integrations) |
| 2. Knowledge | `knowledge-harvester` | `lib/system/knowledge/sources.ts` → `/synclair/knowledge` |
| 3. Tokens | `token-archaeologist` | `lib/system/seed/brand-ramps.ts` + `globals.css` → `/synclair/foundations` |
| 4. Components | `component-cataloger` | `data/external-catalog.json` → the galleries (`origin: "external"`, shown as "Host") |

Host components enter the library as **documented entities** (API, usage
snippets, host usage counts, screenshots) with `origin: "external"` — cataloged
without being imported, since the hub documents the app's design system rather
than executing it. Freshness against the host is machine-checked:
`npm run check:host` re-hashes each cataloged source and flags drift; refresh
stale entries by re-running the cataloger on them.

## Multi-frontend hosts (monorepo web + mobile, or sibling repos)

A host that ships **more than one frontend** — a responsive web app plus a
React Native/Expo companion, a monorepo with `apps/web` + `apps/mobile` — still
gets ONE companion clone. Each frontend becomes a **surface**
(foundation-model §5b):

- **Declare surfaces at intake** (the intake skill's Phase 0, after the survey
  detects them and the user confirms): one entry per frontend in
  `lib/system/seed/surfaces.ts` (`id`, `label`, `platform`, `root`,
  `framework`). The catalog's `hosts[]` gets one host per surface — monorepo
  workspaces (`"../acme/apps/mobile"`) and sibling repos both work, since a
  host is just a root path.
- **Catalog per surface**: the component-cataloger runs once per surface; every
  entry carries its `surface` id. The same component name on two surfaces is
  legal — the galleries isolate per surface (the sidebar's **Library** entry
  becomes a drill-in landing), so a web `button` and an RN `button` never mix.
- **Knowledge stays shared**: one manifest for the whole product. The harvester
  tags a source `surfaces: ["mobile"]` only when it's explicitly
  platform-scoped; untagged sources apply everywhere.
- **One system map**: entries tagged `surface` or `"shared"` — the shared
  backend renders once, grouped apart from each frontend's areas.
- **RN previews**: host RN components preview via screenshots (Expo web /
  simulator) or `embed` URLs (Expo web / Storybook). Live in-browser rendering
  via react-native-web exists only for RN components **ported into the clone**,
  and only when the surface sets `liveRender: true` + `react-native-web` is
  installed — a per-project decision, off by default.

With a single frontend, declare nothing: `surfaces.ts` stays empty and the hub
shows no multi-surface chrome at all.

## What this mode does and doesn't give you

- **Gives you:** the knowledge manifest + digests, the references library,
  Figma distillation, design tokens/foundations seeded from the host's actual
  brand, a cataloged (read-only) view of the host's components, and a registry
  + galleries for anything you build *inside the clone*.
- **Doesn't:** live-render, lint, or registry-manage host code. The guardrails
  and docs contract only govern code in the Synclair repo. To make a host
  component first-class (live previews, `verify-ui` protection), port it into
  the clone through the `component-library` skill's invention gate — the
  registered item then supersedes its external catalog entry.
