// Cloudflare Worker backing the ReelPlayer embed system.
//
// Stores each published reel's config JSON in KV under the key `reel_<id>`,
// so player.html can fetch it by ID from any origin (fixing the previous
// localStorage-only approach, which only ever worked in the same browser
// that ran the export).
//
// Routes:
//   GET    /reels/:id  - public, returns the stored reel JSON or 404
//   POST   /reels/:id  - password-gated, stores the JSON body
//   GET    /reels      - password-gated, lists {id, title, created} for every stored reel
//   DELETE /reels/:id  - password-gated, removes the entry

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function isAuthorized(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer (.+)$/);
  return !!match && match[1] === env.BUILDER_PASSWORD;
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // GET /reels - list all published reels (management view)
    if (pathname === "/reels" && request.method === "GET") {
      if (!isAuthorized(request, env)) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const list = await env.REELS.list();
      const entries = await Promise.all(
        list.keys.map(async (key) => {
          const value = await env.REELS.get(key.name);
          if (!value) return null;
          try {
            const parsed = JSON.parse(value);
            return { id: parsed.id, title: parsed.title, created: parsed.created };
          } catch {
            return null;
          }
        })
      );
      return jsonResponse(entries.filter(Boolean));
    }

    // /reels/:id
    const match = pathname.match(/^\/reels\/([a-zA-Z0-9_-]+)$/);
    if (match) {
      const key = `reel_${match[1]}`;

      if (request.method === "GET") {
        const value = await env.REELS.get(key);
        if (!value) return jsonResponse({ error: "Not found" }, 404);
        return new Response(value, {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }

      if (request.method === "POST") {
        if (!isAuthorized(request, env)) {
          return jsonResponse({ error: "Unauthorized" }, 401);
        }
        const body = await request.text();
        try {
          JSON.parse(body);
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }
        await env.REELS.put(key, body);
        return jsonResponse({ ok: true });
      }

      if (request.method === "DELETE") {
        if (!isAuthorized(request, env)) {
          return jsonResponse({ error: "Unauthorized" }, 401);
        }
        await env.REELS.delete(key);
        return jsonResponse({ ok: true });
      }
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
};
