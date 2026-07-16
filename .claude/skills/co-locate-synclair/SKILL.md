---
name: co-locate-synclair
category: intake
layer: foundation
description: Place Synclair INSIDE a product repo as a subdirectory (co-located mode) instead of as a sibling clone, and isolate the two apps so the product's build/lint/typecheck/deploy don't trip over Synclair's. Use when a team wants one repo and one clone — so agents building in the product repo get Synclair's skills/knowledge ambiently — and asks to "put synclair in the repo", "vendor synclair", "embed the hub", "co-locate", or "keep the two apps from colliding". NOT the default — the foundation recommends the SIBLING model (docs/existing-project.md); reach here only when single-repo ergonomics outweigh losing easy foundation sync.
---

# Co-locating Synclair inside a product repo

The default companion setup is a **sibling** clone next to the product repo
(`docs/existing-project.md`) — two repos, two clones, foundation updates via
`synclair-sync`. This skill is the **alternative**: Synclair lives *inside* the
product repo at `synclair/`, so the team clones one repo and agents building in
it see Synclair's `.claude/skills` and knowledge ambiently.

## When to reach for this (and when not to)

**Choose co-located when** the deciding factor is *agents building in the
product repo should have Synclair's skills + knowledge loaded without being told
to go look* — that is a **placement** problem no CI job or URL solves. One repo,
one `git pull`, one clone for the whole team.

**Stay sibling (the default) when** you want frictionless foundation updates,
or the product repo's tooling is fragile — a second app inside it always costs
isolation config.

**The unavoidable tradeoff:** being on disk inside the repo does NOT put the hub
on `yourapp.com/synclair` (that's a routing decision — a rewrite/multi-zone, same
either way), and it does NOT auto-refresh the catalog (still a generator run).
What it buys is ambient agent context. Weigh that honestly before doing it.

## Two co-located variants — pick sync vs simplicity

| Variant | How | Foundation updates? |
|---|---|---|
| **Subtree** | `git subtree add --prefix synclair <synclair-remote> main` | **Kept** — `git subtree pull` later (adapt `synclair-sync` from clone-with-`upstream` to subtree) |
| **Vendored** (disconnected) | copy the files in, `rm -rf synclair/.git` | **Gone** — frozen copy; re-vendor by hand to update |

Both land the change on a **feature branch** of the product repo, reviewed via
PR — branch is the delivery mechanism, not an alternative to the above. Neither
is a GitHub *fork*: a fork only matters for the sibling model's `upstream` link.

```bash
# in the product repo, on a branch
git checkout -b add-synclair
# --- subtree (keeps sync) ---
git subtree add --prefix synclair <synclair-remote> main --squash
# --- OR vendored (disconnected) ---
cp -R ../acme-synclair ./synclair && rm -rf ./synclair/.git && git add synclair
# then: commit → PR → merge
```

## The isolation — make the product's tooling ignore `synclair/`

**The one rule that prevents most collisions: never share a dependency tree.**
Do NOT add `synclair/` to the product's npm/pnpm/yarn workspaces. Two
`package.json`, two `node_modules`, two `.next` — operate Synclair by `cd`-ing
in. That alone sidesteps the React/Next version clash (product's stack vs
Synclair's Next 16 / React 19). Everything below just points the product's tools
away from the folder.

| Tool | File (product root) | Add | Why |
|---|---|---|---|
| TypeScript | `tsconfig.json` | `"exclude": ["node_modules", "synclair"]` | else `tsc` compiles Synclair's files against the product config → phantom errors |
| ESLint (flat) | `eslint.config.*` | `{ ignores: ["synclair/**"] }` | product lint rules would fire on Synclair's code |
| ESLint (legacy) | `.eslintignore` | `synclair/` | same |
| Vitest | `vitest.config.*` | `test.exclude: ["synclair/**"]` | stops collecting Synclair's tests |
| Jest | `jest.config.*` | `testPathIgnorePatterns: ["/synclair/"]` | same |
| Git | `.gitignore` | `synclair/node_modules`, `synclair/.next` | keep build junk out of history (DO commit the source) |
| Deploy (Vercel) | `.vercelignore` | `synclair/` | don't build/ship the hub with the product |
| Deploy (other) | build config | scope the build command to the product | bundlers that walk the whole tree would pull it in |

> **Gotcha — a host `.gitignore` that ignores `.claude/` silently kills the whole point.**
> Many repos add `.claude/` (or `.claude/*`) to `.gitignore` to keep *personal*
> agent config out of git. In co-located mode that also excludes the **bridged
> skills/agents** you commit at the host root — so the team clones the repo and
> gets *none* of Synclair's ambient capabilities, defeating the reason to
> co-locate. Before you finish: `git check-ignore .claude/skills` — if it prints a
> match, un-ignore the shared parts (e.g. `!.claude/skills/` / `!.claude/agents/`
> after the `.claude/` rule, or scope the ignore to `.claude/settings.local.json`)
> and confirm the bridged files actually stage (`git status .claude/`). The
> co-located `synclair/` source has the same requirement — commit the source, git-ignore only its `node_modules`/`.next`.

## The deliberate exception — agents SEE Synclair

Everything above hides `synclair/` from *compilers*. Agents are the opposite —
the whole reason to co-locate. Claude Code auto-loads skills from `.claude/skills/`
at the repo root, so bridge the **portable** skills (knowledge/domain — NOT
Synclair's build-mechanics skills like `build-view`/`component-library`, which
assume Synclair's own app structure):

```bash
# from product repo root — symlink keeps a single source of truth
mkdir -p .claude/skills
for s in product-spec project-identity; do
  ln -s ../../synclair/.claude/skills/$s .claude/skills/$s
done
```

Then a pointer in the product repo's `CLAUDE.md` / `AGENTS.md`:

> **Synclair foundation** lives in `synclair/` (its own app — `cd synclair &&
> npm run dev` → :4100/synclair). Its knowledge digests and catalog document THIS
> repo. Build tools ignore the folder by design; only agents look in.

Isolation for the compilers, visibility for the agents — they pull opposite
directions on purpose. That is the whole job.

## Record the setup mode (do NOT skip — this is the embedded install path)

Co-locating **is** `embedded` mode (`docs/setup-modes.md`). Record it
authoritatively so the hub, `isExistingProjectMode()`, and future agents don't
have to re-guess the topology. Write `synclair/data/setup.json` (from *inside*
the synclair dir, i.e. the clone's own root):

```jsonc
// synclair/data/setup.json
{
  "mode": "embedded",
  "resolvedAt": "<current ISO-8601 timestamp>",
  "resolvedBy": "install"
}
```

This is the "record" step of determine → confirm → record. Because you're
installing knowingly, write it directly with `resolvedBy: "install"` (the
trusted path) — no `detectSetupMode()` guess needed. Match the shape
`recordSetupMode()` writes in `lib/system/setup.ts`; `scripts/synclair-reset.sh`
blanks this file to `{ "mode": null }` on reseed, so re-record after any reset.
Without this the clone boots **unresolved** and can be misclassified as a
new-project clone that *is* the product.

## Operating the two apps

```bash
npm install && npm run dev          # product — from root, as usual
cd synclair && npm install && npm run dev   # hub — its own island, :<port>/synclair
```

**Port:** the hub defaults to **4100** but auto-bumps (4101/4102…) when the host
app or other Synclair instances already hold the lower ports — a monorepo commonly
lands the hub on 4101/4102. Take the port from `synclair/.claude/launch.json` /
the dev server's own startup log, not the literal "4100" written throughout these
docs. Do NOT "reclaim 4100" blindly in this mode — the process there may be the
**host app**.

## Verify (run in the product repo after wiring it up)

- [ ] `npm run typecheck` — no errors originating in `synclair/`
- [ ] `npm run lint` — reports no `synclair/` files
- [ ] product test run — does not pick up Synclair tests
- [ ] product build/deploy output — `synclair/` absent
- [ ] `cd synclair && npm run dev` — hub still serves (its port, default 4100 → may be 4101/4102)
- [ ] `synclair/data/setup.json` reads `"mode": "embedded"`
- [ ] an agent in the product repo can load a bridged skill (e.g. `product-spec`)

## Related

- `docs/existing-project.md` — the default **sibling** model (prefer it unless co-location earns its keep)
- `existing-project-intake` — populate the hub from the host repo (runs the same either way)
- `synclair-sync` — foundation updates (subtree variant only; adapt the remote step)
- `preview-server` — running the hub on :4100
