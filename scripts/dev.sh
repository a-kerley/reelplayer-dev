#!/usr/bin/env bash
# Local dev stack: syncs production KV into the local Worker, then starts
# `wrangler dev` (:8787) and dev-server.py (:8777) in the background.
#
# Usage: scripts/dev.sh [start] [--no-sync]   (default command: start)
#        scripts/dev.sh stop
#        scripts/dev.sh status
set -euo pipefail

# WHY: `env bash` can resolve to an x86_64 Homebrew bash on Apple Silicon;
# everything it spawns then runs under Rosetta and wrangler's arm64
# workerd binary refuses to start.
if [ "$(uname -m)" = "x86_64" ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ]; then
  exec arch -arm64 /bin/bash "$0" "$@"
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${TMPDIR:-/tmp}/reelplayer-dev-logs"

cmd="${1:-start}"

stop() {
  pkill -f "wrangler dev" 2>/dev/null && echo "Stopped wrangler dev." || echo "wrangler dev was not running."
  pkill -f "dev-server.py" 2>/dev/null && echo "Stopped dev-server.py." || echo "dev-server.py was not running."
}

case "$cmd" in
  stop) stop ;;
  status)
    pgrep -fl "wrangler dev" || echo "wrangler dev: not running"
    pgrep -fl "dev-server.py" || echo "dev-server.py: not running"
    ;;
  start)
    if pgrep -f "wrangler dev" > /dev/null || pgrep -f "dev-server.py" > /dev/null; then
      echo "Local stack already running - run '$0 stop' first." >&2
      exit 1
    fi
    if [ "${2:-}" != "--no-sync" ]; then
      "$ROOT/worker/sync-from-prod.sh"
    fi
    mkdir -p "$LOG_DIR"
    (cd "$ROOT/worker" && nohup npx wrangler dev --config wrangler.toml > "$LOG_DIR/wrangler.log" 2>&1 < /dev/null &)
    (cd "$ROOT" && nohup python3 dev-server.py > "$LOG_DIR/dev-server.log" 2>&1 < /dev/null &)
    echo "Builder:  http://localhost:8777/index.html"
    echo "Worker:   http://localhost:8787"
    echo "Logs:     $LOG_DIR"
    ;;
  *) echo "Usage: $0 [start [--no-sync]|stop|status]" >&2; exit 1 ;;
esac
