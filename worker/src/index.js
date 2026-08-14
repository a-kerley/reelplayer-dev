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
//   GET    /reels/:id         - public, returns the stored reel JSON or 404
//   POST   /reels/:id         - password-gated, stores the JSON body
//   GET    /reels             - password-gated, lists {id, title, created} for every stored reel
//   DELETE /reels/:id         - password-gated, removes the entry
//   GET    /drafts/:id        - password-gated (NOT public, unlike /reels/:id - drafts have no
//                               legitimate anonymous consumer), returns the stored draft JSON or 404
//   POST   /drafts/:id        - password-gated, stores the JSON body (stamps updatedAt server-side)
//   GET    /drafts            - password-gated, lists {id, title, createdAt, updatedAt,
//                               publishedEmbedId, publishedAt, locked} for every draft
//   DELETE /drafts/:id        - password-gated, removes the entry
//   GET    /pages/:slug       - public, returns the stored published-page JSON or 404
//   POST   /pages/:slug       - password-gated, body {id, slug, previousSlug?, title, blocks,
//                               analyticsEnabled?, backgroundImageEnabled?, backgroundImage?,
//                               backgroundBlur?, backgroundParallaxMode?, contentOverlayColor?,
//                               contentOverlayOpacity?, contentOverlayFullBleed?,
//                               contentOverlayMarginVertical?, contentOverlayMarginHorizontal?,
//                               contentMaxWidth?, contentPaddingTop?, contentPaddingBottom?,
//                               textStyleDefs?}; 409
//                               if `slug` is already used by a different page's `id`. Deletes the
//                               `previousSlug` entry first if renaming, so old slugs don't linger.
//   GET    /pages             - password-gated, lists {id, slug, title, published} for every page
//   DELETE /pages/:slug       - password-gated, removes the entry
//   GET    /drafts/pages/:id  - password-gated, same visibility rules as /drafts/:id
//   POST   /drafts/pages/:id  - password-gated, stores the JSON body (stamps updatedAt server-side)
//   GET    /drafts/pages      - password-gated, lists {id, title, slug, createdAt, updatedAt,
//                               publishedSlug, locked}
//   DELETE /drafts/pages/:id  - password-gated, removes the entry
//   POST   /media/upload      - password-gated, ?key=<key>, body = raw file bytes
//   GET    /media/list        - password-gated, ?prefix=<prefix>, lists folders/files under it
//   POST   /media/rename      - password-gated, body {from, to}. Also scans every reel/page
//                               (published and draft) for a stored URL pointing at `from` and
//                               rewrites it to `to` in place - a rename/move never silently
//                               orphans a reference (see findMediaReferences()).
//   GET    /media/usages      - password-gated, ?key=<key>, read-only preview of exactly what
//                               that rewrite above would touch - {matches: [{key, type, title}]}
//   DELETE /media/delete      - password-gated, ?key=<key>
//   POST   /stats/:type/:id   - public, body {event, sessionId, trackIndex?, trackTitle?,
//                               listenSeconds?}; :type is "reel" or "page". No-ops (200, no
//                               write) unless the target exists and has analyticsEnabled=true.
//   GET    /stats/:type/:id   - password-gated, lists every raw stat event for that target,
//                               newest first - the builder aggregates client-side.
//
// Drafts (in-progress builder reels/pages, auto-saved as the user edits) use
// a separate `draft_<id>` / `draft_page_<id>` key prefix in the same REELS
// namespace as published reels/pages (`reel_<id>` / `page_<slug>`) - same
// store, disjoint keys, different JSON shape (the raw flat builder object,
// not the nested settings:{}/blocks:[] export shape) and different
// visibility (drafts are never public, since only the password-gated
// builder itself ever needs to read them - unlike a published reel or page,
// which anonymous visitors' browsers must be able to fetch anywhere it's
// embedded/shared).
//
// Pages are keyed by `slug` (a user-editable, renameable public identifier)
// rather than a stable id, unlike reels which are keyed by their immutable
// embed id - see the POST /pages/:slug handler for the rename/collision
// mechanics this requires that reels don't need.

// Keep in sync with js/config.js's R2_PUBLIC_URL - reels/pages store a
// file's full public URL (this + "/" + its R2 key), not the bare key, so
// finding/rewriting references needs to reconstruct that same URL here.
const R2_PUBLIC_URL = "https://media.boxedape.com";

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

// Returns a 401 Response if the request isn't authorized, or null if it's
// fine to proceed - callers do `const authError = requireAuth(...); if
// (authError) return authError;`.
function requireAuth(request, env) {
  return isAuthorized(request, env) ? null : jsonResponse({ error: "Unauthorized" }, 401);
}

// Raw pass-through of an already-JSON-string KV value, for GET routes that
// return the stored document verbatim rather than re-serializing it.
function rawJsonResponse(value) {
  return new Response(value, {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function parseJsonBody(request) {
  try {
    return { body: JSON.parse(await request.text()) };
  } catch {
    return { error: jsonResponse({ error: "Invalid JSON body" }, 400) };
  }
}

// Shared shape for the /reels and /drafts list routes: list every key under
// a prefix, fetch + parse each one, and pluck out just the summary fields
// each listing view needs.
//
// excludePrefix exists because "draft_" and "draft_page_" aren't disjoint -
// every draft_page_<id> key also starts with "draft_", so KV's plain
// prefix match alone would have GET /drafts (reel drafts) silently
// returning page drafts too. GET /drafts/pages doesn't need this itself:
// "draft_page_" has no shorter prefix elsewhere in this namespace that
// would similarly swallow it.
async function listEntries(env, prefix, pickFields, excludePrefix) {
  const list = await env.REELS.list({ prefix });
  const keys = excludePrefix
    ? list.keys.filter((key) => !key.name.startsWith(excludePrefix))
    : list.keys;
  const entries = await Promise.all(
    keys.map(async (key) => {
      const value = await env.REELS.get(key.name);
      if (!value) return null;
      try {
        return pickFields(JSON.parse(value));
      } catch {
        return null;
      }
    })
  );
  return entries.filter(Boolean);
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
      const authError = requireAuth(request, env);
      if (authError) return authError;

      // Explicit "reel_" prefix (not "") so this never picks up draft_/
      // page_/draft_page_ keys sharing the same REELS namespace.
      const entries = await listEntries(env, "reel_", (r) => ({
        id: r.id, title: r.title, created: r.created, analyticsEnabled: r.analyticsEnabled === true,
      }));
      return jsonResponse(entries);
    }

    // /reels/:id
    const match = pathname.match(/^\/reels\/([a-zA-Z0-9_-]+)$/);
    if (match) {
      const key = `reel_${match[1]}`;

      if (request.method === "GET") {
        const value = await env.REELS.get(key);
        if (!value) return jsonResponse({ error: "Not found" }, 404);
        return rawJsonResponse(value);
      }

      if (request.method === "POST") {
        const authError = requireAuth(request, env);
        if (authError) return authError;
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
        const authError = requireAuth(request, env);
        if (authError) return authError;
        await env.REELS.delete(key);
        return jsonResponse({ ok: true });
      }
    }

    // GET /drafts - list all drafts (builder sidebar), password-gated.
    // Excludes draft_page_* keys - see listEntries()'s own comment for why
    // that's not automatic just from the "draft_" prefix alone.
    if (pathname === "/drafts" && request.method === "GET") {
      const authError = requireAuth(request, env);
      if (authError) return authError;

      const entries = await listEntries(env, "draft_", (r) => ({
        id: r.id, title: r.title, createdAt: r.createdAt, updatedAt: r.updatedAt,
        publishedEmbedId: r.publishedEmbedId, publishedAt: r.publishedAt, locked: r.locked,
      }), "draft_page_");
      return jsonResponse(entries);
    }

    // GET /drafts/pages - list all page drafts (Pages sidebar), password-
    // gated. Must be checked before the generic /drafts/:id block below,
    // since "/drafts/pages" would otherwise match that regex too (with
    // "pages" incorrectly treated as a draft id).
    if (pathname === "/drafts/pages" && request.method === "GET") {
      const authError = requireAuth(request, env);
      if (authError) return authError;

      const entries = await listEntries(env, "draft_page_", (p) => ({
        id: p.id, title: p.title, slug: p.slug, createdAt: p.createdAt, updatedAt: p.updatedAt,
        publishedSlug: p.publishedSlug, locked: p.locked,
      }));
      return jsonResponse(entries);
    }

    // /drafts/:id - unlike /reels/:id, every method here is password-gated:
    // drafts have no legitimate anonymous consumer (only the builder itself
    // ever reads them), so there's no reason for GET to be public here.
    const draftMatch = pathname.match(/^\/drafts\/([a-zA-Z0-9_-]+)$/);
    if (draftMatch) {
      const key = `draft_${draftMatch[1]}`;

      if (request.method === "GET") {
        const authError = requireAuth(request, env);
        if (authError) return authError;
        const value = await env.REELS.get(key);
        if (!value) return jsonResponse({ error: "Not found" }, 404);
        return rawJsonResponse(value);
      }

      if (request.method === "POST") {
        const authError = requireAuth(request, env);
        if (authError) return authError;
        const { body, error } = await parseJsonBody(request);
        if (error) return error;
        // Stamped server-side, not trusted from the client, so "most
        // recently edited" sort order stays correct regardless of client
        // clock skew.
        body.updatedAt = Date.now();
        await env.REELS.put(key, JSON.stringify(body));
        return jsonResponse({ ok: true, updatedAt: body.updatedAt });
      }

      if (request.method === "DELETE") {
        const authError = requireAuth(request, env);
        if (authError) return authError;
        await env.REELS.delete(key);
        return jsonResponse({ ok: true });
      }
    }

    // /drafts/pages/:id - page drafts, same visibility rules as /drafts/:id
    // (password-gated on every method, no legitimate anonymous consumer).
    const pageDraftMatch = pathname.match(/^\/drafts\/pages\/([a-zA-Z0-9_-]+)$/);
    if (pageDraftMatch) {
      const key = `draft_page_${pageDraftMatch[1]}`;

      if (request.method === "GET") {
        const authError = requireAuth(request, env);
        if (authError) return authError;
        const value = await env.REELS.get(key);
        if (!value) return jsonResponse({ error: "Not found" }, 404);
        return rawJsonResponse(value);
      }

      if (request.method === "POST") {
        const authError = requireAuth(request, env);
        if (authError) return authError;
        const { body, error } = await parseJsonBody(request);
        if (error) return error;
        body.updatedAt = Date.now();
        await env.REELS.put(key, JSON.stringify(body));
        return jsonResponse({ ok: true, updatedAt: body.updatedAt });
      }

      if (request.method === "DELETE") {
        const authError = requireAuth(request, env);
        if (authError) return authError;
        await env.REELS.delete(key);
        return jsonResponse({ ok: true });
      }
    }

    // GET /pages - list all published pages (management view)
    if (pathname === "/pages" && request.method === "GET") {
      const authError = requireAuth(request, env);
      if (authError) return authError;

      const entries = await listEntries(env, "page_", (p) => ({
        id: p.id, slug: p.slug, title: p.title, published: p.published, analyticsEnabled: p.analyticsEnabled === true,
      }));
      return jsonResponse(entries);
    }

    // /pages/:slug - public GET (the page.html renderer's fetch target),
    // password-gated POST (publish/republish) and DELETE.
    const pageMatch = pathname.match(/^\/pages\/([a-zA-Z0-9_-]+)$/);
    if (pageMatch) {
      const slugParam = pageMatch[1];

      if (request.method === "GET") {
        const value = await env.REELS.get(`page_${slugParam}`);
        if (!value) return jsonResponse({ error: "Not found" }, 404);
        return rawJsonResponse(value);
      }

      if (request.method === "POST") {
        const authError = requireAuth(request, env);
        if (authError) return authError;
        const { body, error } = await parseJsonBody(request);
        if (error) return error;

        const { id, slug, previousSlug } = body || {};
        if (!id || !slug || !/^[a-zA-Z0-9_-]+$/.test(slug) || slug !== slugParam) {
          return jsonResponse({ error: "Missing or invalid id/slug" }, 400);
        }

        // Collision only if page_<slug> belongs to a *different* page id -
        // republishing under its own already-live slug must succeed.
        const existingAtSlug = await env.REELS.get(`page_${slug}`);
        if (existingAtSlug) {
          let existingId;
          try {
            existingId = JSON.parse(existingAtSlug).id;
          } catch {
            existingId = null;
          }
          if (existingId !== id) {
            return jsonResponse({ error: "Slug already in use" }, 409);
          }
        }

        // Rename case: this page was previously published under a
        // different slug - remove that old entry so it doesn't linger as a
        // dangling duplicate/dead URL. The client sends the old slug
        // explicitly rather than this route scanning all page_* entries
        // for a matching id (would be an unbounded list() on every publish).
        if (previousSlug && previousSlug !== slug) {
          await env.REELS.delete(`page_${previousSlug}`);
        }

        const published = {
          id,
          slug,
          title: body.title || "",
          blocks: Array.isArray(body.blocks) ? body.blocks : [],
          analyticsEnabled: body.analyticsEnabled === true,
          backgroundImageEnabled: body.backgroundImageEnabled === true,
          backgroundImage: typeof body.backgroundImage === "string" ? body.backgroundImage : "",
          backgroundBlur: typeof body.backgroundBlur === "number" ? body.backgroundBlur : 12,
          backgroundParallaxMode: body.backgroundParallaxMode === "scroll" ? "scroll" : "fixed",
          contentOverlayColor: typeof body.contentOverlayColor === "string" ? body.contentOverlayColor : "#000000",
          contentOverlayOpacity: typeof body.contentOverlayOpacity === "number" ? body.contentOverlayOpacity : 0,
          contentOverlayFullBleed: body.contentOverlayFullBleed === true,
          contentOverlayMarginVertical: typeof body.contentOverlayMarginVertical === "number" ? body.contentOverlayMarginVertical : 0,
          contentOverlayMarginHorizontal: typeof body.contentOverlayMarginHorizontal === "number" ? body.contentOverlayMarginHorizontal : 0,
          contentMaxWidth: typeof body.contentMaxWidth === "number" ? body.contentMaxWidth : 900,
          contentPaddingTop: typeof body.contentPaddingTop === "number" ? body.contentPaddingTop : 0,
          contentPaddingBottom: typeof body.contentPaddingBottom === "number" ? body.contentPaddingBottom : 0,
          textStyleDefs: body.textStyleDefs && typeof body.textStyleDefs === "object" ? body.textStyleDefs : {},
          published: new Date().toISOString(),
        };
        await env.REELS.put(`page_${slug}`, JSON.stringify(published));
        return jsonResponse({ ok: true, slug });
      }

      if (request.method === "DELETE") {
        const authError = requireAuth(request, env);
        if (authError) return authError;
        await env.REELS.delete(`page_${slugParam}`);
        return jsonResponse({ ok: true });
      }
    }

    // /stats/:type/:id - :type constrained to "reel"/"page" directly in the
    // regex. POST is public (called from player.html/page.html for any
    // visitor), GET is password-gated (the builder's "View Stats" modal).
    const statsMatch = pathname.match(/^\/stats\/(reel|page)\/([a-zA-Z0-9_-]+)$/);
    if (statsMatch) {
      const [, targetType, targetId] = statsMatch;
      const targetKey = targetType === "reel" ? `reel_${targetId}` : `page_${targetId}`;

      if (request.method === "POST") {
        const { body, error } = await parseJsonBody(request);
        if (error) return error;

        // Only record a beacon for a target that actually exists and has
        // opted in - this also means flipping analyticsEnabled off stops
        // the Worker from accepting any further beacons for it immediately,
        // not just future ones from an updated client.
        const targetValue = await env.REELS.get(targetKey);
        if (!targetValue) return jsonResponse({ ok: true });
        let target;
        try {
          target = JSON.parse(targetValue);
        } catch {
          return jsonResponse({ ok: true });
        }
        if (target.analyticsEnabled !== true) return jsonResponse({ ok: true });

        const { event, sessionId, trackIndex, trackTitle, listenSeconds } = body || {};
        if ((event !== "view" && event !== "play") || typeof sessionId !== "string" || !sessionId) {
          return jsonResponse({ error: "Invalid stat event" }, 400);
        }

        const record = {
          event,
          targetType,
          targetId,
          sessionId,
          ts: new Date().toISOString(),
          country: request.cf?.country || null,
          city: request.cf?.city || null,
          region: request.cf?.region || null,
          timezone: request.cf?.timezone || null,
        };
        if (event === "play") {
          record.trackIndex = typeof trackIndex === "number" ? trackIndex : null;
          record.trackTitle = typeof trackTitle === "string" ? trackTitle : "";
          record.listenSeconds = typeof listenSeconds === "number" ? Math.round(listenSeconds) : 0;
        }

        const statKey = `stat_${targetType}_${targetId}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
        await env.REELS.put(statKey, JSON.stringify(record));
        return jsonResponse({ ok: true });
      }

      if (request.method === "GET") {
        const authError = requireAuth(request, env);
        if (authError) return authError;

        const entries = await listEntries(env, `stat_${targetType}_${targetId}_`, (r) => r);
        entries.sort((a, b) => (a.ts < b.ts ? 1 : -1));
        return jsonResponse(entries);
      }
    }

    // Type label for a REELS-namespace key, for display in the /media/usages
// preview and nowhere else - matches worker/CLAUDE.md's key-prefix scheme.
// Order matters: "draft_page_" must be checked before "draft_", since every
// draft_page_<id> key also starts with "draft_" (see listEntries()'s own
// comment on the same ambiguity).
function keyEntryType(keyName) {
  if (keyName.startsWith("draft_page_")) return "page draft";
  if (keyName.startsWith("page_")) return "page";
  if (keyName.startsWith("draft_")) return "reel draft";
  if (keyName.startsWith("reel_")) return "reel";
  return "other";
}

// Every reel/page (published or draft) whose stored JSON contains
// `urlSubstring` - a file's full public URL, since that's what's actually
// embedded in a block/track field, not the bare R2 key. Scans the whole
// REELS namespace (skipping stat_* entries, which never hold media
// references) - no cursor pagination, matching listEntries()'s existing
// convention elsewhere in this file; acceptable at current KV volume, but
// a scaling caveat if this namespace grows into the tens of thousands of
// entries.
async function findMediaReferences(env, urlSubstring) {
  const list = await env.REELS.list({ prefix: "" });
  const matches = [];
  for (const key of list.keys) {
    if (key.name.startsWith("stat_")) continue;
    const value = await env.REELS.get(key.name);
    if (!value || !value.includes(urlSubstring)) continue;
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      continue;
    }
    matches.push({ key: key.name, type: keyEntryType(key.name), title: parsed.title || parsed.slug || key.name });
  }
  return matches;
}

// After a media file's R2 key changes (rename or move - same worker
// operation, see POST /media/rename), rewrite every reference to its old
// URL found by findMediaReferences() to the new one, in place. A plain
// substring replace on the raw stored JSON text (not a parse/mutate/re-
// stringify) - safe here because a URL contains no characters that need
// JSON escaping, and simpler than walking an unknown, evolving set of
// possible field shapes (block.imageUrl, track.url, block.backgroundImage,
// ...) by hand.
async function rewriteMediaReferences(env, fromUrl, toUrl) {
  const list = await env.REELS.list({ prefix: "" });
  let updated = 0;
  for (const key of list.keys) {
    if (key.name.startsWith("stat_")) continue;
    const value = await env.REELS.get(key.name);
    if (!value || !value.includes(fromUrl)) continue;
    await env.REELS.put(key.name, value.split(fromUrl).join(toUrl));
    updated++;
  }
  return updated;
}

// POST /media/upload?key=<key>
    if (pathname === "/media/upload" && request.method === "POST") {
      const authError = requireAuth(request, env);
      if (authError) return authError;
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
      const authError = requireAuth(request, env);
      if (authError) return authError;
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

    // GET /media/usages?key=<key> - read-only preview of every reel/page
    // (published or draft) whose stored JSON currently references this
    // file, so the builder can warn before a rename/move that's about to
    // rewrite them.
    if (pathname === "/media/usages" && request.method === "GET") {
      const authError = requireAuth(request, env);
      if (authError) return authError;
      const key = new URL(request.url).searchParams.get("key");
      if (!isValidMediaKey(key)) {
        return jsonResponse({ error: "Invalid key" }, 400);
      }
      const matches = await findMediaReferences(env, `${R2_PUBLIC_URL}/${key}`);
      return jsonResponse({ matches });
    }

    // POST /media/rename  body: { from, to }
    if (pathname === "/media/rename" && request.method === "POST") {
      const authError = requireAuth(request, env);
      if (authError) return authError;
      const { body, error } = await parseJsonBody(request);
      if (error) return error;
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

      const updated = await rewriteMediaReferences(env, `${R2_PUBLIC_URL}/${from}`, `${R2_PUBLIC_URL}/${to}`);
      return jsonResponse({ ok: true, updated });
    }

    // DELETE /media/delete?key=<key>
    if (pathname === "/media/delete" && request.method === "DELETE") {
      const authError = requireAuth(request, env);
      if (authError) return authError;
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
