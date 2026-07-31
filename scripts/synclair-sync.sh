#!/usr/bin/env bash
#
# synclair-sync.sh — pull foundation updates from the mother Synclair repo into
# this clone, as a git merge with the seed boundary as the resolution contract
# (docs/foundation-model.md §8, principle 3: "clone, sync deliberately").
#
# Usage:
#   scripts/synclair-sync.sh status   # how far behind upstream is this clone?
#   scripts/synclair-sync.sh pull     # merge upstream on a sync branch, auto-keep seed
#
# What `pull` does:
#   1. Requires a clean tree; adds the `upstream` remote if missing.
#   2. Creates a `foundation-sync-<date>` branch off the current branch.
#   3. Merges upstream/main (falls back to --allow-unrelated-histories for
#      clones that started with fresh history — the one-time adoption).
#   4. Auto-resolves conflicts on SEED paths as "keep ours" (the project's seed
#      never syncs). Leaves Brain conflicts (usually "take upstream's") and
#      MIXED files (identity + foundation content interleaved) for you.
#   5. Prints what's left and the verify steps. It never commits a merge that
#      still has conflicts, and never touches your original branch.
#
set -euo pipefail

UPSTREAM_URL="https://github.com/joshuaiwata/synclair.git"
UPSTREAM_BRANCH="main"

# SEED — always the project's own; on conflict keep OURS automatically.
SEED_OURS=(
  "lib/system/seed/"
  "lib/system/knowledge/sources.ts"
  "lib/system/references.ts"
  "data/"
  "memory/"
  ".claude/skills/product-spec/references/"
)

# MIXED — seed identity and foundation content share the file; resolve by hand.
MIXED=(
  "app/globals.css"
  "package.json"
  "package-lock.json"
  "registry.json"
  "components.json"
  "README.md"
  "AGENTS.md"
  "CLAUDE.md"
)

cmd="${1:-}"
[[ "$cmd" == "status" || "$cmd" == "pull" ]] || {
  awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"
  exit 1
}

ensure_upstream() {
  if ! git remote get-url upstream >/dev/null 2>&1; then
    echo "› adding upstream remote: $UPSTREAM_URL"
    git remote add upstream "$UPSTREAM_URL"
  fi
  git fetch -q upstream "$UPSTREAM_BRANCH"
}

is_seed() {
  local p="$1"
  for s in "${SEED_OURS[@]}"; do [[ "$p" == "$s"* ]] && return 0; done
  return 1
}

is_mixed() {
  local p="$1"
  for m in "${MIXED[@]}"; do [[ "$p" == "$m" ]] && return 0; done
  return 1
}

ensure_upstream

if [[ "$cmd" == "status" ]]; then
  if base=$(git merge-base HEAD "upstream/$UPSTREAM_BRANCH" 2>/dev/null); then
    behind=$(git rev-list --count HEAD.."upstream/$UPSTREAM_BRANCH")
    echo "shared ancestry: yes (base $(git rev-parse --short "$base"))"
    echo "foundation commits not in this clone: $behind"
    [[ "$behind" -gt 0 ]] && git log --oneline HEAD.."upstream/$UPSTREAM_BRANCH" | sed 's/^/  /'
  else
    echo "shared ancestry: NO — this clone predates history-preserving setup."
    echo "‹pull› will do the one-time adoption merge (--allow-unrelated-histories)."
    echo "files that differ from upstream: $(git diff --name-only HEAD "upstream/$UPSTREAM_BRANCH" | wc -l | tr -d ' ')"
  fi
  exit 0
fi

# ── pull ─────────────────────────────────────────────────────────────────────
[[ -z "$(git status --porcelain)" ]] || { echo "error: working tree not clean — commit or stash first." >&2; exit 1; }

start_branch=$(git branch --show-current)
sync_branch="foundation-sync-$(date +%Y%m%d)"
git switch -c "$sync_branch" >/dev/null 2>&1 || { echo "error: branch $sync_branch already exists — finish or delete it first." >&2; exit 1; }
echo "› merging upstream/$UPSTREAM_BRANCH into $sync_branch (from $start_branch)…"

merge_flags=()
git merge-base HEAD "upstream/$UPSTREAM_BRANCH" >/dev/null 2>&1 || {
  echo "› no shared ancestry — one-time adoption merge."
  merge_flags+=(--allow-unrelated-histories)
}

# ${arr[@]+"${arr[@]}"}: stock macOS bash 3.2 + set -u errors on expanding an
# empty array — and the array IS empty on every normal (shared-ancestry) sync.
if git merge ${merge_flags[@]+"${merge_flags[@]}"} --no-edit "upstream/$UPSTREAM_BRANCH" >/dev/null 2>&1; then
  echo "✓ merged clean, no conflicts."
else
  kept=0; brain=(); mixed=()
  while IFS= read -r p; do
    if is_seed "$p"; then
      # Keep the project's version. --ours fails on add/add-less cases; fall back to rm.
      if git checkout --ours -- "$p" 2>/dev/null; then git add -- "$p"; else git rm -q -- "$p" 2>/dev/null || true; fi
      kept=$((kept+1))
    elif is_mixed "$p"; then
      mixed+=("$p")
    else
      brain+=("$p")
    fi
  done < <(git diff --name-only --diff-filter=U)

  echo "✓ seed conflicts auto-kept as this project's version: $kept"
  if [[ ${#brain[@]} -eq 0 && ${#mixed[@]} -eq 0 ]]; then
    git commit -q --no-edit
    echo "✓ merge committed."
  else
    echo ""
    if [[ ${#brain[@]} -gt 0 ]]; then
      echo "BRAIN conflicts — take upstream's unless this project deliberately forked the mechanism:"
      for p in "${brain[@]}"; do
        echo "   $p    → git checkout --theirs -- '$p' && git add '$p'"
      done
    fi
    if [[ ${#mixed[@]} -gt 0 ]]; then
      echo "MIXED files — merge by hand (identity/theme lines are yours; structure/deps are upstream's):"
      for p in "${mixed[@]}"; do echo "   $p"; done
      echo "   (package-lock.json: resolve package.json first, then regenerate with npm install)"
    fi
    echo ""
    echo "Then: git commit --no-edit"
  fi
fi

# Stamp the call-home baseline (data/mother.json is SEED, so the merge keeps
# ours — this write records the new truth): the foundation is now at upstream's
# sha. Preserves the clone's callHome opt-in; creates the file for older clones.
upstream_sha=$(git rev-parse "upstream/$UPSTREAM_BRANCH")
node -e '
const { readFileSync, writeFileSync } = require("node:fs");
let rec = { callHome: false, commit: "", syncedAt: "" };
try { rec = { ...rec, ...JSON.parse(readFileSync("data/mother.json", "utf8")) } } catch {}
rec.commit = process.argv[1];
rec.syncedAt = new Date().toISOString();
writeFileSync("data/mother.json", JSON.stringify(rec, null, 2) + "\n");
' "$upstream_sha" 2>/dev/null && echo "✓ call-home baseline stamped: foundation @ ${upstream_sha:0:7} (data/mother.json — commit it with the merge)" || true

echo ""
echo "Next: npm install && npm run verify-ui — and bring the app up (preview-server skill)."
echo "When green, merge back: git switch $start_branch && git merge $sync_branch"
