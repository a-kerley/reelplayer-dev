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

There's also no page-level password gate on the builder itself — anyone with the link can open the builder UI. The password here only protects write/list actions (publishing/managing reels, and uploading/browsing/renaming/deleting media), preventing random internet traffic from writing into or reading the list of published reels or media files.
