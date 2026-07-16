---
name: figma-distiller
category: knowledge
layer: foundation
description: Distill a Figma design file into per-page knowledge digests — the visual counterpart to product-spec. Use when asked to "process / distill / add a Figma file (or page) to knowledge", when the Manifest surfaces an un-distilled page, or when build-view needs the design for a screen whose Figma page has no digest yet. Reads pages via REST + the Figma MCP through the figma-frame-reader digger; writes a screen-map digest per file › page.
---

# Figma distiller — turn a design file into per-page knowledge

Figma files are the heaviest source in the knowledge layer. This skill is the
**playbook** for compressing one into digests an agent can actually read — the
visual sibling of `product-spec` (which does the same for PRDs). The heavy reading
is done by the **`figma-frame-reader`** digger in its own context; this skill is the
method it (and you) follow, plus where the output lands.

## The one rule that shapes everything: altitude

A Figma file is a tree of thousands of nodes. You cannot read it whole.
Measured in practice: `get_metadata` on **one page** of a large product-design
file can return **400K+ characters** — just ids/names/types, no content — and
overflow the context window. So the method is **shallow-first, peel, drill
selectively** — never "read the page."

## The knowledge unit is a PAGE, not a file

Each Figma **page** is a massive section of the app, so distill and register **per
page**. One page → one `KnowledgeSource` (`kind: figma`, area-tagged) → one digest
at `references/figma/<fileKey>/<page-slug>.md`. The file is a light parent/index;
partial coverage (3 of 8 pages distilled) is a normal, visible state — not a lie.

## REST maps, MCP drills (don't mix these up)

- **Enumerate pages with the REST API**, never the MCP. The Figma MCP's page
  *listing* is partial — it only surfaces desktop-loaded pages (it can return 1
  of a file's 20 pages). REST sees them all:
  ```bash
  set -a && . ./.env && set +a   # FIGMA_TOKEN
  curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
    "https://api.figma.com/v1/files/<KEY>?depth=1" | \
    python3 -c "import sys,json;d=json.load(sys.stdin);[print(c['id'],c['name']) for c in d['document']['children']]"
  ```
- **Drill a page/frame with the MCP** (`get_metadata` for the frame tree,
  `get_screenshot` to see a frame, `get_design_context` for component detail).
  The MCP reads *any* page fine when handed its nodeId directly — the listing is
  the only weak spot. (Load the `mcp__…figma…__*` tools via ToolSearch if deferred;
  or fall back to REST `/files/:key/nodes?ids=` and `/images/:key?ids=`.)

## The pipeline (per page)

1. **Correlate first.** Read the manifest (`lib/system/knowledge/sources.ts`) and
   the matching `product-spec/references/<area>.md`. Page names usually map
   almost 1:1 to product areas. Load the area digest so you can annotate *what it
   is* against *what it should be*. Distillation without the PRD is just
   describing pixels.
2. **Peel.** `get_metadata` on the page can itself overflow → extract only its
   **top-level frames** (ids/names/sizes) from the saved output with `python`/`jq`.
   That list is the page's table of contents.
3. **Triage & drill.** Frame names are highly descriptive. Group them by intent
   (chosen direction vs. abandoned explorations, desktop vs. mobile, per flow).
   `get_screenshot` the few frames that represent the **current direction**;
   `get_design_context` only where you need the component makeup. Do **not** drill
   every frame.
4. **Distill** into the digest (shape in [`references/_TEMPLATE.md`](references/_TEMPLATE.md)).
5. **Register & write back.** Add/append the page as a `KnowledgeSource` and, when
   a frame reveals a durable as-built decision, fold it into the area's
   `product-spec` digest. That's the flywheel. When `get_design_context` on a
   frame surfaces component instances that correspond to our primitives or
   registry items, also append the name→code mapping to
   `lib/system/knowledge/figma-component-map.ts` (the repo-side Code Connect
   stand-in `build-view` resolves against).

## No silent caps

An exploration page can hold 30+ frames. Always record a **Coverage** line: which
frames you drilled vs. only mapped, and which are abandoned alternatives a builder
should *not* copy. A digest that silently sampled reads as complete when it isn't.

## When it runs (on-demand, two triggers)

- **Manual** — a **"Process"** button per file on the Manifest
  (`app/synclair/figma-manifest/`). The web app can't run the AI distillation itself,
  so a click **enqueues a request** in `data/knowledge/distill-queue.json`
  (`{ requests: [{ fileKey, fileName, requestedAt }] }`). **Draining the queue is
  this skill's job:** read that file, and for each request run `figma-frame-reader`
  on the file's pages, write the digests, register them (set `distilledAt`), then
  remove the request from the queue. The Manifest then shows the file as
  "Distilled · N"; a file edited after `distilledAt` shows "Changed since distill".
- **Agent-surfaced** — `build-view` detects the target screen maps to a page with
  no digest and offers to run `figma-frame-reader` inline, right when it's needed.

## Brain vs. seed

The **method** (this skill + the `figma-frame-reader` agent + the digest shape) is
**BRAIN** — foundation, shared by every clone. The resulting **digests** are
**SEED** — each project distills its own files. See the `synclair` skill before
promoting changes upstream.
