# Cloudflare backend

Reel publishing, page publishing, and the Media Library are backed by a
Cloudflare Worker + KV (reel/page JSON) + R2 (media files) — see
`worker/README.md` for setup. `js/config.js` holds the live
`WORKER_BASE_URL` and `R2_PUBLIC_URL`.

Pages share the same `REELS` KV namespace as reels, under their own key
prefixes (`page_<slug>` published, `draft_page_<id>` in-progress) — see
`worker/src/index.js`'s header comment for the full route list. Unlike a
reel's embed id, a page's `slug` is user-editable after first publish; the
`POST /pages/:slug` route accepts an optional `previousSlug` in the body to
clean up the old entry when renaming, and rejects a genuine collision
(the slug already used by a *different* page's `id`) with `409`.

- `worker/secret` holds the plaintext shared password locally and is
  gitignored — never let it leak into a committed file. Grep for it before
  committing if you've touched worker/auth-related code.
- Publish/manage/upload routes are gated by `Authorization: Bearer
  <BUILDER_PASSWORD>`, checked via `isAuthorized()` in `worker/src/index.js`.
  Read-only media serving is public, via R2's custom domain
  (`media.boxedape.com`, not the rate-limited `pub-*.r2.dev` dev URL) fronted
  by a Cloudflare Cache Rule for edge caching.
- The builder + player static site itself (`index.html`/`player.html`/`css`/
  `js`) deploys via a root-level `wrangler.jsonc` as a Cloudflare Workers
  static-assets project (`reelplayer-app`), auto-deploying on push to `main`.
  `src/index.js` gates just the builder's entry page (`/` and `/index.html`)
  behind a shared password (`BUILDER_ACCESS_PASSWORD` secret, separate from
  `BUILDER_PASSWORD`) - `/player` and every asset it needs stay fully public,
  since anonymous visitors load those wherever a reel is embedded.
