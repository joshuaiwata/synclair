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

Mother repo, blank seed: **9 file reads / 17.8k tokens → 5 calls / 1.2k tokens**,
net **−15.8k** after the +854-token tool surface. Blank-seed figures understate
the real saving, which scales with populated data.

The harness also caught its own gap: the "what is this system made of" scenario
had no tool behind it, which is why `get_system` exists. That is the harness
doing its job.

---

## Phase 3 — scanner / prose split ⬜ PLANNED

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

**Acceptance per artifact:** regenerate it for platform-clairity with the new
scanner and diff against the agent-written version. Facts must match or improve;
only prose may differ.

The `generator` field from Phase 1 is what lets the hub distinguish derived facts
from written judgment once this lands.

## Phase 4 — riders ⬜ PLANNED

Cheap once the above exists:

- **Generated `AGENTS.md` block.** The "Where things live" table, between
  markers, deterministic, no LLM. It's the most drift-prone section of the first
  thing every agent reads. Repowise targets 150–250 lines on the grounds that
  bloated config files get ignored — a fair challenge to the router's length.
- **Blast-radius ranking.** Rank hygiene and Reports findings by how many pages
  consume the offending file, using the component→page edges already in
  `pages-map.json`. No dependency graph needed; makes "what to do next"
  defensible instead of count-driven.
- **Post-commit hook that marks stale, not one that regenerates.** Regeneration
  means an agent run until Phase 3 lands, which must not fire on every commit.
- **Consolidate `check:*` into `check:freshness`**, old names kept as wrappers.
  Deliberately last — it touches `verify-ui`.

## Phase 5 — registry convergence ⬜ PLANNED

**Settled: the `.claude-plugin` manifest is the Extension registry's declaration
layer, not a second system.** A plugin manifest declaring skills + agents + MCP
tools is most of what [`extensibility.md`](extensibility.md) says an Extension
must declare. Building them separately would mean maintaining two registries that
describe the same capabilities.

Consequences:

- **Hold `synclair#23` (`bridge-agents.mjs`) rather than merging it.** Copying
  ambient skills into `.claude/`, `.agents/`, and `.cursor/` and a plugin
  manifest are competing answers to the same problem. The copies drift; the
  manifest doesn't. The MCP server already removes the *data* half of what the
  bridge was for.
- Amend the extensibility RFC's open question on registry format before Phase 2's
  registration hardens.

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
