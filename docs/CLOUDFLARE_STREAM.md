# Cloudflare Stream support

Lets clients' videos be hosted on Cloudflare Stream (no ads, no YouTube/Vimeo
chrome) and embedded in a page's **Embedded Video** block.

## Part 1 — video block support (shipped)

`js/modules/pageBlockRenderer.js` recognises Stream URLs alongside YouTube and
Vimeo via the same `VIDEO_URL_PATTERNS` table. Paste any of these into a video
block's **Video URL** field:

- `https://customer-<code>.cloudflarestream.com/<uid>/iframe`
- `https://customer-<code>.cloudflarestream.com/<uid>/watch`
- `https://watch.cloudflarestream.com/<uid>`
- `https://iframe.videodelivery.net/<uid>` (legacy)

`<uid>` is the 32-hex video UID; the account's `customer-<code>` host is kept
and reused for the iframe and thumbnail. A host-less URL falls back to
Cloudflare's customer-code-free `videodelivery.net`.

**What works:**

- Embed renders (`streamEmbedUrl`).
- Static thumbnail (`streamThumb`) — so an expandable block can use "Video
  thumbnail" as its collapsed background, same as YouTube. Vimeo still can't.
- Advanced Embed Settings (cog dialog, `embedSettingsDialog.js` `stream` spec):
  Player controls, Autoplay (muted), Loop, Start muted, Player colour, Start
  at (sec). Autoplay forces `muted=true` (browser policy). No end-time param
  — the Stream iframe has none.

**Known gap:** Stream's raw iframe has no documented postMessage play/pause
protocol (it needs Cloudflare's player SDK), so a Stream video **cannot drive
the cross-media pause coordinator or the "don't collapse mid-playback" guard**
in expandable mode. `wireVideoPlaybackDetection()` returns early for
`provider === "stream"`. It still embeds and plays; it just won't auto-pause a
reel on the same page, and an expandable Stream block can collapse on
mouse-leave while playing. Close this by loading
`https://embed.cloudflarestream.com/embed/sdk.latest.js` (lazily, only when a
Stream block is present) and wiring its `play`/`pause` events into
`setPlaying()` — fold into Part 2 or do as a follow-up.

## Part 2 — browse Stream videos in the Media Browser (planned, not started)

Goal: a "Stream" tab/source in `mediaBrowser.js` listing the account's Stream
videos so a client's video can be picked without copy-pasting a URL.

Stream videos are **not** R2 objects — they're a separate service. Required:

1. **Worker route** `GET /stream/list` (password-gated via the existing
   `Authorization: Bearer <BUILDER_PASSWORD>` check) that calls the Cloudflare
   API `GET /accounts/{account_id}/stream` and returns a normalised list
   (`{uid, name, thumbnail, duration, created, playbackUrl}`).
2. **New Worker secrets**: `CLOUDFLARE_ACCOUNT_ID` and a **scoped API token**
   (Account → Stream → Read). Create the token in the Cloudflare dashboard;
   add both via `wrangler secret put` (and to `worker/.dev.vars` locally).
3. **`mediaBrowser.js`**: extend, don't fork (see `js/modules/CLAUDE.md`).
   Thread a `source` through; list Stream videos as `readOnly` entries with no
   folder key, `url` = the watch/embed URL. Skip rename / move / delete /
   upload / "usages" for Stream items — those stay in the Cloudflare
   dashboard. Touches the browser's folder tree, type counts and bulk-op
   paths (all key-based today), and affects all three consumers of the shared
   component (Media Library tab + both file pickers), so scope it as
   read-only pick-list parity, not full R2 parity.

Simplest first cut: a flat Stream list you can pick from, no folders.
