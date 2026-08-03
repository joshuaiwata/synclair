# Foundation integrity — plan

**Status: all eight mechanisms BUILT, wired into the UI, and validated against
two real hosts.** The only thing left is adoption, not code — see *What remains*. The watcher-vs-embedded question is
settled in [`setup-modes.md`](setup-modes.md): embedded is the recommendation,
watcher is deprecated but supported.
Third in the series:
[`extensibility.md`](extensibility.md) draws the Core/Extension line,
[`agent-interface.md`](agent-interface.md) covers how Synclair's knowledge
*reaches* agents, this one covers whether what it says is **true, scoped, scored
and delivered** — across every artifact, not one layer.

Prompted by a second audit of [repowise](https://github.com/repowise-dev/repowise).
Same terms as the first: it is AGPL, Synclair is GPL-3.0-or-later and served over
a network, so **no code is taken — only methods**. Complementary, not competing:
its lane is code truth, ours is design and product truth.

This is written as **mechanisms**, not features. Every item below is cross-cutting
— it lands once and every artifact benefits. The first draft of this plan made the
opposite mistake, applying all of it to the knowledge layer alone.

---

## What you get, in plain language

*For anyone deciding whether this is worth doing. No file paths, no jargon.*

### Where the hub is weak today

Synclair records a lot about your product: what components exist, what screens
exist, what the system is made of, what the specs say, how things should be
documented. Each of those is checked for staleness on its own. That leaves four
blind spots, and they compound:

1. **Nothing knows what depends on what.** Change a button component and the hub
   won't tell you that six screens render it, three documents describe it, and two
   of those descriptions are now wrong. Each artifact checks only itself, so a
   single change quietly invalidates things nobody thinks to look at.
2. **Everything reads as equally certain.** A fact a script derived five minutes
   ago and a sentence a person wrote eight months ago look identical on the page.
   The hub actually records the difference internally — it just never shows it. So
   readers can't tell what to trust, and treat all of it with the same mild
   suspicion.
3. **Decisions have nowhere to live.** The rulings that matter most — *we're not
   using that pattern*, *this surface stays isolated*, *approvals work this way* —
   get made in conversations and scattered across notes. They aren't attached to
   the code they govern, so the next person (or assistant) rediscovers or breaks
   them.
4. **Nobody is told anything.** The hub knows what's stale and what's missing, but
   only if a person remembers to go and ask. Knowledge nobody loads is the same as
   no knowledge.

### What changes

**Change one thing, see everything it affects.** The hub gets a single map of how
its pieces connect — component to screen, screen to spec, document to source. Then
staleness travels: edit a component and the six screens, three docs and two specs
that depend on it are flagged automatically. The same map answers *"what does this
pull request actually affect?"* before it merges.

**You can see how sure the hub is.** Every fact gets marked as derived (a script
computed it, and it's re-computable), authored (a person wrote it), or unverified
(it claims something we can no longer confirm). Nothing is deleted for being
uncertain — it's *labelled*. Readers stop having to guess.

**Decisions get a home, attached to the code they govern.** A standing rulings
record: what was decided, why, which files it applies to, and whether it still
holds. A ruling that's been quietly contradicted by the code shows up as
contradicted rather than sitting there looking authoritative. And when someone
edits a file a ruling governs, they're told — at that moment, not in a review
three days later.

**Statements have to show their work.** Generated summaries and documents cite the
exact passage each claim came from. When that passage changes or vanishes, the
claim is flagged — instead of remaining fluent and wrong.

**Specs can live in your repo and stay watched.** Teams keep asking to keep PRDs
in the project repo rather than Drive or Notion. That's the *most* reliable
arrangement, not a compromise: a file in your repo can be verified perfectly,
every time, with no login and no network. Today around half your sources can't be
checked at all. And "stale" becomes specific — *section 4 and section 7 changed,
the other nine didn't* — which turns a re-read into a two-line confirmation.

**Everything reaches your assistants without being asked.** At the start of a
session and at the moment of an edit, the relevant state — what's stale, what's
missing, which rulings apply here — is put in front of whoever is working. Upkeep
stops being a scheduled chore and gets absorbed into work already happening.

**You can finally see the join between screens and backend.** Nothing today
connects what the screens do to what the API offers. Adding that link answers
questions nobody can answer now: if we change this endpoint, which screens break?
Which endpoints does no screen use any more? Which screens call something the
backend doesn't provide (usually a real bug)? Does the prototype talk to the real
backend or to mocks?

**One honest read of the hub's own condition.** A single derived summary of how
much of what Synclair claims is anchored, verified and covered — computed, not
written, so it can't flatter itself.

### On speed and cost

Two different things get called "performance", so to be exact:

**Assistant efficiency is already measured and already good.** Earlier work took a
populated real clone from 142,266 tokens to 11,643 for the same five questions — a
92% reduction. That's banked; this plan doesn't chase it again.

**What this improves is the cost of upkeep** — people's time and model spend:

| | Today | After |
|---|---|---|
| A component changes | Nothing tells you what else is now wrong | Affected screens, docs and specs flagged |
| One paragraph changes in a spec | Re-read the whole document | Review the changed sections |
| Noticing anything went stale | Someone remembers to check | Told automatically, at the right moment |
| Judging whether to trust a page | No signal at all | Derived / authored / unverified, visible |
| A decision made in conversation | Lost, or buried in notes | Attached to the files it governs |
| "What does this PR affect?" | Read the diff and guess | Computed from the same map |
| "What breaks if we change this API?" | Unanswerable | Answered |

**A deliberate note on claims.** This plan's predecessor reported 86–97% on its
first measurement and the truth was 40% — it had to be corrected in public. So no
percentage here is asserted until the existing harness produces it. The table
describes what becomes *possible*, not how much faster it is.

### What deliberately does not change

No script will ever write the parts that need judgment — what a screen is for,
what a decision means, whether a new spec supersedes an old one. Everything here
makes those moments **smaller, better-targeted and better-timed**. It does not
automate them away, because a script that tried would produce confident fiction,
which is worse than an admitted gap.

---

## Prime directive (inherited)

**Additive, all-on, reversible.** Every mechanism is a no-op for an existing clone
until a human opts in. Nothing ships until proven inert against the reference
clones. Three rules this plan adds, because all of it touches *existing* data:

- **Absent input yields `unanchored`, never `stale`.** Data written before a field
  existed must never resolve to a finding. This is what made Phase 1's provenance
  adoption safe and it is non-negotiable throughout.
- **Prose survives every rescan.** Phase 3a's rule generalises: a refresh that
  destroys written work is a refresh nobody runs. Every acceptance test below
  proves it by seeding prose and re-running.
- **Detect, then report. Never auto-apply to a reviewed artifact.** The
  `draft:host-catalog` restraint is the house rule: a mechanical pass yields
  *candidates*, and candidates are not facts.

## Correcting the record

Two stale statements found while planning, both load-bearing, both now fixed:

- [`agent-interface.md`](agent-interface.md) opened *"phases 0–2 BUILT, 3–5
  planned"* while its own body marks 3, 4 and 5 ✅ BUILT.
- [`scripts/refresh.mjs`](../scripts/refresh.mjs) said the agent auto-sync "was
  retired." It's live — it was **narrowed** to fire on PR open/reopen/
  ready-for-review, gated on an `ANTHROPIC_API_KEY` secret.

Knowledge decay inside the files that explain knowledge decay. The argument for
this plan in miniature.

## What we already do better (protect these)

- **The facts/judgment split** in `refresh.mjs` is sharper than repowise's. Their
  page generator *proposes decisions it inferred while writing a page*, which is
  exactly why they need a grounding gate. Avoiding the failure class beats
  policing it — at a real cost in coverage.
- **Five distinct non-answers** (`unanchored`, `absent`, `never`, `unverifiable`,
  `unreachable`), and blank reported as blank, never counted as zero.
- **The hook that only reports.** Theirs runs a model after every commit. Ours
  marks stale and stops. Keep it.
- **Derivation is further along than the last scorecard credited.** `scan:pages`,
  `scan:system`, `draft:host-catalog` and `scan:ux-coverage` all derive facts
  today. The gap is not "we don't derive" — it's that nothing **connects**,
  **scores** or **delivers** what they produce.

---

# The mechanisms

Three foundations, then five things they unlock.

## M1 — One dependency graph ✅ BUILT *foundation*

**The problem.** Six checks each answer "has *my* artifact drifted." None answers
"what else did that change invalidate." Yet the edges already exist and are
already used for something else: `pages-map` holds component→page, and
`rank:hygiene` already walks them to rank findings by page reach.

**The mechanism.** Consolidate the edges the hub already has into one queryable
graph: component→page, component→block/template, item→docs, artifact→source
files, knowledge source→area, and (with M6) screen→endpoint. Then two things fall
out of it for free:

- **Cascade.** Staleness travels one hop. Change a component, and its docs, the
  blocks composing it and the pages rendering it are flagged. Repowise's core
  move, and the reason their updates cost 3–10 pages instead of a full rebuild.
- **Blast radius.** *"What does this PR affect?"* — computed, not guessed. This
  enriches the existing PR gate comment rather than adding a new surface.

**Bounded on purpose.** One hop, with a budget, and **reach unknown sorts above
proven-zero and says why** — the `rank:hygiene` rule. A cascade that fans out
without limit reports everything and therefore nothing.

**Acceptance**
- Blank seed: empty graph, zero findings, exit 0.
- Cascade is reproducible — same inputs, identical output, no ordering nondeterminism.
- Against the real clone: a known component edit flags exactly the pages that render it, verified by hand against `pages-map`.
- Existing per-artifact checks keep their current output byte-identically; the graph is additive.

### What shipped

`scripts/lib/edges.mjs` (the graph) and `npm run impact` (blast radius), with 15
hermetic checks in `npm run check:edges`, part of `verify-ui`. On the reference
clone the graph assembles **410 files, 173 items, 50 pages** from artifacts that
already existed — no new derivation, no model, no network.

Working answer: changing `apps/prototype/src/components/<product>-ui/primitives.tsx`
reports **7 catalog items and 50 screens**, because that file is a barrel holding
seven components. Nothing in the hub could answer that before.

**The hard part was never the graph, it was the paths.** Three artifacts record
them against three different bases — `pages-map.sourceFiles` against `repo.root`,
`external-catalog.hostPath` against that item's host root (found by matching
`item.surface` to `hosts[].surface`), and `usage.files` against the product repo.
Getting one wrong doesn't yield a wrong graph, it yields an **empty** one that
reports "nothing affected" and reads exactly like a clean change. That happened:
`usage.files` were resolved against the hub, producing `synclair/apps/...`, and
every component came back used nowhere. The self-test was then verified by
reintroducing the bug and confirming it fails — a regression test that cannot
fail is decoration.

Two honesty rules carried over rather than reinvented: an item whose surface no
host declares gets **no edge** (a guessed base points at a file that doesn't
exist), and an item whose surface the pages map doesn't cover reports **reach
unknown**, which sorts above proven-zero and says why. A shared component
consumed by two unmapped frontends must never read as "affects no screens".

Still to do here: feeding cascade into `check:freshness` so staleness travels the
graph, and into the PR gate's comment.

## M2 — Confidence, made visible ✅ BUILT *foundation*

**The problem.** `provenance.ts` defines `generator` and `confidence`. Three
scanners set them. **Nothing in the UI reads them.** Phase 1 built the vocabulary,
Phase 3 populated it partly, and the reader still can't tell a derived fact from
an eight-month-old sentence. Phase 3 explicitly noted the `generator` field is
"what lets the hub distinguish derived facts from written judgment once this
lands" — it hasn't landed.

**The mechanism.** Wire it through. Every artifact sets `generator` and
`confidence`; every view surfaces it in one consistent treatment (a `doc-quality`
concern, so it looks like one system rather than six badges). Confidence is
**derived from state, never declared**: facts hash-verified and re-derivable rank
above authored prose, which ranks above claims that can no longer be checked.

**Non-negotiable:** nothing is hidden or deleted for low confidence. It is
labelled. This is where we deliberately diverge from repowise, which clears
ungrounded fields — reporting fits a hub a human reads.

**Acceptance**
- Artifacts with no provenance render exactly as today, no badge, no warning.
- Confidence is recomputed from disk, never read from a stored flag someone forgot to update.
- One visual treatment across every section; reviewed against `doc-quality`.

## M3 — Anchors and grounding ✅ BUILT *foundation*

**The problem.** Freshness answers *"did the file move?"* Nothing answers *"is
this sentence still supported?"* Any authored artifact — digests, UX docs, System
Map prose, summaries, references — can be perfectly fresh and wrong.

**The mechanism.** An authored artifact may carry anchors: source path, section,
hash of the passage a claim came from. Written by the agent as it writes — near-
zero marginal cost then, free to verify forever. Verification is pure string work:
no model, no network. Adopt the audited three-way verdict: `exact`, `fuzzy`
(paraphrase or reflow), `unverified`.

Feeds M2 directly: an unverified claim is the clearest confidence signal there is.

**Acceptance**
- No anchors → `unanchored`. Never `stale`, never an error. This is the entire clone-safety story for M3.
- Reflow a passage without changing meaning → `fuzzy`, not `unverified`.
- Delete a passage → `unverified`; the artifact still renders and the hub does not break.
- `verify-ui` exit behaviour unchanged until wired in a separate, explicit change.

---

## M4 — Delivery ✅ BUILT

*Cheapest item here and the biggest practical gain. A basic version ships alone,
today.*

**The problem.** `refresh --check` already produces an accurate pending list.
Nothing carries it to anyone. There are **no `.claude/settings.json` hooks in this
repo at all**. Our knowledge waits to be asked for.

**The mechanism.** Two injection points, no model call and no network in either —
they shell existing scripts and format the output.

- **Session start.** The whole pending state: stale artifacts, uncatalogued
  components, UX-doc debt, knowledge gaps, and (with M5) the rulings relevant to
  this session. Hard token cap, relevance-ranked via M1, and **silent when clean**
  — a hook that prints every session gets uninstalled.
- **Edit time.** Editing a file that an artifact describes or a ruling governs
  gets one line, rate-limited per session. Inherits the `components/**`
  `PostToolUse` item already queued at the end of Phase 5.

**Opt-in installer** — `npm run install:agent-hooks`, marker-delimited, `--remove`
restores byte-identically. Writes the **repo's** config, never the user's global:
the same line `mcp:install` draws, for the same reason.

**Acceptance**
- Clean clone: session start emits **zero bytes**, verified by byte count.
- Blank seed: zero bytes (nothing generated is not a finding).
- `measure:agent-cost` before/after: ambient delta 0 when clean.
- Install → `--remove` → settings file byte-identical.
- An unrelated existing hook still fires after install and after removal.
- Never installed by `postinstall`.

### What shipped

`scripts/agent-brief.mjs` (`npm run brief`) and `scripts/install-agent-hooks.mjs`
(`npm run install:agent-hooks`). 23 acceptance checks pass, and the whole cycle —
install, run from the host root, remove — was exercised against the reference
clone's real, content-rich `.claude/settings.json` and came back byte-identical.

Measured on that clone: **90ms, 236 characters (~59 tokens)** for three real
findings. Embedded topology writes a repo-relative path, so the hook is
committable and arrives on clone.

**The finding that changed the design.** The first version reported UX-doc debt
for every item, and went off immediately on the mother repo — five stale docs,
all of them the hub's own skin. Those ship *with* Synclair and sync from
upstream, so every clone would inherit them and every session in every clone
would open with a line about work nobody in that repo can do. Debt is now scoped
by `meta.layer`: the brief reports what the project owns, `refresh --check` still
reports everything for whoever maintains the foundation. `check:ux-docs` gained
`--json` (additive; its human output is untouched) to carry the layer.

Topology resolution moved to `scripts/lib/topology.mjs`, shared with
`mcp-install` — extracted at the second copy, as `host-walk.mjs` was, and
verified byte-identical against a captured baseline.

## M5 — The rulings layer ✅ BUILT

**The problem.** The decisions that most need to survive — *this surface stays
isolated pending design review*, *work off `staging`*, *controls never share the
container background* — live in chat, in `memory/`, and in people's heads. They
aren't attached to the code they govern, so they're rediscovered or broken. There
are product rulings sitting unresolved in project memory right now with nowhere to
land.

**The mechanism.** A rulings artifact, deliberately narrower than repowise's
eight-source extraction: **capture is explicit or from in-repo markers only** — a
person records one, or a conventional comment marker declares one. No git
archaeology, no PR mining, and no session transcript mining (see *Not borrowed*).

What we do take is everything *after* capture, which is the valuable half:
- **Governance links** — a ruling names the files it governs, so M4 can surface it at edit time. This is the moment that matters: right before the code is written.
- **Staleness** — a ruling whose governed files have moved on, or which a later change contradicts, is marked. Guidance that stopped being true stops being pushed.
- **Lineage** — `supersedes` / `refines` / `conflicts_with`, chaining so *"why is auth like this"* answers with a history rather than three disconnected records. Two active rulings that contradict each other is a finding.

**Detection proposes; a human confirms.** No relation is ever auto-applied at any
confidence. Dismissals leave a tombstone so a rescan never re-proposes them.

**Acceptance**
- Blank seed: no rulings, no chrome, no findings.
- A dismissed proposal survives a full rescan without reappearing.
- A confirmed ruling is never walked back to proposed by a later scan.
- Edit-time notice fires at most once per session per ruling.

## M6 — The seam ✅ BUILT

*The one genuinely new artifact, and the most self-maintaining thing we'd own.*

**The problem.** Nothing connects `pages-map` (screens → components) to
`system-map` (the API). Synclair is the only tool holding both halves.

**Positioning check.** [`agent-interface.md`](agent-interface.md) concluded the
System Map should narrow toward what no code index can derive. This respects that:
the provider half is mechanical and could later be delegated to an external index
via the Extension contract; the **seam** cannot be, because no code index has a
pages map.

**The mechanism.**
- **Providers: mostly already built.** `scan-system.mjs` derives endpoints from NestJS decorators and Next `route.ts`. Reuse it.
- **Consumers.** Scan call sites (`fetch`, `axios`, tRPC, react-query). Surface attribution is free — a call site sits under a `Surface.root`, exactly how the catalog attributes items.
- **Matching + diagnostics.** Match on full path with router prefixes stitched on. Publish *why* a match failed (`no_provider`, `internal_only`, `external_host`) rather than dropping unmatched calls. Edges carry `exact` vs `candidate`, never blended.
- **Views — a join, not a new section.** `/synclair/system`'s API section gains *consumed by N screens* and the unmatched buckets; `/synclair/pages` routes gain *calls N endpoints*. **Global-first, surface as a filter** — a per-surface page would make every endpoint look orphaned from a surface that doesn't call it, the same failure as the shared-adoption coverage bug one level up, and with worse consequences: it would advise deleting a live endpoint.

**Acceptance**
- Blank seed: artifact absent → both views render empty states, no errors.
- Against the real clone: diff derived endpoints against the authored `api[]`. **Facts must match or improve; only prose may differ** — the Phase-3a criterion.
- Every unmatched consumer carries a reason; an unexplained drop is a bug.
- Single-surface project: no surface chrome anywhere (`isMultiSurface()` gate).

## M7 — Local sources and scoped staleness ✅ BUILT

*The users' request, now one consumer of M1 and M3 rather than the whole plan.*

**The problem.** [`check-knowledge.mjs`](../scripts/check-knowledge.mjs) scopes
itself to sources that link *out*, reasoning that an in-repo entry has no
upstream. Right for a **digest**, wrong for a **raw spec committed in the product
repo**, whose upstream is the file itself — and which is the only source we can
verify perfectly. Today Drive and Notion sources can't be probed at all.

**The mechanism.**
- **Local probe adapter.** Optional `path` on `KnowledgeSource`; probe by git last-commit date plus content hash. The hash decides staleness so reformatting raises no false alarm; the date is for display.
- **Section-level hashing.** Split on heading boundaries, hash each. `stale` then names the sections that moved and carries the diff — turning a re-distill into an addendum apply. This is the item that changes how the work *feels*.
- **Discovery sweep.** Sweep conventional doc locations, diff against the manifest, report unregistered documents with a drafted entry (title from first heading, kind from directory). `area` left null — that's judgment. **Reports; never writes the manifest.**

**Acceptance**
- Clone with no local sources: `freshness.json` byte-identical before/after.
- Blank seed: discovery finds nothing, exits 0.
- Edit one section of a distilled local spec → exactly that section reports stale.
- Reformat the file without changing wording → **no** finding.
- Delete the file → `unreachable`, not a crash and not `fresh`.
- Both topologies: embedded resolves against repo root, watcher against host root.

### What shipped

`scripts/lib/local-source.mjs`, wired into `check:knowledge`, plus
`--discover`. `path` is a new optional field on `KnowledgeSource`; a `url`
pointing at a blob in this repo infers the same thing, so **existing entries need
no edit**. Section drift comes from git — `distilledAt` plus history already says
what the file looked like when the digest was written, so it needs no new
bookkeeping and no agent cooperation. Git is the shared DB (spec §11).

38 integration checks against the reference clone, plus **29 hermetic checks in
`npm run check:knowledge-local`**, now part of `verify-ui`. The hermetic test
builds its own throwaway repo with explicit commit timestamps, so it runs in any
clone with no network and no fixture.

What it found on the reference clone: **7 real PRDs in `.prds/` that the manifest
never mentioned** — the team had already done what the users asked for, and the
hub could not see it. A queue entry now reads `changed "Problem Statement"
(46 untouched, vs a0a63de4)` instead of "re-distill this document".

### Four defects the real data caught

Each is now a case in the self-test. All four were quiet-wrong-answer bugs, which
is the failure mode this mechanism must not have:

1. **An SSH host alias disabled it entirely.** The slug matcher required literal
   `github.com`; this machine's remote is `git@github-work:…`, and `insteadOf`
   rewrites do the same thing invisibly. Local detection silently no-opped on
   exactly the multi-account setups most likely to have several repos in play.
   It now reads every remote and requires only that the host *look* like GitHub.
2. **Two commits in the same second made an edit vanish.** `--before` is
   inclusive, so it picked the newer commit and concluded nothing had changed.
   The bound is now strict, and ambiguity resolves to `stale`: a false `stale`
   costs someone a glance, a false `fresh` costs them the belief that the hub is
   worth reading.
3. **YAML frontmatter using `#` group labels** titled all seven PRDs "Document
   Identity" and inflated every section count. Frontmatter is now one clearly
   labelled pseudo-section, and its delimiters tolerate trailing whitespace — so
   a formatter run can't make a document's frontmatter vanish and promote every
   label to a heading.
4. **`localPath: null, sections: null` on every remote source** added ~70 lines
   of diff to a committed cache in clones with no local sources at all. Omitted
   when absent — the same discipline as `unanchored`.

Whitespace is normalised before hashing (trailing spaces, blank-line runs), so a
prettier pass across the repo doesn't flag every section of every spec. It cannot
hide a wording change.

### Proof of inertness

On a clone with no local sources, the new script's output is **byte-identical**
to the pristine one it replaces. On a blank seed it reports the manifest is empty
and writes nothing new.

## M8 — Derived health rollup ✅ BUILT

**The problem.** `/synclair/reports` is agent-written — a considered read, but it
can't be recomputed, so it ages like everything else it describes. There's no
cheap, honest answer to *"what condition is the hub in right now."*

**The mechanism.** One deterministic rollup over M1–M3's output: how much of what
the hub claims is anchored, verified, covered, and delivered. No model, no
network, so it can run on a hook. It **complements** the written report rather
than replacing it — the numbers become derived, the interpretation stays authored.

**Acceptance**
- Blank seed reports `blank`, never `0%` — the rule that has held since Phase 0.
- Recomputable: two runs on unchanged input are byte-identical.
- Contributes no new failure to `verify-ui`.

---

## Sequencing

| | Ships alone? | Depends on |
|---|---|---|
| **M4** Delivery (basic) ✅ | **yes** | nothing — `refresh --check` already works |
| **M7** Local sources ✅ | **yes** | nothing; better with M1, M3 |
| **M6** Seam | **yes** | reuses `scan-system` |
| **M2** Confidence | **yes** | fields already exist; better with M3 |
| **M1** Graph ✅ | yes | nothing |
| **M3** Anchors ✅ | yes | — |
| **M5** Rulings ✅ | no | M1 (governance), M3 (evidence), M4 (delivery) |
| **M8** Rollup ✅ | no | M1–M3 |

**Recommended order: M4 → M7 → M1 → M2 → M3 → M6 → M5 → M8.** The first two are
done; M1 is next.

### How these were validated, and how to repeat it

Against a throwaway cut of **a reference monorepo** — embedded hub, 34
knowledge sources, 13 apps, 7 in-repo PRDs. The source repo was never modified:
the cut fetches `refs/remotes/origin/design` by full ref name into a fresh
`git init`, which needs no worktree on the source and no network. Every fix was
re-tested on a **freshly re-cut clone**, not a patched one, because a clone that
has already run the harness is no longer pristine — that bit once, when discovery
reported 6 PRDs instead of 7 because an earlier test had deleted one.

Two things a repeat run must keep: overlay the working tree against `main`
(not `main...HEAD` — the work under test is uncommitted, and a merge-base diff
silently overlays nothing and "passes" against pristine code), and never overlay
`data/`, which is per-clone seed.

M4 and M7 first because they're small, independent, and between them close the
delivery gap and the users' request — most of the felt value. M1 next because
every remaining mechanism gets better once the edges exist. M6 can run in parallel
with any of it; it touches nothing the others touch.

## Testing before any clone adopts this

Extends the list in [`agent-interface.md`](agent-interface.md):

1. **Mother repo, blank seed.** Every mechanism emits nothing and exits 0. A finding in a fresh clone is a bug, not a feature.
2. **Reference clone, in a throwaway copy.** a reference clone copied to scratch; the original never modified — the guardrail `extensibility.md` specifies and Phase 3 already followed.
3. **Both topologies** for anything path-resolving.
4. **Prose-survival test per generator.** Seed authored prose, re-run, diff. Any loss fails the mechanism.
5. **Byte-identical no-op.** A clone that doesn't opt in has identical data files before and after.
6. **Removal test.** Every installer's `--remove` restores the original byte for byte.
7. **Determinism test.** Anything graph- or cascade-derived produces identical output on repeat runs.
8. **Click every hub section.** Nothing may look different until a mechanism's UI lands, and then only there.
9. `measure:agent-cost --compare` on a populated clone — and **publish the real number, including if it's bad.** Phase 2 caught three defects that way, including its own inflated arithmetic.

## Deliberately not borrowed

Unchanged from the first audit: `distill` (wrong lane), the SQLite index
(contradicts spec §11 — git is the shared DB, and our data volume is small), and
code-health / dead-code / change-risk defect scoring (out of lane — integrate
rather than rebuild; M1's blast radius is the in-lane subset).

Added here: **session-transcript mining.** repowise mines local agent transcripts
for decisions and promotes them on observation counts. The method is sound and
tempting — it would fill M5 automatically — but reading a developer's transcripts
is a privacy and astonishment surface far larger than anything else in this plan.
Revisit only as an explicit opt-in Extension, never as foundation behaviour.

---

## Validation: two real hosts, eight degraded scenarios

Everything above was built and re-tested against **freshly re-cut** clones, never
patched ones — a clone that has already run a harness is no longer pristine, and
that bit once when discovery reported 6 PRDs instead of 7 because an earlier test
had deleted one.

**Host A — a reference monorepo.** Embedded hub, 6 NestJS APIs, 3 web
apps, 34 knowledge sources, 7 in-repo PRDs, 144 catalog items, 51 pages.

**Host B — `a second reference clone`.** Embedded hub, single Next app, 62 API routes, 36
catalog items. A completely different shape, and the one that broke two
assumptions Host A had validated happily.

The stress suite (`scratchpad/stress.mjs`, 106 checks) covers: blank seed;
populated embedded clone; a synthesized **watcher** pair (deprecated still has to
mean supported); every data cache corrupted in turn; every data cache deleted in
turn; no git repository at all; a read-only cursor directory; and three repeat
runs proving no churn in tracked files.

### The nine defects real data caught

Ordered by how quietly they would have failed:

| # | Defect | Why it was invisible |
|---|---|---|
| 1 | `scan:contracts --json` truncated at exactly 8192 bytes | `process.exit()` drops buffered stdout; the reply *looked* like output |
| 2 | 35 live endpoints reported as "unused" on Host B | calls went through a bare helper the scanner didn't read |
| 3 | Single-app repos produced **zero** seam links | a link required different workspace apps; a screen calling its own API is the commonest seam there is |
| 4 | 75 of 80 endpoints "unused" on Host A | only literal `fetch` URLs were read |
| 5 | SSH host alias disabled local-source detection entirely | matcher required literal `github.com`; this machine uses `github-work` |
| 6 | Two commits in the same second made an edit vanish | inclusive `--before` picked the newer commit |
| 7 | `usage.files` resolved against the wrong base | produced `synclair/apps/…`; every component read as used nowhere |
| 8 | YAML frontmatter titled seven PRDs "Document Identity" | `#` group labels inside `---` parsed as headings |
| 9 | Foundation UX-doc debt would fire in every clone forever | it ships with Synclair and no product team can fix it |

Every one is now a case in a hermetic check that runs in `verify-ui`.

### The threshold lesson

Defect 2 is the one worth remembering. The gate meant to prevent exactly it —
"don't claim endpoints are unused if too many look unused" — was set at 60% by
eye, and the real repo landed at **56%**. Every one of those 35 endpoints was
called. The threshold is now 0.35, and the wording changed from "unused" to
"no caller found — CANDIDATES, verify before acting", because **a static scan
cannot prove absence**. A suppressed finding costs a feature; a false one costs a
live endpoint.

## What remains

Nothing in the foundation. What is left is **adoption in product repos**:

- **Rulings have no input.** The reference monorepo has zero `RULING:` markers
  and zero ADRs. M5 works and reaches an agent at edit time, but only once a team
  writes decisions where they apply. Seeding the ones already in project memory
  is the highest-value follow-up.
- **Digests carry no anchors yet.** `check:anchors` verifies claims, and every
  existing digest is `unanchored` until someone cites a passage. `--update`
  records the hashes once the citations exist.
- **`scan:contracts` must be run and committed per clone** for the seam views to
  populate; they render exactly as before without it.

---

## M3 as built

`scripts/lib/anchors.mjs` + `npm run check:anchors`, with 30 hermetic checks in
`check:anchors-selftest` (part of `verify-ui`).

A digest may cite the passages it was written from, in its frontmatter:

```yaml
anchors:
  - source: .prds/Billing_PRD.md
    section: Pricing
    quote: 'Seats are billed monthly in arrears'
```

`--update` records the hash; verification re-reads the source and returns
`exact` / `fuzzy` / `unverified`. No model, no network, no git.

**The quote is what makes this a grounding gate.** A hash only says the passage
changed; it cannot say whether what the claim *rested on* survived. Proven
end-to-end: a real PRD section was reversed to "this area was removed from the
product entirely" and the claim flipped to `unverified`, while a pure reword
stays `fuzzy`.

**Two defects, both caught by testing:**

1. **Jaccard was the wrong measure.** A one-line quote inside a ten-line section
   scored 0.40 even with every word present, purely because the section says
   more — so a plain rewording read as a reversal. It is now *containment*: what
   fraction of the quote's words are still there. The limit is stated in the code
   — this measures **presence, not meaning**, so `fuzzy` means "a human should
   glance", never "this is fine".
2. **`reanchor` ate a newline**, fusing the inserted hash onto the next line
   (`hash: <sha>quote: '...'`). That parsed as a hash with no quote and silently
   *downgraded a verified claim to unverified*. The self-test had missed it by
   counting `hash:` occurrences instead of re-parsing; it now re-parses and
   re-verifies.

`unverified` is reported, never deleted. The audited implementation clears an
ungrounded field outright — right for a machine-read index, wrong for a hub a
human reads, where a claim that quietly vanishes is less recoverable than one
labelled "we can no longer confirm this".

---

## M5 as built

`scripts/lib/rulings.mjs` + `npm run check:rulings`, 23 hermetic checks, and the
delivery path wired into `agent-brief`.

Capture is deliberately two sources — an explicit `RULING:` / `DECISION:` / `WHY:`
comment, or an ADR-style document — both things a human wrote down on purpose.
No git archaeology, no PR mining, and no transcript mining. What we took from the
audit is everything *after* capture: governance links, state, and delivery.

**The delivery moment is the whole point.** Proven end-to-end: a ruling written
in `primitives.tsx` — *"this surface stays isolated pending design review"* —
reaches the next session that edits that file, quoted in full rather than as a
pointer to a register nobody opens mid-task.

**One deliberate divergence.** The audited staleness score grows with commit
count and file age, which answers "has this area been busy" as a proxy for "is
this rule wrong". A rule nobody has broken must not fade out for living in a
popular file, so a ruling stays `current` until its subject is deleted or a human
retires it.

**Honest finding: the mechanism has no input yet.** Scanning the reference
monorepo found **zero** markers and zero ADRs — verified as a true zero by
grepping independently, because "scanner returns nothing" has been wrong twice
already in this plan. M5's value is entirely gated on adoption; the seeding path
(turning the rulings that already live in project memory into in-repo markers) is
the follow-up that makes it worth anything.

---

## The UI halves, as built

**M1's cascade.** `check:freshness` now walks stale sources one hop through the
edge graph. Two things had to be fixed for it to mean anything. The checks
returned *counts*, not the files that drifted, so the walk traversed nothing —
the same blind-scanner failure that reported 75 endpoints unused. And the pages
map already cascades **by construction** (each route hashes its whole source
closure), so reporting "the pages map drifted, which reaches 50 screens" was a
tautology. What the graph actually adds is **causation**, and that is what it now
says: *"50 of the stale routes drifted because 7 cataloged components changed."*

**M2's chip.** `/synclair/system` and `/synclair/pages` show where their facts
came from — `scan:pages · medium` for a derived map, **`unrecorded`** for one
written before the field existed. Not "authored": claiming a provenance we cannot
support is the exact failure the chip exists to fix. Confidence is quiet at
`high`, because a badge on every healthy page is wallpaper.

**M6's views.** The API table gains a *Called by* column, and each route's page
gains a *Calls N endpoints* section. The withheld-claim rule survives into the
UI: when the scan refused to assert unused endpoints, the cell reads a muted
**"not seen"** rather than "no caller found" — the emphatic version is what gets
a live endpoint deleted.

That work surfaced something nobody could see before: the authored `api[]` list
documents **25 of 80** endpoints found in the source. A list of 25 reads as *the*
API, not a quarter of it, so the page now says which it is.
