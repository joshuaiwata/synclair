# The core boundary — what `@synclair/core` owns

> Phase 3 of `docs/north-star.md`. This manifest IS the split: everything in
> the **core** column moves to `packages/core` and ships as a versioned
> package; everything in the **template** column stays vendored, editable,
> and committed per clone. The boundary was drawn by a month of adversarial
> hardening on a real clone — machinery bred nearly all the bugs and received
> ~none of the customization, so machinery gets versioned and the surface
> stays free.

## Core (`@synclair/core` — versioned, installed, fixed by version bump)

| Area | Files today |
|---|---|
| Artifact modules (the package's public API) | `lib/artifacts/*` — schemas, `scan()`, `read()` per artifact |
| Scanners & derivation | `scripts/scan-*.mjs`, `scripts/check-discovery.ts`, `scripts/resolve-page-items.mjs`, `scripts/index.mjs`, `scripts/refresh.mjs` |
| Checks & selftests | `scripts/check-*.mjs`, `scripts/check-*.ts` (registry, previews, pages, purity, reset-safe, form-defaults, anchors, rulings, artifacts, …) |
| The running-app harness | `scripts/smoke.mjs`, `scripts/audit-mcp.mjs`, `scripts/sim-fresh-clone.sh`, `scripts/sim-matrix.sh` |
| MCP server | `scripts/mcp-server.mjs`, `scripts/mcp-tools.mjs`, `scripts/extension-tools.mjs`, `scripts/mcp-install.mjs` |
| Lifecycle | `scripts/synclair-reset.sh`, `scripts/synclair-sync.sh`, `scripts/dev.mjs` (the watcher), `scripts/preview-server.sh` |
| Shared script libs | `scripts/lib/*` |
| Machinery-side system modules | `lib/system/*` READERS that pages consume (`pages-map`, `system-map`, `contracts`, `host-hygiene`, `knowledge/freshness`, `provenance`, `foundation-schema`, …) — exported as the package's read API |

## Template (vendored per clone — editable, committed, promoted by choice)

| Area | Files today |
|---|---|
| Hub pages & UI | `app/*`, `components/*` (incl. `components/ui`) |
| Seed | `lib/system/seed/*`, `lib/system/knowledge/sources.ts`, `lib/system/references.ts`, `app/globals.css` |
| Judgment & state | `data/*` (reports, handoffs, dashboard, setup, extensions, added sources) |
| Capabilities | `.claude/skills/*`, `.claude/agents/*` |
| Registry & docs | `registry.json`, `*.docs.tsx`, `docs/*` |
| Clone-local wiring | `middleware.ts` (the embed armor), `next.config.ts`, `data/dev-servers.json` |

## Boundary rules (enforced as the split lands)

1. Template code imports core ONLY through the artifact `read()` API and the
   published script entrypoints — never core internals.
2. Core imports nothing from the template. A core module needing template
   knowledge takes it as input (the hosts list, the seed paths).
3. The derived cache (`.synclair/cache/`) is core's working directory;
   `data/` belongs to the template.

## Sequencing (why the split waits for the promotion)

The mother sat at pre-Phase-0 (no battery) while the reference clone carried
a month of hardened machinery. By the north star's own lesson — no
refactoring without a harness — the split lands in three reviewed steps:

1. **Promote the hardened machinery + battery here** — DONE (merged).
2. **Move the core column into `packages/core`** — DONE (this branch):
   `scripts/` + `lib/artifacts/` live in the package, consumed via the npm
   workspace; the `synclair` CLI is the one entry point (`synclair index`,
   `synclair smoke`, `synclair audit-mcp`, …) and every npm-script name
   remains as an alias. One refinement to the table above: the
   `lib/system/*` domain readers stay in the TEMPLATE as its normalization
   layer over core's artifact `read()` API — the template owns how it
   renders; core owns the files and their contracts.
3. **This clone migrates first**: the reference clone consumes the package;
   a machinery fix reaches it by version bump alone. Publishing to npm
   (name: `@synclair/core`, public) is a one-liner once the npm account +
   `synclair` org exist — until then consumers vendor the package directory
   exactly as this repo does.
