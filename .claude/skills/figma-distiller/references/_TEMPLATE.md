# <File name> › <Page name>

<!--
Per-PAGE digest. One file per Figma page: references/figma/<fileKey>/<page-slug>.md
Keep it decision-focused and tight — a screen-map an agent reads instead of opening
Figma. Link back to the raw page; never paste raw node dumps.
-->

- **File / page:** `<fileKey>` › `<pageNodeId>` — [open in Figma](https://www.figma.com/design/<fileKey>/_?node-id=<pageNodeId>)
- **Area:** <product-spec area> → [`references/<area>.md`](../../../product-spec/references/<area>.md)
- **Status:** WIP exploration | Final | Frozen — <one line: is this the current direction?>
- **Distilled:** <YYYY-MM-DD> · **Coverage:** drilled <N> of <M> top-level frames (see below)

## What this page is

One or two lines: the app section it covers and, if it's an exploration page,
which frames are the **chosen direction** vs. abandoned alternatives.

## Current direction (build from these)

The frames that represent where the design actually landed. For each:

- **<Frame name>** (`<nodeId>`, <W>×<H>) — what the screen is; the layout/regions
  (e.g. "three-pane: filters · ranked feed · preview+apply rail"); the
  design-system components visible (tie to `registry.json`). Drilled: screenshot / context / map-only.

## Other frames on the page (do NOT build from these)

Grouped, one line each — abandoned explorations, spikes, and old versions. Enough
that a builder knows they exist and why they're superseded, not more.

## As-built vs. the PRD

Where the design confirms, extends, or contradicts `references/<area>.md`. Flag
deviations with a one-line why. Durable ones get written back into that digest.

## Open questions / gaps

Anything the design leaves unresolved that a builder will have to decide or ask.
