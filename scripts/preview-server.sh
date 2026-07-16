#!/usr/bin/env bash
# preview-server.sh — reliable dev/preview server management for Synclair.
#
# Port 4100 is DEDICATED to this project. Port 3000 is reserved by another app on this
# machine — this script NEVER touches it. Only `next` processes whose cwd is THIS repo
# are ever killed, so it is safe to run even with other dev servers around.
#
# This script does NOT start the server. Starting must go through the harness
# (preview_start) so the preview MCP tracks the server. This script frees the port,
# clears a poisoned build cache, and diagnoses — the things the harness can't do.
#
# Usage:
#   scripts/preview-server.sh status    # what's on :4100 and whether it's healthy
#   scripts/preview-server.sh reclaim   # kill THIS repo's stale dev server(s) → frees :4100
#   scripts/preview-server.sh clean     # reclaim + rm -rf .next  (fixes blank / hung compile)
#   scripts/preview-server.sh doctor    # diagnose and tell you the next action

set -uo pipefail

PORT=4100
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

pids_on_port() { lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true; }

# next dev / next-server processes whose cwd is THIS repo (never other projects/apps)
synclair_dev_pids() {
  local pid cwd
  for pid in $(pgrep -f "next dev|next-server" 2>/dev/null); do
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
    [ "$cwd" = "$PROJECT_DIR" ] && echo "$pid"
  done
}

http_code() {
  curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:$PORT/" 2>/dev/null || echo 000
}

case "${1:-status}" in
  status)
    echo "port:      $PORT"
    echo "http:      $(http_code)"
    echo "listening: [$(pids_on_port | tr '\n' ' ')]"
    echo "dev pids:  [$(synclair_dev_pids | tr '\n' ' ')]"
    ;;

  reclaim)
    # Guard: never kill a HEALTHY server. The Claude app supervises one dev server
    # per repo and auto-restarts it — killing a working one just starts a respawn
    # war and preview_start still can't coexist (Next allows one dev server per dir).
    if [ "$(http_code)" = "200" ] && [ "${2:-}" != "--force" ]; then
      echo "REFUSING: :$PORT is serving a HEALTHY server (http 200) — reuse it, don't kill it."
      echo "It's likely supervised by the Claude app and will just respawn. To override: $0 reclaim --force"
      exit 0
    fi
    pids="$( { synclair_dev_pids; pids_on_port; } | grep -E '^[0-9]+$' | sort -u )"
    if [ -n "$pids" ]; then
      echo "killing wedged synclair server(s): $(echo "$pids" | tr '\n' ' ')"
      echo "$pids" | xargs kill -9 2>/dev/null || true
      sleep 1
    fi
    echo "port $PORT is free (now call preview_start)"
    ;;

  clean)
    "$0" reclaim --force
    rm -rf "$PROJECT_DIR/.next"
    echo ".next cleared — recovers from blank preview / 'Awaiting server' / hung first compile"
    echo "now call preview_start (first compile after a clean .next takes ~10s)"
    ;;

  doctor)
    echo "== preview-server doctor =="
    "$0" status
    code=$(http_code)
    if [ "$code" = "200" ]; then
      echo "-> OK: server is healthy on $PORT (likely supervised by the Claude app)."
      echo "   REUSE it. Do NOT preview_start (Next allows one dev server per repo)."
      echo "   Do NOT reclaim — it will just respawn."
    elif [ -n "$(pids_on_port)" ]; then
      echo "-> WEDGED: something holds $PORT but isn't serving 200."
      echo "   fix: scripts/preview-server.sh clean   then preview_start"
    else
      echo "-> DOWN: nothing on $PORT. fix: preview_start (via the harness)"
    fi
    ;;

  *)
    echo "usage: $0 {status|reclaim|clean|doctor}"
    exit 1
    ;;
esac
