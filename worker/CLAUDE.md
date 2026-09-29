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
  `stat_<type>_<stableId>_<ts>_<rand>` (`<type>` is `reel`, `page`, or `card`)
  in the same `REELS` namespace - one KV entry per beacon (record duplicated
  as KV metadata so GET reads from list() alone), 13-month `expirationTtl`,
  no server-side aggregation (the builder's "View Stats" modal sums/groups
  client-side). `<stableId>` is the item's *draft* id (`sourceReelId` /
  `page.id` / `sourceCardId`), resolved server-side from whatever id the
  embed loaded (hash, `live-<id>`, slug) - so republishing, page renames and
  Page/Card embeds all feed one history. Events from before that (keyed by
  hash/slug) are merged back in on GET and moved under the stable id when
  their publish is deleted (`retireStats()`). Deleting a draft purges its
  stats best-effort (capped per request; the TTL mops up the rest).
  `POST /stats/:type/:id` is public but only writes if the target exists
  and has opted in, re-checked on every beacon - see `worker/README.md`'s
  "Stats" section. Visitor IPs are never stored (only Cloudflare's derived
  city/country), and the builder must HTML-escape anything from a stat
  record - it's written by an unauthenticated public endpoint. A card's own play events (`player.html`'s
  `analyticsStatsType`/`analyticsStatsId`) always target the *card's* id,
  never its referenced reel's - the card is the marketing unit on the host
  page, so it gets its own stats independent of the reel's standalone
  embed stats.
- Public write paths are rate-limited per IP via Workers Rate Limiting
  bindings (`worker/wrangler.toml`'s `[[ratelimits]]`): `STATS_LIMITER`
  (20 beacons/min) and `VIEW_LIMITER` (2 opens/min per target). Stat
  beacons over the limit are dropped silently. Any new public route that
  writes to KV needs the same treatment: KV's daily write allowance is
  shared with publishing, so an unlimited public write path is a way to
  lock the builder out.
- **Auth is Cloudflare Access, not a password.** The builder lives on
  `reels-admin.boxedape.com`, which an Access application protects end to
  end (email one-time PIN, `@boxedape.com` only, 1-month session). The API
  authorizes a request when it carries a valid Access JWT
  (`Cf-Access-Jwt-Assertion` header or `CF_Authorization` cookie) - signature
  checked against the team's keys, plus `aud` (`ACCESS_AUD` in
  `wrangler.toml`), `iss`, expiry and a `@boxedape.com` email. See "Auth" in
  `src/index.js`. Never trust the header on presence: this Worker is also
  reachable on the public host and its own workers.dev URL. Locally,
  `LOCAL_DEV_AUTH=1` in `worker/.dev.vars` (gitignored, never deployed)
  makes `wrangler dev` on localhost trust the machine - no sign-in. The
  builder calls the API only through `js/modules/builderAuth.js`'s
  `apiFetch()`, which also offers a fresh sign-in when the session expires.
- Read-only media serving is public, via R2's custom domain
  (`media.boxedape.com`, not the rate-limited `pub-*.r2.dev` dev URL)
  fronted by a Cloudflare Cache Rule for edge caching.
- The builder + player static site itself (`index.html`/`player.html`/`css`/
  `js`) deploys via a root-level `wrangler.jsonc` as a Cloudflare Workers
  static-assets project (`reelplayer-app`), auto-deploying on push to `main`,
  on two custom domains: `reels.boxedape.com` (public: player, `/p/<slug>`
  pages, public API) and `reels-admin.boxedape.com` (builder). `src/index.js`
  forwards `/api/*` to this Worker over a service binding and redirects the
  builder page from the public hosts to reels-admin. Adding a custom domain
  needs a local `npx wrangler deploy` (the Workers Builds token can't create
  DNS records) - everything else *in the static site* deploys on push.
- **This API Worker (`reelplayer-api`, `worker/src/index.js`) does NOT
  deploy on push.** Any change here needs a manual
  `npx wrangler deploy --config worker/wrangler.toml` from the repo root -
  until then the live API runs the old code, and a builder change that
  depends on a new route just 404s (happened with the multipart upload
  routes). Pushing only redeploys the static site.
