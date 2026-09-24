#!/usr/bin/env bash
# Mirrors production KV (reels, pages, cards, and their drafts) into the
# local test server's KV (worker/.wrangler, used by `wrangler dev` +
# dev-server.py) - read-only against production, never writes there.
#
# R2 media is NOT mirrored: js/config.js's R2_PUBLIC_URL always points at
# the real media.boxedape.com CDN regardless of environment, so local dev
# already renders real media without a local copy.
#
# Four KV prefixes cover every content key (see worker/src/index.js):
#   reel_    - published reels (reel_<id>) AND their reel_stable_<id>
#              "live-" aliases, which also start with reel_
#   draft_   - in-progress reel/page/card drafts (draft_<id>,
#              draft_page_<id>, draft_card_<id> all start with draft_)
#   page_    - published pages (page_<slug>)
#   card_    - published cards (card_<id>)
# Deliberately excluded: stat_* (analytics beacons - noisy, private, not
# "content") and folder_meta_* (Media Library folder UI state).
#
# Usage: ./sync-from-prod.sh   (run from worker/)
set -euo pipefail
cd "$(dirname "$0")"

PREFIXES=(reel_ draft_ page_ card_)
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

for prefix in "${PREFIXES[@]}"; do
  # --config wrangler.toml is required - wrangler otherwise silently picks
  # up the root wrangler.jsonc (the static-assets project), same gotcha
  # worker/README.md warns about for `wrangler dev`.
  keys=$(npx wrangler kv key list --binding REELS --remote --config wrangler.toml --prefix "$prefix" 2>/dev/null | jq -r '.[].name')
  if [ -z "$keys" ]; then
    continue
  fi
  while IFS= read -r key; do
    echo "Syncing $key"
    npx wrangler kv key get "$key" --binding REELS --remote --config wrangler.toml --text > "$TMP" 2>/dev/null
    npx wrangler kv key put "$key" --binding REELS --local --config wrangler.toml --path "$TMP" > /dev/null
  done <<< "$keys"
done

echo "Done - local KV now mirrors production reels/pages/cards + drafts."
