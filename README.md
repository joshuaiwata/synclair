# Synclair

<https://synclair.dev>

**Synclair** is a reusable project foundation — the setup that *gives clarity to
your setup*. One aligned source of truth for a project's design tokens,
components, and AI context, for **humans browsing** and **agents building** alike.

Synclair's UI is Next.js + shadcn + Tailwind. What it *governs* — the app's
design system — is platform-neutral via a swappable adapter
(`lib/system/adapters/`), so the same foundation can back a web app or (via
react-native-web) a React Native app.

**This is a blank Synclair clone** — the seed is stripped, ready to reseed.

## Start a new project

See **[`docs/new-project.md`](docs/new-project.md)**. The seed reset has already
been run on this clone; reseed brand/theme, an optional domain skill, knowledge
sources, and identity, then:

    npm install && npm run dev    # http://localhost:4100

## Architecture

**[`docs/foundation-model.md`](docs/foundation-model.md)** — the brain / adapter /
Synclair-skin layers, the platform seam, and the seed inventory. Read before
restructuring anything.

- **Brain** (portable): token vocabulary, tiers, docs contract, search, AI setup,
  the knowledge layer — `lib/system/*`, `.claude/`.
- **Adapter** (swappable): `lib/system/adapters/*` — swap `activeAdapter` to retarget.
- **Synclair skin** (always Next + shadcn): the routes and shell.

## Synclair

| Route | What it is |
|---|---|
| `/` | Overview |
| `/foundations` | Design tokens |
| `/components` · `/blocks` · `/templates` | Component library |
| `/ai-setup` | Skills & agents |
| `/knowledge` | Sources of truth (specs/PRDs/Figma/decks) |
| `/environment` | Stack |

Dev server on **port 4100** (never 3000). Don't `next build` in the dev dir.

## License

Synclair is free software, licensed under the
[GNU General Public License v3.0 or later](LICENSE) (GPL-3.0-or-later).
