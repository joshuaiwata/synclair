#!/usr/bin/env bash
#
# synclair-reset.sh — blank the seed from a fresh Synclair clone so it's ready to
# reseed for a NEW project. This is the mechanical half of "start a new project"
# (docs/new-project.md); the interactive reseed is guided by the project-bootstrap
# skill. It resets exactly the SEED inventory from docs/foundation-model.md §8 and
# leaves the Brain / adapter / hub-skin untouched.
#
# Usage:  scripts/synclair-reset.sh <project-dir> --yes
#         (run on a FRESH clone — it overwrites seed files and removes the
#          construction domain skill/agent)
#
set -euo pipefail

DIR="${1:-}"
CONFIRM="${2:-}"

if [[ -z "$DIR" || "$CONFIRM" != "--yes" ]]; then
  cat <<'USAGE'
synclair-reset.sh — blank the Synclair seed for a new project.

  Usage: scripts/synclair-reset.sh <project-dir> --yes

Resets (SEED — see docs/foundation-model.md §8):
  • lib/system/seed/project.ts       → generic "Your Product" identity
  • lib/system/seed/brand-ramps.ts   → empty (add your brand ramps)
  • lib/system/seed/foundation.ts    → empty (type / spacing / radius / extras)
  • lib/system/seed/surfaces.ts      → empty (single implicit surface)
  • lib/system/knowledge/sources.ts  → empty manifest
  • lib/system/references.ts         → empty library (grows per project)
  • data/setup.json                  → unresolved (setup re-resolves the mode)
  • data/figma-manifest/*.json       → removed
  • .claude/skills/construction-domain, .claude/agents/construction-erp-advisor.md → removed
  • .claude/skills/product-spec/references/*.md (except _TEMPLATE.md) → removed

Leaves untouched (BRAIN / adapter / Synclair-skin): tokens vocabulary, tiers, docs
contract, adapters, the Synclair routes, the registered UI components, the
knowledge-layer machinery, product-spec + prd-retriever.

Re-run --yes to proceed.
USAGE
  exit 1
fi

cd "$DIR"

# Sanity: make sure this really is a Synclair clone before overwriting anything.
if [[ ! -f "lib/system/seed/brand-ramps.ts" || ! -f "lib/system/knowledge/types.ts" ]]; then
  echo "error: $DIR doesn't look like a Synclair clone (missing lib/system/seed or knowledge)." >&2
  exit 1
fi

echo "› Blanking brand ramps…"
cat > lib/system/seed/brand-ramps.ts <<'TS'
import type { ColorGroup } from "../tokens"

/**
 * SEED (project-specific): this project's brand color ramps. Add one or more
 * ramps here — mirror the shape of the Semantic/Status groups in `../tokens.ts`.
 * Empty by default so a fresh project shows only the neutral base until branded.
 */
export const BRAND_RAMPS: ColorGroup[] = []
TS

echo "› Blanking project foundation (type / spacing / radius / extras)…"
cat > lib/system/seed/foundation.ts <<'TS'
/**
 * SEED (project-specific): the project's design foundation BEYOND color — the
 * companion of `brand-ramps.ts`. In existing-project mode the token dig writes
 * the HOST's fonts, type/spacing/radius, elevation, and any extra foundation
 * categories (motion, iconography, brand guidelines…) here as DATA. Empty by
 * default.
 *
 * VALUES ONLY — the shape lives in the Brain (lib/system/foundation-schema.ts),
 * which a reset never touches, so this template can't drift behind the readers
 * again. The re-export keeps existing imports working.
 */
import type { ProjectFoundation } from "../foundation-schema"

export type {
  FoundationFont,
  FoundationTypeStep,
  FoundationTypeRole,
  FoundationScaleStep,
  FoundationShadowStep,
  FoundationMotion,
  FoundationIcon,
  FoundationIcons,
  FoundationGroup,
  FoundationSection,
  FoundationSample,
  ProjectFoundation,
} from "../foundation-schema"

export const PROJECT_FOUNDATION: ProjectFoundation = {
  fonts: [],
  type: [],
  radii: [],
  spacing: [],
  sections: [],
}
TS

echo "› Resetting the product identity…"
cat > lib/system/seed/project.ts <<'TS'
/**
 * Per-project identity — the ONE place a clone names the product it catalogs.
 *
 * Seed (§8): reseeded by `project-bootstrap` (or by hand) when this foundation is
 * cloned. Synclair's hub header reads this, so renaming here re-labels the hub.
 * The product itself lives elsewhere (its own repo/app on its own server) — this
 * is just the name Synclair shows for it.
 */
export const project = {
  /** The product this Synclair catalogs. Shown in the hub header. */
  name: "Your Product",
  /** One-line description of the product, shown in the hub. */
  tagline: "The product this Synclair foundation catalogs.",
}
TS

echo "› Blanking token systems (single-system project: classic Foundations)…"
cat > lib/system/seed/token-systems.ts <<'TS'
import type { DriftSection, TokenSystem } from "../token-systems"

/**
 * SEED (project-specific): the host's parallel TOKEN SYSTEMS, kept separate so
 * /synclair/foundations can show each one whole and the Compare tab can show
 * the drift between them (mechanism: lib/system/token-systems.ts). EMPTY by
 * default — a single-system project leaves this alone and gets the classic
 * consolidated Foundations page.
 */
export const TOKEN_SYSTEMS: TokenSystem[] = []

export const TOKEN_DRIFT: DriftSection[] = []
TS

echo "› Blanking the Foundations example tiles…"
cat > lib/system/seed/foundation-tiles.tsx <<'TS'
/**
 * SEED — the project's example tiles for the Foundations "Examples" showcase.
 * The ONE home for project-specific foundation JSX; empty until the project
 * composes tiles against its own scoped brand variables (see the
 * existing-project-intake skill, Phase 3: sample + tiles are all-or-nothing).
 */
export function FoundationExampleTiles() {
  return null
}
TS

echo "› Blanking multi-surface prose notes…"
cat > lib/system/seed/surface-notes.ts <<'TS'
import type { FoundationSection } from "./foundation"

/**
 * SEED (project-specific): prose notes for the MULTI-SURFACE hub views.
 * LEAVE EMPTY for a single-surface project — the views gate on surfaces.
 */
export const SURFACE_NOTES: Record<"pages" | "library", FoundationSection[]> = {
  pages: [],
  library: [],
}
TS

echo "› Blanking app surfaces (single implicit surface)…"
cat > lib/system/seed/surfaces.ts <<'TS'
import type { Surface } from "../surfaces"

/**
 * Per-project app SURFACES — the distinct frontends this project ships
 * (e.g. a responsive web app + a React Native companion app sharing a backend).
 *
 * Seed (§8): declared once at bootstrap/intake and reviewed by a human, like
 * `project.ts`. LEAVE EMPTY for a single-frontend project — an empty list means
 * one implicit surface and Synclair shows zero multi-surface chrome (today's UI
 * exactly). Declare two or more entries only when the project genuinely has
 * separate frontends with separate component sets.
 *
 * Example (monorepo host with web + Expo apps):
 *
 *   export const SURFACES: Surface[] = [
 *     { id: "web",    label: "Web app",       platform: "web",          root: "../acme/apps/web",    framework: "Next.js 15" },
 *     { id: "mobile", label: "Companion app", platform: "react-native", root: "../acme/apps/mobile", framework: "Expo SDK 52" },
 *   ]
 */
export const SURFACES: Surface[] = []
TS

echo "› Emptying the knowledge manifest…"
cat > lib/system/knowledge/sources.ts <<'TS'
import type { KnowledgeSource } from "./types"

/**
 * SEED (project-specific): this project's sources of truth — specs, PRDs, Figma,
 * decks. LINK them, never copy raw docs in. Add one entry per area as you locate
 * it, and set `distilledInto` once a digest exists. See docs/foundation-model.md §9.
 */
export const KNOWLEDGE_SOURCES: KnowledgeSource[] = []

export function getKnowledgeSources(): KnowledgeSource[] {
  return KNOWLEDGE_SOURCES
}
TS

echo "› Emptying the references library…"
if [[ -f lib/system/references.ts ]]; then
  # Blank just the seed array; keep the type + getter + append convention intact.
  perl -0pi -e 's/export const REFERENCES: Reference\[\] = \[[^\]]*\]/export const REFERENCES: Reference[] = []/s' lib/system/references.ts
fi

echo "› Clearing Figma manifest data…"
rm -f data/figma-manifest/*.json 2>/dev/null || true

echo "› Clearing the external (host-app) component catalog…"
printf '{\n  "hosts": [],\n  "items": []\n}\n' > data/external-catalog.json
rm -rf public/external 2>/dev/null || true

echo "› Clearing the system map…"
printf '{\n  "repo": null,\n  "areas": [],\n  "api": [],\n  "data": [],\n  "jobs": [],\n  "integrations": []\n}\n' > data/system-map.json

echo "› Resetting the setup-mode marker to unresolved (setup re-resolves per project)…"
printf '{\n  "mode": null\n}\n' > data/setup.json

echo "› Anchoring the call-home baseline to this clone's foundation commit (opt-in stays off)…"
printf '{\n  "callHome": false,\n  "commit": "%s",\n  "syncedAt": "%s"\n}\n' \
  "$(git rev-parse HEAD 2>/dev/null || true)" \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > data/mother.json

echo "› Clearing documents added from the hub (the seed manifest stays)…"
printf '{\n  "sources": []\n}\n' > data/knowledge/added-sources.json

echo "› Clearing project data artifacts (found by fresh-clone simulation 2026-08-19)…"
# Everything under data/ that a project generates is SEED by nature — and none
# of it was reset, so a blank clone opened claiming the PREVIOUS project's 150
# mapped pages, its weekly updates, its reports and its roadmap: a lie on day
# one and a leak of the last client's data. Readers degrade cleanly on absence
# (that is their contract), so deletion is the reset where tolerated and a
# minimal blank where a schema is expected.
rm -f data/reports/*.json 2>/dev/null || true
find data/handoffs -type f ! -name '_template.md' -delete 2>/dev/null || true
# The derived cache is gitignored (north-star Phase 1) — a fresh clone has
# none, but a reset of a USED clone must still drop the previous project's
# derived data. One directory now, not a file list that drifts.
rm -rf .synclair/cache 2>/dev/null || true
rm -f data/dashboard-updates.json data/roadmap.json data/pages-map.json data/dev-servers.json 2>/dev/null || true
printf '{\n  "trunk": "HEAD",\n  "windowDays": 14,\n  "hub": [],\n  "people": [],\n  "exclude": [],\n  "themes": []\n}\n' > data/dashboard.json

echo "› Stripping host tendrils (found by fresh-clone simulation 2026-08-19)…"
# A clone's token dig appends the HOST's stylesheet imports to globals.css, and
# port-host-component fills components/host-previews with modules importing
# @host/… paths. Both are clone-local by nature and BOTH 500 a fresh clone
# dropped beside a different repo — the import targets don't exist there. The
# reset removes any @import that reaches outside this app, and returns
# host-previews to the mother's empty registry.
perl -ni -e 'print unless m{^\s*\@(import|source)\s+"\.\./\.\./}' app/globals.css
find components/host-previews -type f ! -name 'registry.tsx' -delete 2>/dev/null || true
cat > components/host-previews/registry.tsx <<'TS'
import type { ComponentType, ReactNode } from "react"

/**
 * LIVE previews for host (external) catalog items — the import seam that gives
 * companion mode Storybook semantics (docs/rendering-parity.md). Empty in the
 * mother repo (there is no host); the `port-host-component` skill populates it
 * per clone. Never synced upstream — entries import @host/… paths that only
 * exist beside one particular repo.
 */
export interface HostPreviewEntry {
  /** A zero-prop wrapper that renders the imported host component with representative sample data. */
  component: ComponentType
  /** Scoped product-theme class from globals.css (see ProductThemeScope), e.g. "theme-acme". */
  theme?: string
}

export const hostPreviews: Record<string, HostPreviewEntry> = {}

export function getHostPreview(
  name: string,
  surface?: string
): HostPreviewEntry | undefined {
  return (surface && hostPreviews[`${surface}:${name}`]) || hostPreviews[name]
}

/**
 * Neutral stand-in for the host's tab-row frame. In a populated clone the
 * registry re-exports the host's real recipe here; blank, embeds render bare.
 * Foundation code imports this from the registry ONLY (check:reset-safe) —
 * the registry is the one host-previews file a reset keeps.
 */
export function HostTabFrame({
  children,
}: {
  tabs: string[]
  active: string
  children: ReactNode
}) {
  return <>{children}</>
}
TS

echo "› Removing the construction domain skill + advisor (reseed per project)…"
rm -rf .claude/skills/construction-domain .claude/agents/construction-erp-advisor.md

echo "› Clearing product-spec digests (keeping the template)…"
find .claude/skills/product-spec/references -name '*.md' ! -name '_TEMPLATE.md' -delete 2>/dev/null || true

cat <<'NEXT'

✓ Seed blanked. The app still typechecks and runs (brand + knowledge just empty).

Now RESEED (interactive — the project-bootstrap skill guides this):
  1. Identity   — name + tagline in lib/system/seed/project.ts (re-labels
                  Synclair's header); package.json name; registry.json homepage.
  2. Theme      — app/globals.css semantic/brand tokens; add ramps to
                  lib/system/seed/brand-ramps.ts.
  3. Platform   — pick the adapter in lib/system/adapters/index.ts (web-shadcn default).
  4. Domain     — if domain-heavy, create <domain>-domain skill + <domain>-advisor
                  agent (was construction-*); else skip.
  5. Knowledge  — add real spec/PRD/Figma/deck sources to lib/system/knowledge/sources.ts.
  6. Verify     — npm install && npm run dev (port 4100); load / (redirects to
                  the hub), /synclair, /synclair/components, /synclair/knowledge.
NEXT
