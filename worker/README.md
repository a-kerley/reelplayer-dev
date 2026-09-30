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

Auth is Cloudflare Access - there's no password to set. The builder runs on
`reels-admin.boxedape.com`, protected by an Access application (Zero Trust
→ Access → Applications: email one-time PIN, `@boxedape.com` only, 1-month
session). `wrangler.toml`'s `[vars]` holds that application's team domain
and audience tag, which this Worker uses to verify each request's Access
token. Adding someone means adding their email/domain to the Access policy,
not sharing a secret.

Deploy (from the repo root):

```bash
npx wrangler deploy --config worker/wrangler.toml
```

Clients reach it same-origin at `/api/*` - the site Worker (`src/index.js`)
forwards those over a service binding - so nothing in `js/config.js` needs
this Worker's own URL.

## Local development

To run the Worker locally before deploying (useful for testing):

```bash
npx wrangler dev
```

Run it from *this* `worker/` directory - `npx wrangler dev`/`deploy` reads
whatever `wrangler.toml`/`wrangler.jsonc` is in the current directory, and
the repo root has its own (`wrangler.jsonc`, the separate static-assets
`reelplayer-app` project) - running either command from the wrong directory
silently targets/deploys that one instead. If unsure, pass
`--config wrangler.toml` explicitly.

Local KV/R2 state persists under `worker/.wrangler` (gitignored) and starts
empty - a fresh `wrangler dev` has no reels/pages/cards until you publish
something to it. `js/config.js`'s `WORKER_BASE_URL` automatically points the
builder at `http://localhost:8787` when it's served from `localhost` (e.g.
via `python3 dev-server.py`), so running both together - `wrangler dev`
here and `dev-server.py` at the repo root - gives a fully local loop with no
reads/writes against production data. No sign-in is needed locally:
`worker/.dev.vars` sets `LOCAL_DEV_AUTH=1`, which makes `wrangler dev` on
localhost trust every request (it's never deployed, and the Worker also
checks the hostname). Create it if it's missing:

```bash
echo "LOCAL_DEV_AUTH=1" > .dev.vars
```

Then from another terminal:

```bash
# Store a reel (signed-in only; no sign-in needed locally)
curl -X POST http://localhost:8787/reels/test123 \
  -H "Content-Type: application/json" \
  -d '{"id":"test123","title":"Test"}'

# Fetch it (public, no auth needed)
curl http://localhost:8787/reels/test123

# List all reels (signed-in only; no sign-in needed locally)
curl http://localhost:8787/reels

# Delete it (signed-in only; no sign-in needed locally)
curl -X DELETE http://localhost:8787/reels/test123
```

## Drafts (auto-saved in-progress reels)

Separate from published reels above - these back the builder's own
auto-save, so the reel list is available from any browser that can reach
the (signed-in only; no sign-in needed locally) builder page. Same KV namespace, a different key
prefix (`draft_<id>` vs `reel_<id>`), different JSON shape (the raw builder
form data, not the published/export shape), and - unlike `/reels/:id` -
**every** draft route requires a signed-in session, including GET, since drafts
have no legitimate anonymous reader:

```bash
# Save/update a draft (signed-in only; no sign-in needed locally) - updatedAt is stamped server-side
curl -X POST http://localhost:8787/drafts/test123 \
  -H "Content-Type: application/json" \
  -d '{"id":"test123","title":"Test Draft"}'

# Fetch it (signed-in only - NOT public, unlike /reels/:id)
curl http://localhost:8787/drafts/test123

# List all drafts (signed-in only; no sign-in needed locally)
curl http://localhost:8787/drafts

# Delete it (signed-in only; no sign-in needed locally)
curl -X DELETE http://localhost:8787/drafts/test123
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
# Save/update a page draft (signed-in only; no sign-in needed locally) - updatedAt is stamped server-side
curl -X POST http://localhost:8787/drafts/pages/test123 \
  -H "Content-Type: application/json" \
  -d '{"id":"test123","title":"Test Page","blocks":[]}'

# Fetch it (signed-in only - drafts are never public)
curl http://localhost:8787/drafts/pages/test123

# List all page drafts (signed-in only; no sign-in needed locally)
curl http://localhost:8787/drafts/pages

# Delete a page draft (signed-in only; no sign-in needed locally)
curl -X DELETE http://localhost:8787/drafts/pages/test123

# Publish (signed-in only; no sign-in needed locally) - id/slug required, previousSlug only when renaming.
# analyticsEnabled/backgroundImageEnabled/backgroundImage/backgroundBlur/
# backgroundParallaxMode/contentOverlayColor/contentOverlayOpacity/
# contentOverlayFullBleed/contentOverlayMarginVertical/
# contentOverlayMarginHorizontal/contentMaxWidth/contentPaddingTop/
# contentPaddingBottom are all optional, defaulting to
# off/empty/12/"fixed"/"#000000"/0/false/0/0/900/0/0.
curl -X POST http://localhost:8787/pages/my-page-slug \
  -H "Content-Type: application/json" \
  -d '{"id":"test123","slug":"my-page-slug","title":"Test Page","blocks":[],"backgroundImageEnabled":true,"backgroundImage":"https://media.boxedape.com/images/page-backgrounds/example.jpg","backgroundBlur":12,"backgroundParallaxMode":"fixed","contentOverlayColor":"#000000","contentOverlayOpacity":40}'

# Fetch the published page (public, no auth needed - this is what page.html fetches)
curl http://localhost:8787/pages/my-page-slug

# List all published pages (signed-in only; no sign-in needed locally)
curl http://localhost:8787/pages

# Delete a published page (signed-in only; no sign-in needed locally)
curl -X DELETE http://localhost:8787/pages/my-page-slug
```

## Stats (opt-in per-reel/per-page analytics)

Each reel/page/card has an `analyticsEnabled` flag (off by default). When on,
`player.html`/`page.html` POST small "view"/"play" beacons to this Worker,
stored as individual `stat_<type>_<stableId>_<timestamp>_<rand>` KV entries
in the same `REELS` namespace, each expiring after ~13 months. `<stableId>`
is the item's draft id, resolved from whatever id the embed used, so
republishes and Page/Card embeds share one history. No aggregation happens
server-side, since expected volume is low; the builder's "View Stats" modal
fetches the raw list and summarizes it client-side. Visitors sending Global
Privacy Control / Do Not Track, and any browser that has opened the builder,
are never counted. The POST route is public (called from
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

# Fetch raw events for a target by its stable draft id, newest first
# (signed-in only; no sign-in needed locally). Optional repeatable ?alias=<id> merges in events filed
# under an older id the Worker can't look up itself.
curl http://localhost:8787/stats/reel/reel-1234567890

# Same shape for pages (page draft id) and cards (card draft id)
curl http://localhost:8787/stats/page/page-1234567890
```

## Redeploying after changes

Any time `worker/src/index.js` changes, pushing to `main` redeploys it (Workers Builds, see `CLAUDE.md` in this directory); `npx wrangler deploy` from this directory still works as a manual fallback. The URL stays the same, so `js/config.js` doesn't need updating unless you tear down and recreate the Worker itself.

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

Media routes (`/media/upload`, `/media/list`, `/media/rename`, `/media/delete`) use the same Cloudflare Access check as every other signed-in route — nothing new to configure there.

```bash
# Upload a file (signed-in only; no sign-in needed locally)
curl -X POST "http://localhost:8787/media/upload?key=audio/test.mp3" \
  -H "Content-Type: audio/mpeg" \
  --data-binary @/path/to/test.mp3

# List files under a prefix (signed-in only; no sign-in needed locally) - add &flat=1 for a full recursive list
curl "http://localhost:8787/media/list?prefix=audio/"

# Rename (signed-in only; no sign-in needed locally)
curl -X POST http://localhost:8787/media/rename \
  -H "Content-Type: application/json" \
  -d '{"from":"audio/test.mp3","to":"audio/renamed.mp3"}'

# Delete (signed-in only; no sign-in needed locally)
curl -X DELETE "http://localhost:8787/media/delete?key=audio/renamed.mp3"
```

## What this does *not* do

This only stores reel *configuration* (track titles, URLs, colors, settings) as small JSON — a few KB per reel — in KV, and media *files* in R2. It does not do adaptive-bitrate video streaming/transcoding (that would be Cloudflare Stream, a different, paid product, not needed since the player just plays plain files).

The builder's entry page and this API are protected by the same Cloudflare Access session: Access guards all of `reels-admin.boxedape.com` at the edge, and this Worker independently verifies the Access token on every signed-in route (it's also reachable on public hosts, so it can't rely on the edge alone).
