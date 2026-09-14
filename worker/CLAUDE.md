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

Project Cards (`docs/project-cards/PLAN.md`) are a third content type in
the same namespace, following the reel convention (`card_<id>` published,
`draft_card_<id>` in-progress - content-hash id, no slug/rename
machinery, unlike pages). `GET /cards/:id` inlines the referenced reel
into the response (`{...card, reel: <reelData|null>}`) rather than
requiring the client to make a second request.

- Opt-in per-item analytics (`reel.analyticsEnabled`/`page.analyticsEnabled`/
  `card.analyticsEnabled`, default `false`) stores raw view/play events under
  `stat_<type>_<id>_<ts>_<rand>` (`<type>` is `reel`, `page`, or `card`) in
  the same `REELS` namespace - one KV entry per beacon, no server-side
  aggregation (the builder's "View Stats" modal sums/groups client-side).
  `POST /stats/:type/:id` is public but only writes if the target exists
  and has opted in, re-checked on every beacon - see `worker/README.md`'s
  "Stats" section. A card's own play events (`player.html`'s
  `analyticsStatsType`/`analyticsStatsId`) always target the *card's* id,
  never its referenced reel's - the card is the marketing unit on the host
  page, so it gets its own stats independent of the reel's standalone
  embed stats.
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
