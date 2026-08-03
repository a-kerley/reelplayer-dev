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

## What this does *not* do

This only stores reel *configuration* (track titles, URLs, colors, settings) as small JSON — a few KB per reel. It does not host or stream the actual audio/video/image files; those keep working exactly as they do today (external links, or files in `assets/` served by GitHub Pages).

There's also no page-level password gate on the builder itself — anyone with the link can open the builder UI. The password here only protects the publish/manage actions (`POST`/`GET /reels`/`DELETE`), preventing random internet traffic from writing into or reading the list of published reels.
