// Cloudflare Worker backing the ReelPlayer embed system.
//
// Stores each published reel's config JSON in KV under the key `reel_<id>`,
// so player.html can fetch it by ID from any origin (fixing the previous
// localStorage-only approach, which only ever worked in the same browser
// that ran the export). Also manages media files (audio/video/images) in an
// R2 bucket for the builder's Media Library - actual media bytes are served
// directly from R2's public bucket URL (see js/config.js's R2_PUBLIC_URL),
// not proxied through this Worker.
//
// Routes:
//   GET    /reels/:id       - public, returns the stored reel JSON or 404
//   POST   /reels/:id       - password-gated, stores the JSON body
//   GET    /reels           - password-gated, lists {id, title, created} for every stored reel
//   DELETE /reels/:id       - password-gated, removes the entry
//   POST   /media/upload    - password-gated, ?key=<key>, body = raw file bytes
//   GET    /media/list      - password-gated, ?prefix=<prefix>, lists folders/files under it
//   POST   /media/rename    - password-gated, body {from, to}
//   DELETE /media/delete    - password-gated, ?key=<key>

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

// Keys are user-controlled folder/file paths (e.g. "backgrounds/nature/foo.jpg").
// Reject anything that could escape the intended prefix or target a hidden/empty key.
function isValidMediaKey(key) {
  return typeof key === "string" && key.length > 0 && key.length < 1024 &&
    !key.startsWith("/") && !key.includes("..");
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

    // POST /media/upload?key=<key>
    if (pathname === "/media/upload" && request.method === "POST") {
      if (!isAuthorized(request, env)) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      const key = new URL(request.url).searchParams.get("key");
      if (!isValidMediaKey(key)) {
        return jsonResponse({ error: "Invalid key" }, 400);
      }
      const contentType = request.headers.get("Content-Type") || "application/octet-stream";
      await env.MEDIA.put(key, request.body, { httpMetadata: { contentType } });
      return jsonResponse({ key });
    }

    // GET /media/list?prefix=<prefix>[&flat=1]
    // flat=1 lists every object under the prefix recursively (no folder
    // grouping) - used by the builder's file-picker to merge R2 media into
    // its existing flat-list-based folder-tree UI. Without it, lists one
    // level at a time with folders grouped via R2's delimiter option - used
    // by the Media Library tab's own folder-by-folder browsing.
    if (pathname === "/media/list" && request.method === "GET") {
      if (!isAuthorized(request, env)) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      const params = new URL(request.url).searchParams;
      const prefix = params.get("prefix") || "";
      const flat = params.get("flat") === "1";

      const folders = [];
      const files = [];
      let cursor;
      do {
        const list = await env.MEDIA.list({
          prefix,
          ...(flat ? {} : { delimiter: "/" }),
          ...(cursor ? { cursor } : {}),
        });
        if (!flat) {
          folders.push(...(list.delimitedPrefixes || []).map((p) => p.replace(/\/$/, "")));
        }
        files.push(...list.objects.map((obj) => ({
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded,
        })));
        cursor = list.truncated ? list.cursor : undefined;
      } while (cursor);

      return jsonResponse({ folders, files });
    }

    // POST /media/rename  body: { from, to }
    if (pathname === "/media/rename" && request.method === "POST") {
      if (!isAuthorized(request, env)) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      let body;
      try {
        body = JSON.parse(await request.text());
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }
      const { from, to } = body || {};
      if (!isValidMediaKey(from) || !isValidMediaKey(to)) {
        return jsonResponse({ error: "Invalid key" }, 400);
      }
      const existing = await env.MEDIA.get(from);
      if (!existing) {
        return jsonResponse({ error: "Not found" }, 404);
      }
      await env.MEDIA.put(to, existing.body, { httpMetadata: existing.httpMetadata });
      await env.MEDIA.delete(from);
      return jsonResponse({ ok: true });
    }

    // DELETE /media/delete?key=<key>
    if (pathname === "/media/delete" && request.method === "DELETE") {
      if (!isAuthorized(request, env)) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      const key = new URL(request.url).searchParams.get("key");
      if (!isValidMediaKey(key)) {
        return jsonResponse({ error: "Invalid key" }, 400);
      }
      await env.MEDIA.delete(key);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
};
