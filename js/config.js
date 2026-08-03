// config.js - single source of truth for external service URLs.
//
// Update WORKER_BASE_URL after deploying the Cloudflare Worker in worker/
// (see worker/README.md). Both player.html and embedExporter.js/embedManager.js
// import this so there's exactly one place to change it.
export const WORKER_BASE_URL = "https://reelplayer-api.ali-27a.workers.dev";
