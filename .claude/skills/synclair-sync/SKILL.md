---
name: synclair-sync
category: foundation
layer: foundation
description: Pull foundation updates from the mother Synclair repo into this clone, or promote a foundation improvement upstream. Use when asked to "sync with upstream", "update the foundation", "pull synclair updates", "are we behind the mother repo?", to set up or run "call home" (npm run call-home — the opt-in freshness check on /synclair/environment), when Synclair shows the clone is behind, or when a foundation-level improvement made here should reach other projects. NOT for reseeding a fresh clone (that's docs/new-project.md) and never for syncing seed content — the project's brand, domain, and knowledge never sync in either direction.
---

# Syncing with the mother Synclair repo

The mother repo is **`https://github.com/joshuaiwata/synclair`** (`upstream`).
Doctrine (foundation-model.md, principle 3): **clone, sync deliberately** —
nothing syncs automatically, the seed never syncs at all, and a project pulls
foundation updates only when it chooses to, as an ordinary git merge.

**First: which topology?** (`docs/setup-modes.md`, or read `data/setup.json`.)
The `upstream`-remote flow below assumes this clone is its **own git repo** — a
standalone clone or a **watcher** sibling. It does **not** apply as-is when
Synclair is **embedded** inside a host repo (there's no independent `.git` at
`./synclair`):

| Embedded variant | How updates come in |
|---|---|
| **Subtree** (`git subtree add --prefix synclair …`) | `git subtree pull --prefix synclair <synclair-remote> main --squash` from the host repo root — NOT `synclair-sync.sh`. The seed-boundary contract below still governs conflict resolution. |
| **Vendored** (`rm -rf synclair/.git`) | No sync — frozen copy. Update by re-vendoring the files by hand (or converting to subtree). |

So in an embedded repo, skip the `scripts/synclair-sync.sh` commands and use the
subtree/vendored path above; the rest of this skill (the merge contract, verify
steps, upstream promotion) still applies once the files have merged. The
standalone/watcher flow follows.

**The merge contract** is the seed boundary (foundation-model.md §8):

| On conflict | Resolution |
|---|---|
| SEED (`lib/system/seed/*`, `knowledge/sources.ts`, `references.ts`, `data/*`, `memory/*`, product-spec digests, and any `.claude/` skill/agent marked `layer: project`) | **keep ours** — the script does this automatically |
| BRAIN / Synclair-skin (`lib/system/*`, `app/synclair/*`, `.claude/` skills & agents marked `layer: foundation`, `scripts/*`, docs) | **take upstream's**, unless this project deliberately forked the mechanism |
| MIXED (`app/globals.css`, `package.json`, `registry.json`, `AGENTS.md`, `README.md`) | by hand — identity/theme lines are the project's, structure/deps are upstream's |

## Knowing you're behind — call-home (opt-in)

The shadcn-style freshness seam, for clones that want to know when the
foundation moved **without** a git remote: `data/mother.json` records the
clone's foundation **baseline** (the mother sha it last synced to) and an
opt-in `callHome` flag. When on, the hub's `/synclair/environment` › Synclair
view shows "up to date" / "N updates available" (with the incoming commit
titles) via GitHub's public compare API — no auth, no telemetry, nothing sent
but the baseline sha; checking is never pulling.

```
npm run call-home                     # status: behind-count + incoming titles
npm run call-home -- --enable         # opt in (--disable to opt out; off by default)
npm run call-home -- --anchor latest  # record the baseline by hand (or a specific sha)
```

The baseline is stamped automatically by `synclair-sync.sh pull`; **embedded
subtree clones stamp it by hand** after each `git subtree pull` — anchor to the
mother sha you just pulled (it's in the "Squashed 'synclair/' changes from
X..Y" commit message: `npm run call-home -- --anchor <Y>`). This works in every
topology because it never needs a `.git` of its own.

While the mother repo is **private**, the check needs a GitHub identity that
can read it: `GITHUB_TOKEN`/`GH_TOKEN` env, or a signed-in `gh` CLI (resolved
in that order; anonymous works if the repo goes public). Without one, the hub
shows "mother repo unreachable" and the CLI says how to fix it.

## Pulling updates (downstream)

```
scripts/synclair-sync.sh status   # behind-count + what's incoming
scripts/synclair-sync.sh pull     # merge on a foundation-sync-<date> branch
```

`pull` never touches the current branch: it branches, merges
`upstream/main`, auto-keeps the seed, and lists what's left. Then:

1. Resolve remaining conflicts per the table above; `git commit --no-edit`.
2. `npm install` (if package files changed) and **`npm run verify-ui`**.
3. Bring the app up (preview-server skill) and check the hub renders with the
   project's own branding intact — if the merge turned anything neutral/blank
   that used to be branded, a seed file was resolved the wrong way.
4. Merge the sync branch back and delete it.

**Clones without shared ancestry** (started with `rm -rf .git` under the old
procedure): the script detects this and does a one-time
`--allow-unrelated-histories` adoption merge. It's noisier — every differing
file conflicts — but the same contract resolves it, and every later sync is a
cheap 3-way merge.

## Promoting an improvement (upstream — the flywheel)

When something built here is foundation, not seed (a new hub capability, a
generic skill, a guardrail — see the `synclair` skill's vetting rules):

1. Keep the improvement in its own commit(s), touching only Brain/hub-skin paths.
2. In a checkout of the mother repo: branch, `git cherry-pick` the commit(s)
   (clean when ancestry is shared), **strip any seed leakage** — project nouns,
   brand values, domain content — then `npm run verify-ui` and PR/merge.
3. The next `synclair-sync pull` here will see it come back as already-merged.
