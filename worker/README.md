# ReelPlayer embed API (Cloudflare Worker)

Backs the "Export Embed Code" / "Manage Published Embeds" features in the builder. Replaces the old `localStorage`-only storage, which only ever worked in the exact browser that ran the export.

## One-time setup

From this `worker/` directory:

```bash
npx wrangler login
```

This opens a browser to authorize the CLI against your Cloudflare account (free tier is plenty for this).

Create the KV namespace that stores reel data:

```bash
npx wrangler kv namespace create REELS
```

This prints something like:

```
[[kv_namespaces]]
binding = "REELS"
id = "abcd1234...."
```

Copy that `id` value into `worker/wrangler.toml`, replacing `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.

Set the shared password that gates publishing/managing reels (choose your own value when prompted):

```bash
npx wrangler secret put BUILDER_PASSWORD
```

Deploy:

```bash
npx wrangler deploy
```

This prints the Worker's live URL, e.g. `https://reelplayer-api.<your-subdomain>.workers.dev`. Paste that into `js/config.js` as `WORKER_BASE_URL`.

## Local development

To run the Worker locally before deploying (useful for testing):

```bash
npx wrangler dev
```

Then from another terminal:

```bash
# Store a reel (password-gated)
curl -X POST http://localhost:8787/reels/test123 \
  -H "Authorization: Bearer YOUR_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"id":"test123","title":"Test"}'

# Fetch it (public, no auth needed)
curl http://localhost:8787/reels/test123

# List all reels (password-gated)
curl http://localhost:8787/reels -H "Authorization: Bearer YOUR_PASSWORD"

# Delete it (password-gated)
curl -X DELETE http://localhost:8787/reels/test123 -H "Authorization: Bearer YOUR_PASSWORD"
```

## Drafts (auto-saved in-progress reels)

Separate from published reels above - these back the builder's own
auto-save, so the reel list is available from any browser that can reach
the (password-gated) builder page. Same KV namespace, a different key
prefix (`draft_<id>` vs `reel_<id>`), different JSON shape (the raw builder
form data, not the published/export shape), and - unlike `/reels/:id` -
**every** draft route requires the password, including GET, since drafts
have no legitimate anonymous reader:

```bash
# Save/update a draft (password-gated) - updatedAt is stamped server-side
curl -X POST http://localhost:8787/drafts/test123 \
  -H "Authorization: Bearer YOUR_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"id":"test123","title":"Test Draft"}'

# Fetch it (password-gated - NOT public, unlike /reels/:id)
curl http://localhost:8787/drafts/test123 -H "Authorization: Bearer YOUR_PASSWORD"

# List all drafts (password-gated)
curl http://localhost:8787/drafts -H "Authorization: Bearer YOUR_PASSWORD"

# Delete it (password-gated)
curl -X DELETE http://localhost:8787/drafts/test123 -H "Authorization: Bearer YOUR_PASSWORD"
```

## Pages (standalone shareable pages built from blocks)

A second, parallel content type alongside reels - a page is an ordered list
of content blocks (image banner, text, player, image) published to its own
public, shareable URL (`page.html?slug=<slug>`, see `page.html`). Same KV
namespace, `page_<slug>` for published pages and `draft_page_<id>` for
in-progress drafts - mirrors the reel/draft split above almost exactly, with
one difference: a page is keyed publicly by its **slug**, which is editable
and renameable after first publish (unlike a reel's embed id, which never
changes). Publishing sends the page's stable `id`, its desired `slug`, and -
if renaming - the `previousSlug` being replaced, so the old slug's entry can
be cleaned up and a genuine collision (the new slug already used by a
*different* page) can be rejected with `409`:

```bash
# Save/update a page draft (password-gated) - updatedAt is stamped server-side
curl -X POST http://localhost:8787/drafts/pages/test123 \
  -H "Authorization: Bearer YOUR_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"id":"test123","title":"Test Page","blocks":[]}'

# Fetch it (password-gated - drafts are never public)
curl http://localhost:8787/drafts/pages/test123 -H "Authorization: Bearer YOUR_PASSWORD"

# List all page drafts (password-gated)
curl http://localhost:8787/drafts/pages -H "Authorization: Bearer YOUR_PASSWORD"

# Delete a page draft (password-gated)
curl -X DELETE http://localhost:8787/drafts/pages/test123 -H "Authorization: Bearer YOUR_PASSWORD"

# Publish (password-gated) - id/slug required, previousSlug only when renaming.
# analyticsEnabled/backgroundImageEnabled/backgroundImage/backgroundBlur/
# backgroundParallaxMode/contentOverlayColor/contentOverlayOpacity/
# contentOverlayFullBleed/contentOverlayMarginVertical/
# contentOverlayMarginHorizontal/contentMaxWidth/contentPaddingTop/
# contentPaddingBottom are all optional, defaulting to
# off/empty/12/"fixed"/"#000000"/0/false/0/0/900/0/0.
curl -X POST http://localhost:8787/pages/my-page-slug \
  -H "Authorization: Bearer YOUR_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"id":"test123","slug":"my-page-slug","title":"Test Page","blocks":[],"backgroundImageEnabled":true,"backgroundImage":"https://media.boxedape.com/images/page-backgrounds/example.jpg","backgroundBlur":12,"backgroundParallaxMode":"fixed","contentOverlayColor":"#000000","contentOverlayOpacity":40}'

# Fetch the published page (public, no auth needed - this is what page.html fetches)
curl http://localhost:8787/pages/my-page-slug

# List all published pages (password-gated)
curl http://localhost:8787/pages -H "Authorization: Bearer YOUR_PASSWORD"

# Delete a published page (password-gated)
curl -X DELETE http://localhost:8787/pages/my-page-slug -H "Authorization: Bearer YOUR_PASSWORD"
```

## Stats (opt-in per-reel/per-page analytics)

Each reel/page has an `analyticsEnabled` flag (off by default). When on,
`player.html`/`page.html` POST small "view"/"play" beacons to this Worker,
stored as individual `stat_<type>_<id>_<timestamp>_<rand>` KV entries in
the same `REELS` namespace - no aggregation happens server-side, since
expected volume is low; the builder's "View Stats" modal fetches the raw
list and summarizes it client-side. The POST route is public (called from
any visitor's browser) but is a no-op unless the target exists and has
opted in - flip `analyticsEnabled` off and the Worker immediately stops
accepting further beacons for it, regardless of what a stale client sends:

```bash
# Record a view (public, no auth) - only writes if reel_test123 exists and analyticsEnabled=true
curl -X POST http://localhost:8787/stats/reel/test123 \
  -H "Content-Type: application/json" \
  -d '{"event":"view","sessionId":"abc123"}'

# Record a play/listen segment (public, no auth)
curl -X POST http://localhost:8787/stats/reel/test123 \
  -H "Content-Type: application/json" \
  -d '{"event":"play","sessionId":"abc123","trackIndex":0,"trackTitle":"Track One","listenSeconds":42}'

# Fetch raw events for a target, newest first (password-gated)
curl http://localhost:8787/stats/reel/test123 -H "Authorization: Bearer YOUR_PASSWORD"

# Same shape for pages, keyed by slug instead of id
curl http://localhost:8787/stats/page/my-page-slug -H "Authorization: Bearer YOUR_PASSWORD"
```

## Redeploying after changes

Any time `worker/src/index.js` changes, run `npx wrangler deploy` again from this directory. The URL stays the same, so `js/config.js` doesn't need updating unless you tear down and recreate the Worker itself.

## Media Library setup (R2)

The builder's "Media Library" tab and its file-picker integration need an R2 bucket. From this `worker/` directory:

```bash
npx wrangler r2 bucket create reelplayer-media
```

Enable public read access (gives you a `pub-<hash>.r2.dev` URL that serves files directly, with no Worker involvement for reads):

```bash
npx wrangler r2 bucket dev-url enable reelplayer-media
```

Note the printed `pub-<hash>.r2.dev` URL and paste it into `js/config.js` as `R2_PUBLIC_URL`.

Set the bucket's CORS policy so media can be loaded cross-origin (needed for embeds on any third-party site) — the policy is already written to `worker/r2-cors.json`:

```bash
npx wrangler r2 bucket cors set reelplayer-media --file r2-cors.json
```

`worker/wrangler.toml` already has the `[[r2_buckets]]` binding (`MEDIA` → `reelplayer-media`) pointing the Worker at this bucket — just redeploy:

```bash
npx wrangler deploy
```

Media routes (`/media/upload`, `/media/list`, `/media/rename`, `/media/delete`) use the same `BUILDER_PASSWORD` secret already set up for reels — nothing new to configure there.

```bash
# Upload a file (password-gated)
curl -X POST "http://localhost:8787/media/upload?key=audio/test.mp3" \
  -H "Authorization: Bearer YOUR_PASSWORD" \
  -H "Content-Type: audio/mpeg" \
  --data-binary @/path/to/test.mp3

# List files under a prefix (password-gated) - add &flat=1 for a full recursive list
curl "http://localhost:8787/media/list?prefix=audio/" -H "Authorization: Bearer YOUR_PASSWORD"

# Rename (password-gated)
curl -X POST http://localhost:8787/media/rename \
  -H "Authorization: Bearer YOUR_PASSWORD" -H "Content-Type: application/json" \
  -d '{"from":"audio/test.mp3","to":"audio/renamed.mp3"}'

# Delete (password-gated)
curl -X DELETE "http://localhost:8787/media/delete?key=audio/renamed.mp3" -H "Authorization: Bearer YOUR_PASSWORD"
```

## What this does *not* do

This only stores reel *configuration* (track titles, URLs, colors, settings) as small JSON — a few KB per reel — in KV, and media *files* in R2. It does not do adaptive-bitrate video streaming/transcoding (that would be Cloudflare Stream, a different, paid product, not needed since the player just plays plain files).

The builder's entry page itself is gated separately (HTTP Basic Auth via a `BUILDER_ACCESS_PASSWORD` secret on the static-assets Worker that serves the builder/player site - see the root `wrangler.jsonc`/`src/index.js`, not this one). That page gate is a different mechanism protecting a different origin - it does not cover this Worker's API routes, which is why drafts and publish/media actions all still require `BUILDER_PASSWORD` here on every request regardless of whether the caller already passed the page gate.
