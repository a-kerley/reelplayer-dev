// Gates the builder's entry page behind a shared password (HTTP Basic Auth,
// so the browser's own native login prompt handles it - no custom login page
// needed). Runs in front of every request (assets.run_worker_first in
// wrangler.jsonc), but only actually checks auth for the builder's own entry
// document - player.html, page.html, and every css/js asset they share with
// the builder must stay fully public, since they're loaded by anonymous
// visitors' browsers wherever a reel is embedded or a page link is shared.
// Everything not explicitly gated here falls straight through to static
// asset serving - except /p/<slug> (see PAGE_PATH_PATTERN below), which
// gets rewritten to page.html so a published page's clean URL works.
const PROTECTED_PATHS = new Set(["/", "/index.html"]);

// A published page's clean public URL - boxedape.com/p/<slug> instead of
// boxedape.com/page?slug=<slug>. Matches js/modules/pagePublish.js's own
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

const COOKIE_NAME = "builder_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// The cookie stores a hash of the password, not the password itself - a
// stateless "remember me" with no session store needed, since there's only
// ever one valid password to check against. Rotating BUILDER_ACCESS_PASSWORD
// automatically invalidates every previously-issued cookie, since none of
// them will hash-match the new value anymore.
async function hashPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

// Basic Auth always carries a "username:password" pair even though this gate
// only has one shared password and no concept of a username - decode it and
// check just the password half, so whatever's typed into the username field
// (blank, a name, anything) is accepted.
function extractPassword(authHeader) {
  if (!authHeader.startsWith("Basic ")) return null;
  try {
    const decoded = atob(authHeader.slice("Basic ".length));
    const colonIndex = decoded.indexOf(":");
    return colonIndex === -1 ? decoded : decoded.slice(colonIndex + 1);
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

    if (!PROTECTED_PATHS.has(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    const expectedToken = await hashPassword(env.BUILDER_ACCESS_PASSWORD);

    if (getCookie(request, COOKIE_NAME) === expectedToken) {
      return env.ASSETS.fetch(request);
    }

    const suppliedPassword = extractPassword(request.headers.get("Authorization") || "");

    if (suppliedPassword !== env.BUILDER_ACCESS_PASSWORD) {
      return new Response("Authentication required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="ReelPlayer Builder"' },
      });
    }

    // Correct password just supplied via the browser's Basic Auth prompt -
    // remember this browser for 30 days so it isn't re-prompted every visit.
    const response = await env.ASSETS.fetch(request);
    const remembered = new Response(response.body, response);
    remembered.headers.append(
      "Set-Cookie",
      `${COOKIE_NAME}=${expectedToken}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`
    );
    return remembered;
  },
};
