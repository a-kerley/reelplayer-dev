// config.js - single source of truth for external service URLs.
//
// Update WORKER_BASE_URL after deploying the Cloudflare Worker in worker/
// (see worker/README.md). Both player.html and embedExporter.js/embedManager.js
// import this so there's exactly one place to change it.
export const WORKER_BASE_URL = "https://reelplayer-api.ali-27a.workers.dev";

// Base URL for the R2 bucket's public custom domain (connected via the R2
// bucket's Settings > Custom Domains, fronted by Cloudflare's CDN - not the
// pub-*.r2.dev dev URL, which is rate-limited and skips Cloudflare caching).
// Media files are served directly from R2, not proxied through the Worker -
// construct a file's URL as `${R2_PUBLIC_URL}/${key}`.
export const R2_PUBLIC_URL = "https://media.boxedape.com";
