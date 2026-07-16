---
name: ux-first-pass
category: build
layer: foundation
description: Archetype-first UX process for building or revamping any UI — get to good on the first pass instead of theming your way there. Use whenever designing or restyling screens, views, components, or whole apps; when a UI "works but feels generic"; or before any visual overhaul. Structure before surface, reference products before pixels, adversarial review before presenting.
---

# UX First Pass

The owner of this machine is a full-time UX design engineer. Generic-but-competent output is a failure mode; the bar is "would a screenshot look intentional next to the top 3 reference products in its domain?" This skill encodes the process that reliably clears that bar.

## The core failure to avoid

**Theming is not UX.** Swapping fonts/colors/radii onto unchanged layouts produces "a skinned version of the same app." A real first pass changes what screens exist, what each is for, and how content is structured — then styles it. If your diff is only CSS variables and font stacks, you have not done the work.

## Process (in order — do not skip to step 4)

### 1. Frame & archetype
- State who uses this, for what job, in what context (desk power-user vs. mobile/field vs. client-facing).
- **Name 2–3 real reference products for the domain** (e.g., an art tool → Gagosian/Zwirner gallery sites; a data tool → Linear/Airtable). Propose them with one-line rationales, pick one, and commit. Every later decision must survive comparison against it.
- If the user has named an archetype or has a documented aesthetic, use it. Otherwise propose 3 and recommend one — don't ask permission to have taste.

### 2. Structure before surface
- Information architecture first: what are the screens, what is each screen's single primary action, what does the user see first?
- Apply the UX-laws checklist (typeui-fundamentals skill if installed; otherwise: recognition over recall, one primary action per surface, ≤5 choices in the critical path, visible progress/status, deep-linkable key screens, state preservation on back).
- Workflow tools get a status/pipeline surface with live counts, not just a list. Multi-stage things (deals, shortlists, orders) render grouped by stage so progress is visible.

### 3. System
- Semantic tokens only (`--bg`, `--ink`, `--muted`, `--line`, `--accent`); no raw hex in components.
- Type: one display face with real presence (oversized, tight-tracked at clamp scale), one neutral body face, optionally mono for labels/counts/tags (uppercase, wide tracking — the "wall label" move). Never default to a decorative serif for a contemporary product.
- Space: 4/8pt rhythm inside components; generous section rhythm (64–96px) between them. Tight = cheap; open = contemporary.
- One accent color, used sparingly. Structure comes from hairline rules + whitespace, not boxes.

### 4. Components
- **De-box bias**: content-first tiles (media with caption below, like a gallery wall label) beat bordered cards. Reserve boxed cards for genuinely interactive panels (forms, pickers).
- Media: lock aspect ratios (zero CLS), thumbnail pipeline for grids, full-res only in lightbox/detail. Preload + decode neighboring images on hover so in-place navigation is instant.
- Full state set per component: default/hover/focus-visible/active/disabled/loading/empty/error. Empty states say what to do next.
- Touch targets ≥44px; arrows/controls that appear on hover must be always-visible under `@media (hover: none)`.

### 5. Adversarial review (before presenting, not after)
- Screenshot the real running product (desktop + ~375px; dark and light if both exist; key interactive states).
- Judge against the archetype: "does this screenshot look intentional next to [reference]?" Fix the worst thing and re-shoot once.
- Screenshots can lie: a CDP/devtools capture can force a frame on a page that never painted for the user. Cross-check the console for errors and `performance.getEntriesByType('paint')` when a user reports blank/black but captures look fine.

## Hard-won engineering rules (violations have burned us)

- **No `backdrop-filter` on sticky/fixed elements** — intermittent full-page black composite on macOS Chromium. Use near-opaque backgrounds.
- **No import maps** — extension-injected scripts (SES/lockdown from wallet extensions) race them and break bare specifiers intermittently. Import by full URL.
- **Self-host critical-path scripts** (e.g., Tailwind Play runtime) — third-party CDNs hang and block page load.
- Google Fonts with `display=swap`; preconnect; don't chain render-blocking third parties.

## Companion skills

- `ui-ux-pro-max` (if installed): run `--design-system` and `--domain style/typography` searches for archetype-consistent specs — use it for structure and system inputs, not as a paint bucket.
- `typeui-fundamentals` (if installed): the 30 UX laws are the step-2 checklist and the review rubric.
