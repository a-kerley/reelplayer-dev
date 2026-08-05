// Gates the builder's entry page behind a shared password (HTTP Basic Auth,
// so the browser's own native login prompt handles it - no custom login page
// needed). Runs in front of every request (assets.run_worker_first in
// wrangler.jsonc), but only actually checks auth for the builder's own entry
// document - player.html and every css/js asset it shares with the builder
// must stay fully public, since they're loaded by anonymous visitors'
// browsers wherever a reel is embedded on a third-party site. Everything not
// explicitly gated here falls straight through to static asset serving.
const PROTECTED_PATHS = new Set(["/", "/index.html"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (PROTECTED_PATHS.has(url.pathname)) {
      const auth = request.headers.get("Authorization") || "";
      const expected = `Basic ${btoa(`builder:${env.BUILDER_ACCESS_PASSWORD}`)}`;

      if (auth !== expected) {
        return new Response("Authentication required", {
          status: 401,
          headers: { "WWW-Authenticate": 'Basic realm="ReelPlayer Builder"' },
        });
      }
    }

    return env.ASSETS.fetch(request);
  },
};
