// config.js - single source of truth for external service URLs.
//
// Same-origin: the site Worker (src/index.js) forwards /api/* to the
// reelplayer-api Worker over a service binding. Root-relative, so it works
// on whichever host served the page (custom domain or workers.dev) - every
// caller is a fetch from our own builder/player/page, never from markup
// placed on a third-party site.
const PROD_WORKER_BASE_URL = "/api";

// dev-server.py serves the builder/player from localhost - when it does,
// point at a Worker also running locally (`npx wrangler dev` from worker/,
// default port 8787) instead of the live production Worker/KV. Without
// this, every local frontend session still read/wrote real production
// data, so any mistake while testing (a stray draft, a bad publish) had to
// be manually cleaned up in prod. A real embed (player.html/page.html on
// whatever site hosts it) is never served from localhost, so this never
// affects anything outside local dev.
const isLocalDev = ["localhost", "127.0.0.1"].includes(window.location.hostname);

export const WORKER_BASE_URL = isLocalDev ? "http://localhost:8787" : PROD_WORKER_BASE_URL;

// Base URL for the R2 bucket's public custom domain (connected via the R2
// bucket's Settings > Custom Domains, fronted by Cloudflare's CDN - not the
// pub-*.r2.dev dev URL, which is rate-limited and skips Cloudflare caching).
// Media files are served directly from R2, not proxied through the Worker -
// construct a file's URL as `${R2_PUBLIC_URL}/${key}`.
export const R2_PUBLIC_URL = "https://media.boxedape.com";
