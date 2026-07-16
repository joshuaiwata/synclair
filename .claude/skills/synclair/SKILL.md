---
name: synclair
category: foundation
layer: foundation
description: Maintain the Synclair foundation — keep this repo true to the brain/adapter/seed architecture. THIS repo IS Synclair, the upstream that projects clone; improvements here reach future projects on their next clone. Use when restructuring, when deciding whether something is foundation vs. project, or when touching lib/system / adapters / the knowledge layer / the hub shell. Spec: docs/foundation-model.md.
---

# Synclair — the foundation itself

> **Orientation first — are you in the mother or a clone?** The mother /
> foundation repo is **`https://github.com/joshuaiwata/synclair`**. Run
> `git remote -v`: if an **`upstream`** remote points there and this repo's
> `origin` is a different repo, you are in a **downstream clone** — the "This repo
> IS Synclair / you are upstream" language below describes the *mother*, not you,
> and merging a change into the clone does **not** reach the foundation. From a
> clone, reach the foundation via the **`synclair-sync`** capability.

**This repo IS Synclair** — the reusable, platform-agnostic foundation that
projects clone and reseed. The full architecture is
**[`docs/foundation-model.md`](../../../docs/foundation-model.md)** — read it before any restructuring.

**You are upstream.** clone-don't-sync means projects don't auto-pull from here; they get the foundation *as it was the day they cloned*. So improvements you make here reach future projects on their **next clone** — and a project can deliberately port a foundational change back to this repo (that's the flywheel, from the project side). Keep this repo clean, generic, and seed-free so every clone starts right.

## The three layers (know which you're touching)

| Layer | What | Where | Rule |
|---|---|---|---|
| **Brain** (portable) | token vocabulary, tiers, docs contract, search, AI setup, knowledge layer | `lib/system/*` (minus seed), `.claude/` | Keep generic — no project specifics leak in |
| **Adapter** (swappable) | preview depiction, token export, distribution | `lib/system/adapters/*` | Swap `activeAdapter` to retarget; don't hardcode platform elsewhere |
| **Seed** (per project) | brand, theme, domain, knowledge sources, identity | `lib/system/seed/*`, domain skills, `knowledge/sources.ts`, `globals.css` | In THIS repo, kept blank — a fresh clone reseeds it |
| **Hub skin** (fixed) | the UI itself | `app/*` routes, `components/blocks/app-sidebar` etc. | Always Next + shadcn; foundation, not product |

## Rules to keep true

- **No brand values in the Brain.** Colors/theme live in `lib/system/seed/` (e.g. `brand-ramps.ts`), never inlined into `tokens.ts`. Vocabulary in `tokens.ts`; values in seed. In this repo the seed is blank by design.
- **Component layer boundary.** Synclair's own hub-skin components (sidebar, command palette, source editor, and the generic status/stat/header pieces the hub is built from) are `meta.layer: "foundation"` in `registry.json`. A project's own components are the default (`project`). Galleries + ⌘K show only `project`; foundation stays registered/documented but hidden. So a fresh clone's library reads empty until the project builds its own components — correct.
- **Skills & agents carry the same layer split.** Every `.claude/skills/<name>/SKILL.md` and `.claude/agents/<name>.md` frontmatter declares `layer: foundation | project` (parsed by `lib/system/frontmatter.ts`, surfaced as the "Origin" badge on `/synclair/ai-setup`). **Foundation** capabilities ship with Synclair and sync from upstream (synclair-sync); **project** ones are the clone's own and never sync — like seed. In THIS repo everything is `foundation` by definition: the seed is the only project-specific layer, and it's blank. Absent ⇒ `project` (the default a clone's own new skill takes). Also declare `category:` — the `/synclair/ai-setup` grouping (`lib/system/capability-categories.ts`).
- **Previews go through the adapter.** Doc previews are a `Preview` (`live()`/image/embed), rendered by `activeAdapter` — never a raw node. This is what lets the same contract serve a mobile target.
- **Knowledge: link, don't copy.** Sources of record live in `lib/system/knowledge/sources.ts` (surfaced at `/knowledge`); the repo holds distilled digests, not raw docs.
- **Rules become mechanism.** A convention that can be machine-checked should not
  live as prose alone — prose is advisory and erodes under volume; a checker fires
  at the moment of violation for every agent and human, forever. The gate is
  `npm run verify-ui` (typecheck + ESLint foundation guardrails + registry drift
  check), run in CI (`.github/workflows/verify.yml`). Write every guardrail error
  message as a **fix instruction** (what to use instead + where the vocabulary
  lives) — for an AI agent the message lands in-context right after it wrote the
  line, so it doubles as a re-prompt. When you add a new convention, ask "can this
  ship with its check?"; when a rule fires on legitimate code, that usually means
  a missing token/entry — extend the vocabulary, don't `eslint-disable`. See
  `docs/foundation-model.md` §10.
- **Router stays a map, and stays agent-neutral.** The router is `AGENTS.md` (read by
  every agent); `CLAUDE.md` just `@`-imports it + Claude-only notes. Edit `AGENTS.md`,
  not `CLAUDE.md`. It holds no knowledge, only pointers.
- **Keep it seed-free.** Don't commit a specific project's brand, domain, or knowledge here. `scripts/synclair-reset.sh` defines exactly what "blank" means (foundation-model.md §8).

## The capability gate (before adding a skill or agent)

Skills and agents are cheap to add and expensive to keep honest — the way a set stays solid isn't a size limit, it's a gate at creation (the same discipline the `component-library` invention gate applies to components). Before adding one, clear all three:

1. **Prove no existing capability covers it.** Read the current set (`/synclair/ai-setup`, or the `.claude/` dirs). If an existing skill's scope contains this, **extend that skill or distill into it** — don't fork a near-duplicate. New know-how usually belongs *inside* the skill that already owns the topic (the flywheel), not beside it. Overlapping "use when" clauses are how a set rots.
2. **Skill or agent — pick by mechanism, not vibe.** A **skill** is portable how-to/policy the main thread (or any agent) reads in place. Spin up an **agent** only when a task needs *its own context window* — an isolated worker (a "digger") that reads something large and returns a tight digest, or a specialist that runs a self-contained loop — so the main thread never holds the raw material. If it doesn't need context isolation, it's a skill (or just inline steps), not an agent. Most agents pair with a parent skill that orchestrates them.
3. **Decide its layer and category, and declare them.** Foundation (domain-neutral, ships to every clone) vs. project (this repo's own) — see the layer rule above; a project-specific capability is **not** foundation and must not leak generic-foundation phrasing. Set `layer:` and `category:` in the frontmatter at creation, or it lands in "Other" / defaults to project.

Passing the gate, invent confidently — a genuinely new, well-scoped capability is welcome. Failing it, the move is to strengthen an existing skill instead.

## Receiving a promoted change (the flywheel, from the upstream side)

A project (a clone) may deliberately port a foundational improvement back here. When
it does — or when you make one directly — vet it before it lands:

1. **Foundation, not seed.** A new token *value* or a domain digest is seed and does
   NOT belong here. A new *kind* of token export, a gallery/registry capability, a
   router-schema change, a domain-neutral skill/agent, or a hub-skin improvement does.
2. **Strip the seed.** Port the *mechanism* with every project-specific noun removed —
   generic phrasing, blank templates, no brand/domain leakage. If it can't be phrased
   generically, it isn't foundation.
3. **Commit; the next clone inherits it.** clone-don't-sync means existing projects
   keep their snapshot — only new clones pick this up. This is the deliberate
   counterbalance to clone-don't-sync: durable improvements consciously converge here.

## Related

- `component-library` — the invention gate + registry conventions (with the layer rule).
- `build-view` — building views; consults the knowledge manifest.
- `docs/new-project.md` — the clone-and-prune pipeline projects follow.
