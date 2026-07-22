---
name: port-host-component
category: build
layer: foundation
description: Companion mode — promote a DOCUMENTED host component (an external catalog entry from existing-project intake) into a LIVE, registered component whose previews render inside a SCOPED product theme, so it shows the product's real look without restyling the neutral hub. Use when asked to "make the host components live", "port <Component> into the hub", "get live/branded components", or after intake when a read-only catalog entry should become first-class (interactive preview, registry, verify-ui protection). NOT for building brand-new components (component-library) and NOT for the read-only catalog itself (existing-project-intake).
---

# Port a host component → live, scoped-theme component

Existing-project intake catalogs host components as **documented, inert** entries
(screenshots/code, no live render). This skill promotes one to a **live** entry —
but companion mode keeps the **hub neutral**, so the port renders the product's
real look through a **scoped theme**, never by touching the hub.

**Two paths — always try the live import first** (docs/rendering-parity.md):

- **Path A — live import (default).** Render the host's **actual source** via the
  host-previews registry. No rewrite, no second implementation, nothing to drift:
  the preview IS the shipped component. Use whenever the compat gate passes.
- **Path B — rewrite port (fallback).** Re-express the component token-clean in
  this repo (the original flow below). Only when Path A's compat gate fails —
  a rewrite is a copy, and copies drift; don't create one without a reason.

## Path A — live import via the host-previews registry

1. **Compat gate.** The import must run inside the hub's build: client-safe (no
   server-only imports, no host env/secrets at module scope), dependencies the
   hub can resolve (embedded clones resolve the host's node_modules via parent
   lookup; watcher clones need the component's deps importable — check its
   import list), styling that survives outside the host (Tailwind classes render
   via the hub's Tailwind; host CSS-module/global-CSS dependencies usually fail
   honest). Fails any of these → Path B, or stay documented.
2. **One-time per clone:** add the alias `"@host/*": ["<host.root>/*"]` to the
   CLONE's tsconfig `paths` (never the mother repo's), pointing at the host root
   from `data/external-catalog.json`.
3. **Write the preview module** `components/host-previews/<name>.preview.tsx`:
   `"use client"`, import the component from `@host/…`, default-export a
   zero-prop wrapper rendering it with representative sample data (variants
   welcome). Then register it in `components/host-previews/registry.tsx`:
   `hostPreviews["<name>"] = { component: <Name>Preview, theme: "theme-<product>" }`
   (key `"<surface>:<name>"` on multi-surface projects).
4. **Scoped theme** (same rule as Path B): product tokens live in
   `.theme-<product>` in `app/globals.css`; the registry's `theme` field applies
   it around the preview. NEVER restyle the hub.
5. **Verify:** `npm run verify-ui` green (its `check:previews` counts a
   registered live import as covered), and the gallery card + doc page show the
   **live** badge rendering the real component at `/synclair/components/<name>`.
   Close with the `synclair-steward` loop (eyes on the page, not just checks).

The external catalog entry stays the source of record (Path A does NOT
re-register the item — it stays `origin: "external"` with its hash anchor);
props on its doc page are already derived live from the host source
(lib/system/host-docgen.ts), so the entry needs no authored `props` refresh.

### Path A patterns proven in the field

- **Session-wired hosts: render harness children CLIENT-side only.** If the
  host's session/mock store persists to `localStorage`, the server renders
  previews signed-out while the client hydrates signed-in — every
  session-GATED preview hydration-mismatches on load. Give your shared session
  wrapper the `useSyncExternalStore` is-client idiom (server snapshot `false`,
  client `true`) and render children only when mounted. Previews are
  client-interactive surfaces; skipping their SSR HTML costs nothing.
- **Viewport-gated components (`md:hidden` etc.): iframe at the device width.**
  Media queries fire at the BROWSER viewport, so a narrow container can't show
  a mobile-only piece. Register a chrome-free scene for it
  (`components/library/preview-scenes.tsx` → `/synclair/preview/<name>`, wrapped
  in the product's scoped theme) and make the preview an `EmbedFrame` pinned to
  the mobile logical width (`ViewportModeContext.Provider value="mobile"`). The
  iframe viewport IS the device width, so the gated component actually exists.

## Path B — rewrite port (the original flow)

**The one rule that overrides everything: NEVER restyle the hub to match the
product.** Do not edit `:root` / `.dark` / `--sidebar-*` / the hub's `--background`
in `app/globals.css`. The hub is one surface, the product is another — theming the
hub to look like the product is *mixing surfaces*, the mistake to avoid. Product
tokens live in a **scoped class**, applied only around previews.

## One-time setup per product — the scoped theme

Define the product's real tokens as a **scoped class** in `app/globals.css`, added
alongside `.dark` (additive — it changes nothing that already exists):

```css
/* SCOPED, preview-only — overrides theme vars ONLY inside .theme-<product>.
   :root/.dark and hub chrome are untouched. Values from the token dig
   (lib/system/seed/brand-ramps.ts + foundation.ts). */
.theme-acme {
  --background: #f6f5f1;  --card: #ffffff;   --primary: #1c1917;   --ring: #4f46e5;
  --brand-400: #4f46e5;   /* … the full 11-step brand ramp + semantics … */
}
```

Because Tailwind's `@theme inline` keeps `var()` references, `bg-primary` /
`bg-brand-400` resolve to the scoped values *inside* the class and stay neutral
everywhere else. The wrapper is `components/library/product-theme-scope.tsx`
(`ProductThemeScope theme="theme-<product>"`); add a thin project wrapper
(e.g. `AcmeScope`) that fixes the class. **Previews only — never in hub UI.**

**Live is the default at every tier — components AND blocks.** Blocks port the
same way: session/store/route wiring converts to props (data in, callbacks out),
and the docs preview shows the real thing inside the scope. Don't fall back to
screenshots because something is big or wired — a screenshot goes stale invisibly
and can't show states. The only items that stay documented via `image`/`embed`
previews (screenshots of the RUNNING host — see `existing-project-intake` Phase 4)
are ones that genuinely can't render in the hub's browser runtime: native-module
RN components, server-only pieces. When the tier itself is in doubt, get a verdict
from the `tier-arbiter` agent before porting — the tier sets the doc bar.

**Thumbnails are the one screenshot exception for web items**: the DOC PAGE must
render live, but a complex block whose scaled-down live render makes an
unreadable gallery card may keep an in-situ screenshot as its card thumb via the
registry entry's `meta.previewImage` (a `public/external/...` path). Opt-in and
rare — simple items thumb better live.

## Per-component port

1. **Invention gate + read the host source.** Confirm it's worth promoting (reused,
   load-bearing). Read the host implementation; keep its **real name** and its
   **variant vocabulary** (tones/sizes/states) verbatim — the host component IS the
   product's design system.
2. **Write a token-clean component** in `components/<name>.tsx`: `cva` variants
   (never boolean style props) consuming the theme tokens — semantic (`bg-primary`,
   `bg-card`, `text-muted-foreground`) and `bg-brand-*` for brand accents. **No raw
   hex / arbitrary px** (lint-enforced); the product's colors arrive via the scope,
   not literals. Preserve host polarity (e.g. primary = ink, accent = brand hue).
3. **Colocated `<name>.docs.tsx`** — examples, props, notes (record the host source
   path + what re-expressed to which token). **Wrap EVERY `preview` in the product
   scope**: `preview: live(<AcmeScope><Button/></AcmeScope>)`. The first
   example is also the gallery thumbnail, so it must be representative and scoped.
   **Interactive examples (toggles, toasts, dialogs — anything with state) go in a
   colocated client harness `components/<name>.demo.tsx`** (`"use client"`), which
   the docs file imports — docs modules are server-rendered and can't hold hooks.
4. **Register** in `registry.json`: `type: registry:component`, AI-legible
   `description`, ≥1 `category`, `docs` path, **`meta.surface`** = the product
   surface the item belongs to (`"shared"` for a cross-app design-system primitive;
   a specific surface id otherwise), and **`meta.layer: "project"`** — ports are
   project content and must never sync upstream. To supersede the read-only catalog
   entry, **align names**: set the external `data/external-catalog.json` item's
   `name` to the registered `name` (precedence is registered > external per
   `(surface,name)`). Don't otherwise edit the external catalog.
5. **Map the doc**: add `import` + a **quoted** `"<name>": <name>,` line to
   `lib/system/docs.ts` (the check greps for the quoted key). Then anchor:
   `npm run check:ux-docs -- --update <name>`.
6. **Verify**: `npm run verify-ui` (typecheck + lint + check:registry + check:ux-docs)
   AND `npm run check:host` — both green.

## Definition of done

- [ ] Hub chrome untouched — no `:root`/`.dark`/`--sidebar-*` edits; product tokens
      live only in `.theme-<product>`
- [ ] `cva` variants, theme/`brand-*` tokens only (no hex/px), host name + variants preserved
- [ ] Every doc `preview` wrapped in the product scope → renders in the product's real look
- [ ] Registered with `meta.surface`; external catalog entry name aligned (superseded)
- [ ] Mapped in `docs.ts` (quoted key) + ux-anchored
- [ ] `verify-ui` + `check:host` green; the live item renders at `/library/<surface>/components/<name>`

## Relations

- `existing-project-intake` — produces the read-only catalog this skill promotes from.
- `component-library` — the registry / invention-gate / tier conventions this builds on.
- `ux-doc` — required doc depth for blocks/templates (components need examples+props+notes).
