# Synclair's agent interface — plan and status

**Status: phases 0–2 BUILT (inert), 3–5 planned.** Companion to
[`extensibility.md`](extensibility.md). Where that RFC draws the Core/Extension
line, this one covers how Synclair's knowledge reaches **agents** — and how we
prove each change helps instead of assuming it.

## Why now

Synclair's knowledge reaches agents two ways today, and both are expensive:

- **Ambient** — the router plus every skill and agent *description*, loaded into
  every session before a task starts. Measured in this repo: **~8.3k tokens**.
- **Lookup** — opening whole files (`registry.json`, `data/*.json`, a 10k-char
  SKILL.md) to answer one question.

The audit that prompted this compared Synclair against
[repowise](https://github.com/repowise-dev/repowise), an AGPL code-intelligence
indexer. It is **complementary, not competing** — its lane is code truth (graph,
churn, health, dead code), Synclair's is design and product truth. No code was
taken; Synclair is GPL-3.0-or-later and mixing in AGPL source would pull
network-use obligations into a hub that is served over a network. What we took
were methods.

## Prime directive (inherited)

Same as the extensibility RFC: **additive, all-on, reversible**. Every phase must
be a no-op for an existing clone until a human opts in. The toolbelt-frontend and
platform-clairity hubs are the reference clones; nothing ships until it's proven
inert against them.

---

## Phase 0 — measure first ✅ BUILT

`npm run measure:agent-cost` reports the ambient tax and the lookup cost of five
representative questions, and `--compare` diffs against the stored baseline in
`data/agent-cost.json`.

Two deliberate choices:

- **No tokenizer dependency.** Chars-per-token estimates, labelled as estimates
  everywhere they surface. What matters is the delta between two runs of the same
  estimator, not the absolute number.
- **Blank seeds are reported as `blank`, never counted as zero.** The mother repo
  ships blank data, so its lookup figures are not meaningful; the script says so
  rather than letting a small number read as a good number.

**Why it's first:** without it, every later claim is unfalsifiable. It also makes
the capability gate quantitative — before adding skill #21, you can see what the
existing 20 already cost.

## Phase 1 — one freshness vocabulary ✅ BUILT

`lib/system/provenance.ts` generalises the anchor `pages-map` already had into a
shared contract: `{generatedAt, commit, sourceHash, sourceFiles, generator,
confidence}` plus a `fresh | stale | unanchored` resolver.

- **Optional everywhere.** Adopted on the System Map, host catalog, and hygiene
  report as an optional field. Data written before this existed resolves to
  `unanchored` — never an error, never a false `stale`. That's what makes it
  inert.
- **Derived, not declared.** Freshness is recomputed from files on disk, not
  trusted from a flag someone forgot to update.
- **`unanchored` is a real answer.** A host repo that isn't checked out on this
  machine can't be judged. The UI shows nothing rather than crying wolf.

`pages-map` now delegates to the shared hasher, keeping `check-pages.mjs` in
lockstep by construction instead of by comment.

## Phase 2 — the MCP server ✅ BUILT

`scripts/mcp-server.mjs` — seven task-shaped tools over the hub's data:

| Tool | Answers |
|---|---|
| `get_overview` | what this product is, how the clone is wired, what the hub knows + freshness |
| `search_library` | components/blocks/templates, native **and** cataloged host |
| `get_component` | full record + which pages compose it (batched) |
| `get_foundation` | semantic tokens **and** the styling rules |
| `get_page` | sitemap, or full records for specific routes (batched) |
| `get_system` | areas, API, data model, jobs, integrations |
| `get_knowledge` | sources + where each digest lives |

Three properties are the point:

- **No hub required.** Reads JSON off disk — no Next, no port, no dev server on
  4100. It cannot collide with the hub, and agents stop needing the hub *running*
  to read the catalog.
- **No dependencies.** Raw JSON-RPC over stdio rather than the SDK. A cloned
  foundation must work in any clone with zero install.
- **Location-anchored, not cwd-anchored.** The hub root comes from the script's
  own path, so one entry is correct in both topologies. Verified from three
  different working directories.

### Registration

`npm run mcp:install` resolves the target from `data/setup.json`:

| Topology | Path | Committable |
|---|---|---|
| embedded / standalone | repo-relative | **yes** — arrives on clone, zero setup |
| watcher | absolute | **no** — machine-specific, gitignore it |

It merges rather than clobbers an existing `.mcp.json`, and is **not** wired to
`postinstall`. Writing a repo's own `.mcp.json` is fair — visible in git, gated
by the client's approval prompt. Writing a user's global agent config as an
`npm install` side effect would be invisible and hard to undo.

### Measured result

Mother repo, blank seed, **like-for-like** (same broad question, data files only):

| Question | File read | Tool | Saving |
|---|---|---|---|
| What components exist | 4,720 tok | 3,873 tok | **18%** |
| Which token do I use | 4,368 tok | 1,468 tok | **66%** |
| What is this project | 129 tok | 169 tok | **−31%** |
| Pages / System Map | — | — | not comparable (blank seed) |

**~40% across comparable scenarios**, against a permanent **+854-token** tool
surface. The registry saving is small because `registry.json` is already dense
structured data; the token saving is large because `tokens.ts` is mostly
TypeScript interfaces and comments an agent doesn't need. `get_overview` is
*negative* on a blank seed — the tool returns a structured skeleton where the
files are nearly empty.

Two wins sit outside that table and shouldn't be folded into it: **scoped
queries** (589 tok for "badge" vs a 4,720-tok read) are a narrower question, not
compression; and every response carries a freshness state a file read can't give
you at all.

#### What this measurement is careful NOT to claim

The first version of this harness reported **86–97%**. It was wrong three ways,
and the fixes are now enforced in the script:

1. **Skill bodies were counted as lookup cost** (~7.5k tokens). A skill is
   process guidance read on demand; the tool layer doesn't replace it. They are
   now reported separately and excluded (`alsoReads`).
2. **Filtered queries were compared against whole-file reads** — a narrower
   question dressed up as compression. Comparisons now run unfiltered.
3. **Blank data produced fake wins.** Three scenarios had no data, so the tool
   answered "nothing here yet" cheaply and that read as a 97% saving. Scenarios
   now carry a `comparable` flag and print *"not comparable"* instead of a
   percentage.

The harness has now caught three real defects, which is the argument for building
it first: a missing `get_system` tool, its own inflated arithmetic, and a
stdout-truncation bug in the server (`process.exit()` on stdin end discards
buffered writes, silently cutting large replies mid-JSON — the parse failure was
being swallowed and scored as a 100% saving).

---

### Measured again, with real data

Running the Phase-3 scanner produced a real 26-route map, which finally allowed
the populated measurement the blank seed had been blocking:

| Question | File read | Tool | Saving |
|---|---|---|---|
| What pages exist | 8,249 tok | 809 tok | **90%** |
| Which token do I use | 4,368 tok | 1,468 tok | 66% |
| What components exist | 4,720 tok | 3,873 tok | 18% |
| What is this project | 129 tok | 170 tok | −32% |

**Comparable total: 17,466 → 6,320 tokens (64%)**, up from 40% on the blank seed.

This confirms the earlier caveat rather than contradicting it: the saving scales
with how much data an artifact holds. `pages-map.json` is large and repetitive
(every node carries source files, hashes, and item lists), so returning a digest
instead of the file whole is worth 90%. `registry.json` is already dense, so
reshaping it is worth 18%. **The win comes from artifacts with bulk, not from the
tool layer as such.**

## Phase 3 — scanner / prose split ⬜ IN PROGRESS

The performance work, and the biggest remaining item. Every generator has a
**facts** half a script can compute and a **judgment** half only an agent can
write; today diggers do both in one expensive context.

| Artifact | Script computes | Agent writes |
|---|---|---|
| `pages-map` | routes, source files, sha256, composed items | what the screen is *for* |
| `external-catalog` | props from types, usage counts, hashes | when to use it |
| `system-map` | areas, endpoints, models, jobs | how it hangs together |
| `ux-docs` | anatomy slots, variants, breakpoints | intent, interaction rules |

Order: `pages-map` first (most machinery already exists — `resolve:pages`,
`check:pages`, per-node hashes), then `external-catalog`, then `system-map`, then
`ux-docs` last as the most judgment-heavy.

### 3a — pages ✅ BUILT

`npm run map:pages` is now a three-step deterministic pass, of which only the
first is new:

| Step | Derives | New? |
|---|---|---|
| `scan:pages` | routes, entry files, kind, dynamic, preview URLs | **new** |
| `resolve:pages` | composed catalog items + source closure | existed |
| `check:pages --reanchor` | per-page freshness hashes | existed |

The agent is left with `title`, `summary`, and `auth` — the judgment. On this
repo the scan finds 26 routes, correctly stripping route groups (`(hub)`,
`(library)`), skipping parallel routes (`@slot`) and private folders (`_foo`),
and classifying API routes and dynamic segments.

**Prose survives a rescan.** Agent-written fields are carried over per route and
only facts are recomputed — verified by seeding a summary, re-scanning, and
confirming it (and the resolved items and hash) came through intact. A refresh
that destroys written work is a refresh nobody runs.

`provenance.confidence` drops to `medium` while any route lacks a summary: the
facts are derived, but a sitemap without prose is an inventory, not a map.

Two boundaries worth keeping:

- **Host mode is refused, loudly.** The scanner understands *this* repo's Next
  app router; a host uses its own (react-router, Expo, Next pages) and is mapped
  by the `page-mapper` agent. Same guard `resolve-page-items.mjs` already draws.
- **A blank seed is a valid state, not drift.** `--check` exits 0 on an unmapped
  clone. Reporting "26 routes missing" there would fail CI in every fresh clone
  forever — the exact breakage this plan's prime directive forbids.

### 3b — host catalog ✅ BUILT

The gap here turned out to be **much narrower than 3a's**, because the host side
was already further along: `lib/system/host-scan.ts` enumerates host component
files live, `check:coverage` already diffs them against the catalog, and props
are derived live by `deriveHostProps`. Enumeration wasn't missing — it was the
*entry drafting* that still had a digger re-deriving facts by hand.

`npm run draft:host-catalog -- --host ../app` derives, per undocumented candidate:

| Derived | How |
|---|---|
| `hostPath`, `sourceHash` | walk + sha256 — byte-identical to `check:host`, so a merged draft is immediately fresh |
| `basis` (shadcn/custom) | Radix import, or cva inside `ui/` |
| `props` | the `<Name>Props` interface, with types, required flags, and JSDoc |
| `usage.renderedIn` | JSX tag occurrences across the host corpus |

`title`, `description`, `kind`, `categories`, `notes` are emitted as **`null`** —
deliberately, for the `component-cataloger` to write. Tier especially: that's the
`tier-arbiter`'s call, not a regex's.

**It does not write the catalog, and that restraint is the design.** A mechanical
walk yields *candidates*, and candidates are not components — providers, page
one-offs and icon wrappers all export PascalCase functions. Auto-adding them is
precisely how a hub ends up advertising 40 components when the app renders 23,
which is the fiction `check:coverage` was built to catch. So the drafter prints
for triage, sorts likely-noise last with a reason (`theme-provider` →
*"name ends in Provider/Context"*), and leaves the merge to a human or the digger.
Verified: the catalog file's hash is unchanged after a run.

The walk that all this shares now lives once, in `scripts/lib/host-walk.mjs` —
it had been duplicated between `check-host-coverage.mjs` and `host-scan.ts`, and
a third copy would have guaranteed drift. The coverage script was refactored onto
it and verified to produce **byte-identical output** against a fixture host first.

### 3c / 3d — the judgment-heavy two ✅ BUILT (scoped smaller, on purpose)

Both are scoped smaller than pages or the catalog, because the derivable
fraction genuinely *is* smaller. In a real System Map the value is sentences
like *"Owns the ABAC permission model and the Stytch B2B session/webhook
handling"* — no scanner writes that, and pretending otherwise produces a map
that reads like a directory listing.

So neither generates. They **enumerate, and report what the authored half has
missed**:

**`scan:system`** derives areas (workspace dirs), endpoints (NestJS decorators +
Next `route.ts` exports), models (Prisma), integrations (known packages) — then
diffs against the map. On the real ToolBelt monorepo: **111 undocumented items**,
including 13 areas the map never mentions (it documents 13; the repo has 26).
Summaries stay empty for the `system-mapper`; existing prose carries across
untouched.

**`scan:ux-coverage`** answers the question `check:ux-docs` can't. Freshness
tells you docs haven't drifted; it can't tell you they were ever *complete* — a
doc written when a component had two variants stays perfectly fresh after a third
is added. Two things are mechanically checkable: variants declared by `cva`, and
whether a `.docs.tsx` carries the sections its **tier** requires. Whether the
prose is any good stays `doc-quality`'s call.

It found real debt here: **9 components with no `intent`, 6 blocks with no
`anatomy`** — spot-checked against the files rather than trusted.

---

## Validation against a real clone ✅ DONE

Run against **`toolbeltwork/platform-product`** (embedded topology, 4 hosts, 144
cataloged items, 51 pages, 30 registry items). Note the repo is
`platform-product`, not `platform-clairity` — earlier notes were stale.

Nothing in that repo was modified: the work ran in a throwaway hub copied to
scratch, which is the guardrail [`extensibility.md`](extensibility.md) specifies.

### The measurement, finally on real data

| Question | File read | Tool | Saving |
|---|---|---|---|
| What components exist | 71,218 tok | 6,015 tok | 92% |
| What pages exist | 36,315 tok | 1,529 tok | 96% |
| What is this project | 17,829 tok | 221 tok | 99% |
| What does the system consist of | 9,269 tok | 2,381 tok | 74% |
| Which token do I use | 7,635 tok | 1,497 tok | 80% |

**142,266 → 11,643 tokens (92%)**, 10 file reads → 5 calls, against a permanent
+854-token surface. Ambient tax there is 8,524 tokens.

This is the honest headline, and it's the opposite lesson from the blank seed:
the saving *scales with how much the artifact holds*. A 225KB catalog and a 127KB
pages map are where whole-file reads hurt, and those only exist in a populated
clone.

### Three defects the real data caught

1. **`get_system` cost 24% MORE than reading the file** — it returned every
   section in full plus JSON indent overhead. A tool that costs more than the
   file it replaces is worse than no tool. Now digests by default (names +
   counts) with `section`/`query` for depth: −24% → **+74%**.
2. **The `basis` heuristic was over-fitted.** Against 144 real entries the
   original scored 97.9%. My "improvement" — a shadcn primitive-name list plus
   primitives/composites directory scoring — scored **95.1%**, worse, because a
   mature host has its own design system using conventional names (`Avatar`,
   `Dialog`, `Table`) and its own `primitives/` directory. Measured four
   variants; the winner adds exactly one rule to the original (*importing a
   local sibling component ⇒ the host composed it*) for **98.6%**. The two
   residual misses are shadcn primitives that use no Radix (`card`, `input`).
3. **51 of the 144 entries' hashes had drifted** since cataloging — not a bug,
   but confirmation that `sourceHash` agrees with `check:host` on real content.

### Guards held

- `scan:pages` correctly **refused** a real host-mode map (`repo.root:
  ../apps/prototype`) and left it byte-identical.
- `draft:host-catalog` wrote nothing to the catalog.
- `pages.freshness` reported `unanchored` rather than inventing a verdict it
  couldn't support.

**Still unproven:** the "regenerate and diff" acceptance test for `scan:pages`
can't run there — that clone is host-mode, so the scanner (correctly) declines.
It needs a clone whose pages map describes its *own* Next app.

**Acceptance per artifact:** regenerate it for platform-clairity with the new
scanner and diff against the agent-written version. Facts must match or improve;
only prose may differ.

The `generator` field from Phase 1 is what lets the hub distinguish derived facts
from written judgment once this lands.

## Phase 4 — riders ✅ BUILT

**4a — `gen:agents-block`.** A marker-delimited block in `AGENTS.md` carrying
what *this clone* is populated with (product, setup mode + hosts, library counts,
pages, system map, knowledge, hygiene). 711 chars on the mother repo, ~800 on a
real clone, replacing six file reads.

The "Where things live" table is deliberately **not** generated — it's
architecture identical in every clone, foundation content that syncs, and
generating it would be churn. What's generated is only what differs per clone.
Append when no markers exist, replace only between them, refuse on a lone marker
rather than guess, refuse to conjure `AGENTS.md` if missing. Verified all six
paths, including that router content outside the block stays byte-identical.

`measure-agent-cost` also now lists the heaviest ambient descriptions, so the
capability gate can be quantitative. Current worst: `ui-designer` at 1,274 chars.

**4b — `rank:hygiene`.** Ranks findings by how many pages consume the file, using
the component→page edges already in `pages-map.json` — no dependency graph
needed. On real ToolBelt data this changes the answer: `Assembly.tsx` (8 findings,
2 pages) outranks `MarketMap.tsx` (19 findings, 1 page), and `PostDetail.tsx` (12
findings) falls to the bottom because nothing renders it.

*Reach unknown is not reach zero.* A hygiene report can span several hosts while
the pages map covers one, so unknowns sort **above** proven-zero and say why —
"we couldn't tell" is a worse reason to ignore something than "we checked".

**4d — `check:freshness`.** One report across every artifact in the shared
`fresh | stale | unanchored | absent` vocabulary. `unanchored` and `absent` are
not failures — a blank clone has generated nothing and a host may not be checked
out — so it exits 0 by default, `--strict` for CI. `verify-ui` and the existing
`check:*` scripts are untouched.

It cross-validates against the independent acceptance harness on the real clone
(73 fresh / 71 stale catalog entries, exact match), and surfaced something worth
knowing there: **50 of 51 mapped routes have drifted** since 2026-07-22.

**4c — `install:hooks`.** A post-commit hook that only *reports*. It can't
regenerate — several artifacts still need an agent for their prose, and firing an
agent run on every commit would be expensive and astonishing. Marker-delimited so
an existing hook survives (verified: another tool's hook still runs, and
`--remove` leaves it intact), silent when clean, and never exits non-zero since
the commit already happened. Uses the hub's absolute path because in embedded
topology the git root is the *product* repo, not the hub.

## Phase 5 — registry convergence ✅ BUILT (first half)

**Settled: the `.claude-plugin` manifest is the Extension registry's declaration
layer, not a second system.** A plugin manifest declaring skills + agents + MCP
tools is most of what [`extensibility.md`](extensibility.md) says an Extension
must declare. Building them separately would mean maintaining two registries that
describe the same capabilities.

`gen:plugin-manifest` now derives `.claude-plugin/plugin.json` from what's on
disk — 20 skills, 16 agents, and the MCP server, each with the description and
`category`/`layer` taken from its own frontmatter. The declaration can't fall out
of step with reality because it *is* reality, read back.

The MCP server sits **in** that manifest rather than beside it. Skills, agents and
tools are one capability set, and the Extension contract in
[`extensibility.md`](extensibility.md) is a superset of the same shape.

Missing classifiers are **reported, never invented** — a guessed category is worse
than a visible gap, because `/synclair/ai-setup` renders it as fact. This repo (36
capabilities) and the real ToolBelt clone (37) both come back fully classified.

Consequences:

- **Hold `synclair#23` (`bridge-agents.mjs`).** The MCP server removed the *data*
  half of what the bridge was for; the manifest removes the *declaration* half.
  Copies drift; a derived manifest can't.
- **The Extension registry must extend this manifest, not sit beside it.** That
  answers the extensibility RFC's open question on registry format.

### Still to do here

- Wire the manifest into the visibility layer (RFC Phase 1) so enable/disable
  reads from one place.
- The edit-time `PostToolUse` hook on `components/**`, now that ambient cost is
  measurable.

Edit-time enforcement (a `PostToolUse` hook on `components/**` injecting the
registry entry and token rules) lands here too — narrowly scoped, after ambient
cost is known, since it moves enforcement from `verify-ui` to the moment of the
edit.

---

## Positioning consequence

**System Map is the one place Synclair genuinely overlaps a code indexer**, and
it's the weakest artifact — hand-derived, stale on arrival, a worse version of
what a real index produces. Complementary positioning means narrowing it toward
what no code index can derive: product intent, surface ownership, which areas map
to which knowledge sources. The mechanical inventory should come from a scanner
(Phase 3) or, later, from an external index consumed as an Extension.

That also makes a code-intelligence integration a better Phase-3 proof for the
extensibility RFC than the Vercel-deploy or RN-preview candidates: it exercises
the full contract — section, data schema, config, skill, check — against
something real, at arm's length via MCP.

## Deliberately not borrowed

`distill` (wrong lane), the SQLite index (contradicts spec §11 — git is the
shared DB, and Synclair's data volume is small), and code-health / dead-code /
change-risk scoring (out of lane; integrate rather than rebuild).

## Testing before any clone adopts this

1. `npm run measure:agent-cost --compare` in a **populated** clone — the mother
   repo's blank seed understates everything.
2. `npm run mcp:probe` — all 7 tools return without error.
3. `npm run mcp:install --print` in both topologies — verify the path shape.
4. Boot the reference hub and click every section: **nothing may look different.**
   Phases 0–2 add files and a config entry; they change no existing behaviour.
