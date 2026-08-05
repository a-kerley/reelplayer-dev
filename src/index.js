// Gates the builder's entry page behind a shared password (HTTP Basic Auth,
// so the browser's own native login prompt handles it - no custom login page
// needed). Runs in front of every request (assets.run_worker_first in
// wrangler.jsonc), but only actually checks auth for the builder's own entry
// document - player.html and every css/js asset it shares with the builder
// must stay fully public, since they're loaded by anonymous visitors'
// browsers wherever a reel is embedded on a third-party site. Everything not
// explicitly gated here falls straight through to static asset serving.
const PROTECTED_PATHS = new Set(["/", "/index.html"]);

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!PROTECTED_PATHS.has(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    const expectedToken = await hashPassword(env.BUILDER_ACCESS_PASSWORD);

    if (getCookie(request, COOKIE_NAME) === expectedToken) {
      return env.ASSETS.fetch(request);
    }

    const auth = request.headers.get("Authorization") || "";
    const expectedAuth = `Basic ${btoa(`builder:${env.BUILDER_ACCESS_PASSWORD}`)}`;

    if (auth !== expectedAuth) {
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
