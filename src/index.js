// Site Worker for reelplayer-app. Only runs first for the paths listed in
// wrangler.jsonc's run_worker_first; everything else is served straight
// from static assets. Three jobs:
//
// 1. /api/* is forwarded to the reelplayer-api Worker over a service
//    binding, so the builder, player and pages call the API on their own
//    origin.
// 2. /p/<slug> serves page.html for a published page's clean URL.
// 3. The builder's entry page lives only on reels-admin.boxedape.com, which
//    Cloudflare Access protects at the edge (email one-time PIN,
//    @boxedape.com) before this Worker ever runs - so there's no password
//    check here any more. On any other host (the public reels.boxedape.com,
//    the legacy workers.dev URL) the builder page redirects there. The
//    builder's JS/CSS being publicly downloadable is fine: every action it
//    takes goes through the API, which verifies the Access session itself.
const BUILDER_HOST = "reels-admin.boxedape.com";
const BUILDER_PATHS = new Set(["/", "/index.html"]);

// A published page's clean public URL - reels.boxedape.com/p/<slug> instead
// of /page?slug=<slug>. Matches js/modules/pagePublish.js's own
// SLUG_PATTERN exactly (same character set) - keep the two in sync if
// either ever changes. A reserved, fixed prefix (rather than a bare
// /<slug> at the root) deliberately, not just for clarity - it also means
// this never needs to ask env.ASSETS.fetch() whether the ORIGINAL path
// exists first (a bare-root scheme had to, to avoid shadowing every real
// asset path, which meant a genuine 404 on that lookup had to be trusted
// as "safe to treat as a slug" - except this zone's own Cloudflare-
// dashboard-configured redirect rules got to that 404 response first and
// silently rewrote it before this Worker ever saw it, confirmed by hand:
// every unmatched path 307'd to /page regardless of what this code did).
// An exact prefix match needs none of that - it rewrites unconditionally,
// with nothing upstream able to intervene first.
const PAGE_PATH_PATTERN = /^\/p\/([a-zA-Z0-9_-]+)$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Same-origin API: /api/<route> -> the reelplayer-api Worker's /<route>.
    // new Request(url, request) keeps the method, headers (incl.
    // CF-Connecting-IP for its rate limiters and Access's JWT header),
    // body and request.cf (geo for stats).
    if (url.pathname.startsWith("/api/")) {
      const apiUrl = new URL(request.url);
      apiUrl.pathname = url.pathname.slice("/api".length);
      return env.API.fetch(new Request(apiUrl, request));
    }

    if (request.method === "GET" && PAGE_PATH_PATTERN.test(url.pathname)) {
      // Internal rewrite, not an HTTP redirect - the address bar stays at
      // /p/<slug>, and page.html itself reads the slug back out of
      // location.pathname (see page.html's init()). Rewritten to "/page"
      // (extensionless), NOT "/page.html" - env.ASSETS.fetch() applies
      // Cloudflare's own html_handling canonicalization even to this
      // internal fetch, and a literal ".html" path gets its OWN 307 back
      // to the extensionless form ("/page") rather than that file's actual
      // content - confirmed by hand: a direct request for /page.html
      // itself 307s to /page for the exact same reason, nothing to do with
      // any dashboard-configured rule. "/page" resolves straight to
      // page.html's content via that same clean-URL matching, no redirect.
      const rewritten = new URL(request.url);
      rewritten.pathname = "/page";
      return env.ASSETS.fetch(new Request(rewritten, request));
    }

    // Redirect only from the known public hosts - an allowlist of where NOT
    // to serve the builder, rather than "anything but BUILDER_HOST", so an
    // unexpected hostname can never turn into a redirect loop that locks
    // the builder out (or break localhost dev).
    const isPublicHost = url.hostname === "reels.boxedape.com" || url.hostname.endsWith(".workers.dev");
    if (BUILDER_PATHS.has(url.pathname) && isPublicHost) {
      return Response.redirect(`https://${BUILDER_HOST}/`, 302);
    }

    return env.ASSETS.fetch(request);
  },
};
