# Synclair

<https://synclair.dev>

**Synclair is a project foundation you clone, not a package you install.** It
gives a project one aligned source of truth — design tokens, components,
views, and distilled product knowledge — served by an in-repo hub built for
**humans browsing** and **AI agents building** alike.

Agent-built codebases drift: every session starts blank, reinvents components,
and restyles as it goes. Synclair is the counterweight — a shadcn-style
registry with a live visual library, machine-enforced guardrails (tokens-only
styling, registration, render coverage), and a knowledge layer that distills
specs, Figma files, and the codebase itself into context every agent loads
before writing a line.

Synclair's own UI is Next.js + shadcn + Tailwind. What it *governs* — the
project's design system — is platform-neutral via a swappable adapter
(`lib/system/adapters/`), so the same foundation can back a web app or (via
react-native-web) a React Native app.

## Quick start

```
git clone https://github.com/joshuaiwata/synclair my-project
cd my-project
npm install && npm run dev    # hub at http://localhost:4100/synclair
```

A fresh clone is **blank on purpose** — the seed (brand, domain knowledge,
project identity) is stripped, ready to reseed. Two setup paths:

- **New project** — the clone *is* the project: [`docs/new-project.md`](docs/new-project.md)
- **Existing app** — Synclair as a companion beside (or embedded in) a codebase
  that already exists: [`docs/existing-project.md`](docs/existing-project.md)

`scripts/synclair-reset.sh` returns any clone to the blank state.

## The hub

Everything Synclair knows renders at `/synclair` (the product you build lives
at `/`):

| Route | What it is |
|---|---|
| `/synclair` | Overview |
| `/synclair/foundations` | Design tokens, live from the theme |
| `/synclair/components` · `/blocks` · `/templates` | The component library — every registered item renders live with UX docs |
| `/synclair/knowledge` | Sources of truth (specs / PRDs / Figma / decks) + distilled summaries |
| `/synclair/system` | System map — what the codebase consists of beyond the UI |
| `/synclair/ai-setup` | The skills & agents that ship with the clone |
| `/synclair/environment` | Stack, services, and foundation freshness |

Dev server on **port 4100** (never 3000).

## You own the clone — updates are opt-in

Like shadcn, the source transfers to you: nothing phones home, nothing
auto-updates. When you *want* updates:

- `npm run call-home` — opt-in freshness check against this repo (how far
  behind is your foundation, and what's incoming). Also surfaced on
  `/synclair/environment`.
- The `synclair-sync` skill — pulls foundation updates as a deliberate git
  merge. Your seed (brand, knowledge, identity) never syncs, in either
  direction.

## Architecture

**[`docs/foundation-model.md`](docs/foundation-model.md)** — the brain / adapter /
Synclair-skin layers, the platform seam, and the seed inventory. Read before
restructuring anything.

- **Brain** (portable): token vocabulary, tiers, docs contract, search, AI setup,
  the knowledge layer — `lib/system/*`, `.claude/`.
- **Adapter** (swappable): `lib/system/adapters/*` — swap `activeAdapter` to retarget.
- **Synclair skin** (always Next + shadcn): the routes and shell.

Working in the repo with an agent? Start at [`AGENTS.md`](AGENTS.md) — the
agent-neutral router every capability hangs off.

## License

Synclair is free software, licensed under the
[GNU General Public License v3.0 or later](LICENSE) (GPL-3.0-or-later).
