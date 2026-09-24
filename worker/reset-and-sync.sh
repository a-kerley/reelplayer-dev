#!/usr/bin/env bash
# Clean-slate version of sync-from-prod.sh: clears local KV (draft/reel/
# page/card test data accumulated from past local sessions) before
# mirroring production back in. Run this before an offline/local test
# session when you want the test server to start as a true mirror of live,
# not live-plus-whatever-test-junk-is-lying-around.
#
# Only clears KV - R2/D1/cache are untouched. R2 isn't needed locally
# either way (see sync-from-prod.sh's own header: media always loads from
# the real CDN, regardless of environment).
#
# IMPORTANT: stop any running `wrangler dev` first - it holds the local KV
# files open, and this won't do that for you (killing your own dev server
# out from under you without asking felt like the wrong call to automate).
#
# Usage: ./reset-and-sync.sh   (run from worker/)
set -euo pipefail
cd "$(dirname "$0")"

if pgrep -f "wrangler dev" > /dev/null; then
  echo "A local 'wrangler dev' process is still running - stop it first (it holds the KV files open), then re-run this script." >&2
  exit 1
fi

rm -rf .wrangler/state/v3/kv
echo "Local KV cleared."

./sync-from-prod.sh
