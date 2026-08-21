#!/usr/bin/env bash
#
# sim-matrix.sh — the configuration matrix, scripted (battery C6).
#
# The hub historically shipped bugs that lived only in untested cells of its
# configuration space: blank vs populated seed, PlantUML server up vs down,
# gh CLI usable vs not, Memories extension on vs off. This runs the smoke
# suite against eight cells — for each corpus (blank, populated): baseline,
# PlantUML down, gh failing, Memories flipped — each on its own production
# boot, and reports per-cell results.
#
#   scripts/sim-matrix.sh              # all eight cells, exit 1 if any fail
#
# Notes: the PlantUML cells stop/start the shared `synclair-plantuml`
# container (brief; restarted even on failure). "gh absent" is simulated with
# a PATH shim whose `gh` exits 127 — code paths see the same failure shape as
# a missing binary. Builds happen once per corpus; each cell is its own boot.
set -uo pipefail

HUB="$(pwd)"
PARENT="$(mktemp -d "${TMPDIR:-/tmp}/synclair-matrix.XXXXXX")"
# The POPULATED corpus keeps its host imports (@host/… = ../apps/…), so its
# scratch must sit at the same depth as synclair/ inside the real repo — an
# isolated copy of a populated embedded hub cannot build, by design. The blank
# corpus is the isolated one (that isolation IS its drill).
POPULATED_DIR="$(dirname "$HUB")/.synclair-matrix-populated.$$"
SHIM="$PARENT/shim"
RESULTS=()
FAILED=0
SERVER_PID=""
PLANTUML_WAS_UP=0

log() { printf '\n[matrix] %s\n' "$*"; }

cleanup() {
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null
  # Sweep the whole sim port range by listener cwd-independent port kill;
  # argv-based pkill misses retitled next-server processes.
  lsof -ti tcp:4106-4140 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null
  if [[ "$PLANTUML_WAS_UP" == "1" ]]; then
    docker start synclair-plantuml >/dev/null 2>&1 || true
  fi
  rm -rf "$PARENT" "$POPULATED_DIR"
}
trap cleanup EXIT

docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^synclair-plantuml$' && PLANTUML_WAS_UP=1

mkdir -p "$SHIM"
printf '#!/bin/sh\necho "gh: simulated absent (sim-matrix)" >&2\nexit 127\n' > "$SHIM/gh"
chmod +x "$SHIM/gh"

copy_hub() { # $1 = dest
  rsync -a --exclude node_modules --exclude .next --exclude .git "$HUB/" "$1/"
  if [[ "$(uname)" == "Darwin" ]]; then
    cp -Rc "$HUB/node_modules" "$1/node_modules"
  else
    cp -a --reflink=auto "$HUB/node_modules" "$1/node_modules"
  fi
}

free_port() {
  for p in $(seq 4106 4140); do
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then echo "$p"; return; fi
  done
  echo ""
}

boot() { # $1 = dir, $2 = port, $3 = extra PATH prefix ("" for none)
  local dir="$1" port="$2" prefix="$3"
  if [[ -n "$prefix" ]]; then
    (cd "$dir" && PATH="$prefix:$PATH" npm run start -- --port "$port") &
  else
    (cd "$dir" && npm run start -- --port "$port") &
  fi
  SERVER_PID=$!
  for i in $(seq 1 45); do
    curl -sf -o /dev/null "http://localhost:$port/synclair" && return 0
    kill -0 "$SERVER_PID" 2>/dev/null || return 1
    sleep 1
  done
  return 1
}

teardown() { # $1 = the cell's port
  [[ -n "$SERVER_PID" ]] && { kill "$SERVER_PID" 2>/dev/null; wait "$SERVER_PID" 2>/dev/null; }
  SERVER_PID=""
  # Kill by PORT, not argv: next-server retitles itself, so pkill -f by path
  # misses it and every cell leaks a listener (13 orphans in one afternoon).
  [[ -n "${1:-}" ]] && lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null
  sleep 1
}

run_cell() { # $1 = label, $2 = dir, $3 = shim ("yes"/"")
  local label="$1" dir="$2" shim="${3:-}"
  local port; port="$(free_port)"
  [[ -n "$port" ]] || { RESULTS+=("FAIL $label (no free port)"); FAILED=1; return; }
  log "cell: $label (port $port)"
  if ! boot "$dir" "$port" "${shim:+$SHIM}"; then
    RESULTS+=("FAIL $label (server never answered)")
    FAILED=1
    teardown "$port"
    return
  fi
  if (cd "$dir" && SYNCLAIR_URL="http://localhost:$port" npm run smoke); then
    RESULTS+=("pass $label")
  else
    RESULTS+=("FAIL $label (smoke)")
    FAILED=1
  fi
  teardown "$port"
}

flip_memories() { # $1 = dir — toggle collaborative-memory relative to the file's state
  node -e '
    const fs = require("fs")
    const p = process.argv[1] + "/data/extensions.json"
    let j = { extensions: {} }
    try { j = JSON.parse(fs.readFileSync(p, "utf8")) } catch {}
    j.extensions = j.extensions ?? {}
    const cur = j.extensions["collaborative-memory"] ?? "on"
    j.extensions["collaborative-memory"] = cur === "off" ? "on" : "off"
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n")
    console.log("[matrix] memories flipped to", j.extensions["collaborative-memory"])
  ' "$1"
}

for corpus in blank populated; do
  if [[ "$corpus" == "blank" ]]; then
    DIR="$PARENT/blank"
  else
    DIR="$POPULATED_DIR"
  fi
  log "preparing $corpus corpus at $DIR"
  mkdir -p "$DIR"
  copy_hub "$DIR"
  if [[ "$corpus" == "blank" ]]; then
    bash "$DIR/packages/core/scripts/synclair-reset.sh" "$DIR" --yes
  fi
  log "building $corpus corpus"
  if ! (cd "$DIR" && npm run build); then
    RESULTS+=("FAIL $corpus (build)")
    FAILED=1
    continue
  fi

  run_cell "$corpus/baseline" "$DIR"

  if [[ "$PLANTUML_WAS_UP" == "1" ]]; then
    docker stop synclair-plantuml >/dev/null
    run_cell "$corpus/plantuml-down" "$DIR"
    docker start synclair-plantuml >/dev/null
  else
    # Container already down: baseline WAS the plantuml-down cell.
    RESULTS+=("pass $corpus/plantuml-down (container already down; covered by baseline)")
  fi

  run_cell "$corpus/gh-absent" "$DIR" yes

  flip_memories "$DIR"
  run_cell "$corpus/memories-flipped" "$DIR"
done

log "matrix results:"
for r in "${RESULTS[@]}"; do printf '  %s\n' "$r"; done
[[ "$FAILED" == "0" ]] && log "configuration matrix PASSED" || log "configuration matrix FAILED"
exit "$FAILED"
