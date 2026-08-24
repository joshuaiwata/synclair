#!/usr/bin/env bash
#
# sim-fresh-clone.sh — the fresh-clone simulation, scripted (battery A2).
#
# Proves the drop-in instead of asserting it: copy this hub minus node_modules/
# .next to a scratch dir, blank the seed with synclair-reset.sh, boot the blank
# clone on a spare port, and run the smoke suite against it. Three reset gaps
# once shipped for weeks because nobody ever booted the blank clone — this makes
# booting it one command with an exit code, cheap enough for CI.
#
#   scripts/sim-fresh-clone.sh            # build + start (deterministic; CI)
#   KEEP_SIM=1 scripts/sim-fresh-clone.sh # leave the scratch dir + server up
#                                         # for inspection (prints where/port)
#
# Env knobs: SIM_DIR (scratch location), SIM_PORT (skip the free-port scan).
# Exit code is the smoke suite's. Never touches the source hub.
set -euo pipefail

# The hub root is the CALLER'S directory (the synclair CLI runs core
# scripts from the hub root); the script itself now lives inside the package.
HUB="$(pwd)"
# Where core's scripts live RELATIVE to the hub — packages/core/scripts when
# vendored as a workspace, node_modules/@synclair/core/scripts when installed
# from the registry. The scratch copy carries the same layout, so the reset
# script is addressed by this relative path, never a hardcoded one.
CORE_SCRIPTS_ABS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$CORE_SCRIPTS_ABS" != "$HUB"/* ]]; then
  echo "[sim] @synclair/core is not installed inside this hub ($CORE_SCRIPTS_ABS) — run from the hub root with core as a workspace or dependency." >&2
  exit 1
fi
CORE_SCRIPTS_REL="${CORE_SCRIPTS_ABS#"$HUB"/}"
# The clone sits inside its own EMPTY parent dir: the hub's knowledge layer
# references ../ paths (embedded mode), so Turbopack walks the project root's
# parent at build time — in a shared temp dir that walk hits protected
# siblings (macOS com.apple.bird: "Operation not permitted") and the build
# dies on scenery. An empty parent gives the walk nothing to trip on.
PARENT="$(mktemp -d "${TMPDIR:-/tmp}/synclair-sim.XXXXXX")"
SCRATCH="${SIM_DIR:-$PARENT/synclair}"
KEEP="${KEEP_SIM:-0}"
SERVER_PID=""

log() { printf '\n[sim] %s\n' "$*"; }

cleanup() {
  local code=$?
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    if [[ "$KEEP" == "1" && $code -eq 0 ]]; then
      log "KEEP_SIM=1 — server pid $SERVER_PID still running on port $PORT, scratch at $SCRATCH"
      return
    fi
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  # `npm run start` wraps `next start` wraps `next-server`; killing the npm pid
  # orphans the grandchild, which keeps listening on the sim port with its
  # scratch dir deleted under it (observed locally on :4103). And next-server
  # RETITLES itself, so an argv sweep (pkill -f by path) misses it — kill by
  # the port we own instead.
  if [[ -n "${PORT:-}" ]]; then
    lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
  fi
  if [[ "$KEEP" == "1" ]]; then
    log "KEEP_SIM=1 — scratch left at $SCRATCH"
  else
    rm -rf "$SCRATCH" "$PARENT"
  fi
}
trap cleanup EXIT

log "copying hub → $SCRATCH (minus node_modules/.next/.git)"
rsync -a --exclude node_modules --exclude .next --exclude .git "$HUB/" "$SCRATCH/"

# node_modules rides along as a copy, never a symlink — Turbopack rejects
# out-of-root symlinks. APFS/reflink clones make it near-free where supported.
log "copying node_modules (CoW where the filesystem allows)"
if [[ "$(uname)" == "Darwin" ]]; then
  cp -Rc "$HUB/node_modules" "$SCRATCH/node_modules"
else
  cp -a --reflink=auto "$HUB/node_modules" "$SCRATCH/node_modules"
fi

log "blanking the seed (synclair-reset.sh)"
bash "$SCRATCH/$CORE_SCRIPTS_REL/synclair-reset.sh" "$SCRATCH" --yes

# A spare port: 4100 is the real dev server, 4103/4104 were past sims that may
# still be running — scan instead of assuming.
if [[ -n "${SIM_PORT:-}" ]]; then
  PORT="$SIM_PORT"
else
  PORT=""
  for p in $(seq 4103 4130); do
    # bash's /dev/tcp probe — no nc dependency (absent on some CI images)
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then PORT="$p"; break; fi
  done
  [[ -n "$PORT" ]] || { echo "[sim] no free port in 4103-4130" >&2; exit 1; }
fi

# Production build+start, not `next dev`: deterministic, no lazy-compile
# flakiness, and the scratch dir is not the dev dir the build ban protects.
log "building the blank clone"
(cd "$SCRATCH" && npm run build)

log "starting on port $PORT"
(cd "$SCRATCH" && npm run start -- --port "$PORT") &
SERVER_PID=$!

log "waiting for the hub to answer"
for i in $(seq 1 60); do
  if curl -sf -o /dev/null "http://localhost:$PORT/synclair"; then break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[sim] server died before answering" >&2
    exit 1
  fi
  sleep 1
  [[ $i -lt 60 ]] || { echo "[sim] server never answered on $PORT" >&2; exit 1; }
done

log "smoke against the blank clone"
(cd "$SCRATCH" && SYNCLAIR_URL="http://localhost:$PORT" npm run smoke)

# The audit must hold on a BLANK corpus too — this is what catches checks that
# hardcode one product's vocabulary or fail on artifacts a reset deletes
# (both shipped; both found by auditing a freshly intaken clone).
log "audit:mcp against the blank clone"
(cd "$SCRATCH" && npm run audit:mcp)

log "fresh-clone simulation PASSED"
