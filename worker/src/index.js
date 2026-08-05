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
//   GET    /drafts/:id      - password-gated (NOT public, unlike /reels/:id - drafts have no
//                             legitimate anonymous consumer), returns the stored draft JSON or 404
//   POST   /drafts/:id      - password-gated, stores the JSON body (stamps updatedAt server-side)
//   GET    /drafts          - password-gated, lists {id, title, createdAt, updatedAt} for every draft
//   DELETE /drafts/:id      - password-gated, removes the entry
//   POST   /media/upload    - password-gated, ?key=<key>, body = raw file bytes
//   GET    /media/list      - password-gated, ?prefix=<prefix>, lists folders/files under it
//   POST   /media/rename    - password-gated, body {from, to}
//   DELETE /media/delete    - password-gated, ?key=<key>
//
// Drafts (in-progress builder reels, auto-saved as the user edits) use a
// separate `draft_<id>` key prefix in the same REELS namespace as published
// reels (`reel_<id>`) - same store, disjoint keys, different JSON shape (the
// raw flat builder object, not the nested settings:{} export shape) and
// different visibility (drafts are never public, since only the password-
// gated builder itself ever needs to read them - unlike a published reel,
// which anonymous visitors' browsers must be able to fetch anywhere it's
// embedded).

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

const AUDIO_EXTS = ["mp3", "wav", "ogg", "opus", "flac", "aac", "m4a", "alac"];
function isAudioKey(key) {
  const ext = key.split(".").pop().toLowerCase();
  return AUDIO_EXTS.includes(ext);
}

// Pulls the track number out of an ID3v2 tag at the front of an audio
// file's bytes, if present. Only handles the common ID3v2.3/2.4 case
// (ID3v1, which lives in a trailer at the *end* of the file, would need a
// separate read - skipped, since most modern encoders write ID3v2 anyway).
// Never throws - worst case, returns null and the upload proceeds with no
// track-number metadata.
function extractTrackNumber(buf) {
  try {
    if (buf.length < 10) return null;
    // "ID3" magic, then major version byte (3 or 4 supported), revision,
    // flags, then a 4-byte syncsafe size (7 bits used per byte).
    if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return null; // not "ID3"
    const majorVersion = buf[3];
    if (majorVersion !== 3 && majorVersion !== 4) return null;
    const tagSize =
      ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    const tagEnd = Math.min(10 + tagSize, buf.length);

    let offset = 10;
    const frameHeaderSize = 10; // 4-byte id + 4-byte size + 2-byte flags (v2.3/v2.4)
    while (offset + frameHeaderSize <= tagEnd) {
      const frameId = String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
      if (frameId === "\0\0\0\0") break; // padding reached

      const frameSize =
        majorVersion === 4
          ? ((buf[offset + 4] & 0x7f) << 21) | ((buf[offset + 5] & 0x7f) << 14) |
            ((buf[offset + 6] & 0x7f) << 7) | (buf[offset + 7] & 0x7f)
          : (buf[offset + 4] << 24) | (buf[offset + 5] << 16) | (buf[offset + 6] << 8) | buf[offset + 7];

      const frameDataStart = offset + frameHeaderSize;
      const frameDataEnd = frameDataStart + frameSize;

      if (frameId === "TRCK" && frameDataEnd <= buf.length) {
        const encodingByte = buf[frameDataStart];
        const textBytes = buf.slice(frameDataStart + 1, frameDataEnd);
        let text;
        if (encodingByte === 0 || encodingByte === 3) {
          // ISO-8859-1 or UTF-8 - both fine to decode as UTF-8 for ASCII digits.
          text = new TextDecoder("utf-8").decode(textBytes);
        } else {
          // UTF-16 (with or without BOM) - rare for a numeric field, but handle it.
          text = new TextDecoder("utf-16").decode(textBytes);
        }
        const trackNumber = text.replace(/\0/g, "").trim().split("/")[0].trim();
        return trackNumber || null;
      }

      offset = frameDataEnd;
    }

    return null;
  } catch {
    return null;
  }
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

    // GET /drafts - list all drafts (builder sidebar), password-gated
    if (pathname === "/drafts" && request.method === "GET") {
      if (!isAuthorized(request, env)) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const list = await env.REELS.list({ prefix: "draft_" });
      const entries = await Promise.all(
        list.keys.map(async (key) => {
          const value = await env.REELS.get(key.name);
          if (!value) return null;
          try {
            const parsed = JSON.parse(value);
            return { id: parsed.id, title: parsed.title, createdAt: parsed.createdAt, updatedAt: parsed.updatedAt };
          } catch {
            return null;
          }
        })
      );
      return jsonResponse(entries.filter(Boolean));
    }

    // /drafts/:id - unlike /reels/:id, every method here is password-gated:
    // drafts have no legitimate anonymous consumer (only the builder itself
    // ever reads them), so there's no reason for GET to be public here.
    const draftMatch = pathname.match(/^\/drafts\/([a-zA-Z0-9_-]+)$/);
    if (draftMatch) {
      const key = `draft_${draftMatch[1]}`;

      if (request.method === "GET") {
        if (!isAuthorized(request, env)) {
          return jsonResponse({ error: "Unauthorized" }, 401);
        }
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
        let body;
        try {
          body = JSON.parse(await request.text());
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }
        // Stamped server-side, not trusted from the client, so "most
        // recently edited" sort order stays correct regardless of client
        // clock skew.
        body.updatedAt = Date.now();
        await env.REELS.put(key, JSON.stringify(body));
        return jsonResponse({ ok: true, updatedAt: body.updatedAt });
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

      let uploadBody = request.body;
      let customMetadata;
      if (isAudioKey(key)) {
        // Buffer the whole upload so we can both scan it for an ID3 tag and
        // write it to R2 - simpler and more robust than trying to tee the
        // request stream and read both branches independently.
        const bytes = new Uint8Array(await request.arrayBuffer());
        uploadBody = bytes;
        const trackNumber = extractTrackNumber(bytes);
        if (trackNumber) customMetadata = { trackNumber };
      }

      await env.MEDIA.put(key, uploadBody, {
        httpMetadata: { contentType },
        ...(customMetadata ? { customMetadata } : {}),
      });
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
          include: ["customMetadata"],
        });
        if (!flat) {
          folders.push(...(list.delimitedPrefixes || []).map((p) => p.replace(/\/$/, "")));
        }
        files.push(...list.objects.map((obj) => ({
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded,
          trackNumber: obj.customMetadata?.trackNumber || null,
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
      await env.MEDIA.put(to, existing.body, {
        httpMetadata: existing.httpMetadata,
        customMetadata: existing.customMetadata,
      });
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
