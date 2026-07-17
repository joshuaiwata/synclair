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
 * the HOST's fonts, type/spacing/radius, and any extra foundation categories
 * (logo, brand guidelines, iconography…) here as DATA. Empty by default.
 */

export interface FoundationFont {
  role: string
  family: string
  usage?: string
}

export interface FoundationTypeStep {
  name: string
  size: string
  line?: string
  usage?: string
}

export interface FoundationScaleStep {
  name: string
  px: string
  usage?: string
}

export interface FoundationSection {
  id: string
  label: string
  summary?: string
  body: string
}

export interface ProjectFoundation {
  fonts: FoundationFont[]
  type: FoundationTypeStep[]
  radii: FoundationScaleStep[]
  spacing: FoundationScaleStep[]
  sections: FoundationSection[]
  notes?: string
}

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

echo "› Clearing project summaries + queue (keeping the machinery)…"
find data/knowledge/summaries -name '*.md' -delete 2>/dev/null || true
printf '{\n  "summaries": []\n}\n' > data/knowledge/summaries/index.json
printf '{\n  "requests": []\n}\n' > data/knowledge/summary-queue.json

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
