# Project Cards — build plan

Add a **Project Cards** builder tab to reelplayer. Cards are authored here,
published to Cloudflare KV like reels, and embedded on any boxed-ape-site page
as **one `<iframe>` per card** (maximally modular — each card is independent,
lazy-loads, and can be placed anywhere).

Status: not started. Source snapshot from boxed-ape-site is in
`boxed-ape-source/` (see its README for provenance + a per-file guide).

---

## 1. Guiding decision: a card is a reel + an Info panel

Do **not** build a new player or a second render path. A project card =

- reelplayer **expandable-mode reel** (collapsed video/logo banner ⇄ expanded
  player) — this mechanic already exists, untouched
- **+ an "Info" tab** next to the existing "Listen" tab: description, stats,
  links, partner logos. This markup already exists in
  `boxed-ape-source/project-card.js` — it gets ported, not reinvented.

New content type key: **`card`**, sitting beside `reel` and `page`.
KV prefixes: `card_<id>` (published), `draft_card_<id>` (in progress) —
mirrors the reel/page prefix convention in `worker/CLAUDE.md`.

---

## 2. What gets reused (the point of doing this in reelplayer)

| Piece | File | How |
|---|---|---|
| Sidebar tab switch | `js/modules/tabController.js` | add one `createTabController` entry |
| Draft persistence | `js/modules/draftStoreFactory.js` | `createDraftStore({ prefix: "/drafts/cards", normalize })` — new instance, zero new persistence logic |
| Sidebar list / rename / delete | `js/modules/sidebarList.js` | reuse as Reels/Pages do |
| Auth + password gating | `js/modules/builderAuth.js` | unchanged |
| Content-hash IDs | `js/modules/contentHash.js` | `generateCardId(card)` like `embedExporter.generateReelId` |
| Media pick (image/video/audio) | Media Library tab + `media.boxedape.com` R2 | cards pick from the same library |
| Colour pickers, text-style toolkit | `js/modules/colorPicker.js`, `styleToolbarWidgets.js` | reuse in the card form |
| Player runtime | `player.html` / `js/player.js` | **`mode:"card"` render branch only** — see §5 |
| Iframe embed markup + auto-height | `js/modules/embedExporter.js` | its `<iframe>` + `reelplayer:resize` / `reelplayer:scrollCompensate` postMessage handshake already does everything the card grid needs |
| Cloudflare Worker + KV + R2 | `worker/src/index.js` | **+2 route blocks**, copied from `/reels/:id` and `/drafts/:id` (see §4) |
| Cards inside a reelplayer Page (optional, later) | `js/modules/pageBlockRenderer.js` | one new `card` block type = copy of the `player` block, pointed at `/cards/` |

New, genuinely-from-scratch work is small: the **Card Info form section**
(§3), the **`mode:"card"` render branch** (§5), **2 worker routes** (§4), and
the **boxed-ape iframe injector** (§6).

---

## 3. Card schema + builder form

### Schema (from `boxed-ape-source/projects-data.js`)

Everything a reel already has (`playlist`→ maps to `audioTracks`, all the
colour/background/expandable/text-style fields) **plus** card-only fields:

```
logo            string   (overlay logo on the banner)
logoAlt         string
partnerLogos    [{ src, alt }]
composers       string   ("Music by …" hover text)
description     [string]  (paragraphs, Info tab)
stats          [{ label?, value }]   (label omitted = badge style)
links          [{ url, icon, alt }]  (icon = filename in the shared icon set)
enableListenTab boolean  (false = Info-only card, no player)
order           number   (default sort in the sidebar list; NOT layout —
                          layout is decided per-page on the boxed-ape side)
```

### Form

Reuse the Reels editor form (colours, background, expandable settings, player
text styles) and add one **"Card Info"** `<details>` section:

- description — textarea, blank-line separated → `description[]`
- stats — repeater of `{ label, value }` rows
- links — repeater of `{ url, icon (select from shared set), alt }` rows
- partner logos — repeater using the existing media/file picker
- logo + logoAlt — media picker + text
- composers — text
- enableListenTab — checkbox

**v1 shortcut:** ship the form as the reel form + a single raw-JSON textarea
for the card-only fields. Prove the spine end to end (§7) before building the
repeater UI.

---

## 4. Worker changes (`worker/src/index.js`)

Copy two existing blocks, s/reel/card/, s/`reel_`/`card_`/,
s/`draft_`/`draft_card_`/:

1. **`/drafts/cards/:id`** — GET/POST/DELETE, all password-gated. Byte-for-byte
   the `/drafts/pages/:id` block with the key prefix changed.
2. **`/cards/:id`** — public GET (the `player.html` fetch target for a card),
   password-gated POST (publish) and DELETE. Model on `/reels/:id`. No
   slug/rename machinery — a card id is a content hash like a reel's, not a
   stable slug like a page's.
3. `/drafts/cards` and `/cards` **list** routes — copy the reel list routes
   (`listEntries(env, "card_", …)`), for the sidebar.
4. Stats (optional, later): widen the `/stats/(reel|page)/…` regex to
   `(reel|page|card)` and add the `card_` key branch.

No KV namespace change — cards live in the same `REELS` namespace under the
new prefix, exactly as pages do.

---

## 5. `mode:"card"` render branch

**Route it through `renderPlayer()` in `js/player.js` — never a second
hand-written copy.** This repo's `CLAUDE.md` documents three real bugs from
`player.html`'s bootstrap drifting from `player.js`; a card branch that
hand-copies markup would be a fourth. `player.html`'s inline bootstrap should
call the same `playerApp` render entry point the builder preview uses.

Branch behaviour when the fetched object has `mode === "card"`:

1. Render the expandable-reel player as normal (collapsed banner ⇄ player).
2. Wrap it in the card chrome ported from `boxed-ape-source/project-card.js`:
   `template()`, `renderExtraContent()`, `renderStats()`, `renderLinks()`,
   `renderPartnerLogos()`, plus the Info/Listen `.tab-toggle`.
3. Port `boxed-ape-source/project-card.css` → new **`css/card.css`**, loaded
   by `player.html`. It keys off `--card-*` CSS vars — set them from the
   card's `themeColors` (port `applyThemeColors()`).
4. `enableListenTab: false` → Info-only, no player instantiated (the boxed-ape
   code already has this path).
5. Expand/collapse still posts `reelplayer:resize` — the card grid depends on
   it (§6). Confirm the Info tab's height is reported too, not just the
   player's.

`css/layout.css` is shared with the builder — keep card styling in
`css/card.css`, not there (same rule as `css/player.css`).

---

## 6. boxed-ape-site side

Strip the projects system down to a placement layer:

- **Delete:** `projects-data.js`, `project-card.js`, `AudioPlayer.js`,
  `audio-player.css`, `project-card.css` (moves here as `css/card.css`).
- **Keep:** `masonry-layout.js` — but repoint its reflow trigger from card
  DOM class changes to `window` `message` events
  (`event.data.type === "reelplayer:resize"` for any card iframe).
- **New (~30 lines):** an injector that takes an ordered list of
  `{ cardId }` (inline in the page, or a tiny `cards.js`), and for each
  appends
  `<iframe src="https://<player-origin>/player?id=<cardId>" loading="lazy"
   style="width:100%;border:none">` into `.project-cards-container`, then
  hands the wrappers to `MasonryLayout`.
- Per-page arrangement = just the order of that list on each page. Any
  boxed-ape page can include the injector with its own list.

Host-height handshake: copy the `message` listener from
`embedExporter.js`'s `resizeScript` (it already handles both `resize` and
`scrollCompensate`), generalised to match any card iframe by id prefix.

---

## 7. First slice (spine, then flesh)

1. Worker: add `/drafts/cards/:id`, `/cards/:id`, list routes.
2. `createDraftStore` card instance + `createTabController` entry + a stub
   "Project Cards" panel reusing the reel form + one raw-JSON textarea.
3. `generateCardId` + a `publishCard()` (copy of `embedExporter.storeReelData`
   → `POST /cards/:id`).
4. `mode:"card"` branch in the player render path: banner + Info/Listen tabs,
   minimal CSS.
5. Publish one test card. In a throwaway boxed-ape page, embed its iframe,
   confirm `reelplayer:resize` drives height and masonry reflows.
6. Only then: build the real Card Info form (repeaters), port full
   `card.css`, migrate assets, do the boxed-ape cleanup.

---

## 8. Open questions

- **SEO** — not yet addressed. Card text inside a cross-origin iframe is
  invisible to the host page for search. If any projects page needs to rank,
  the injector should also emit each card's `description`/`title` as static
  text in the host DOM (visually hidden or as a `<noscript>`-style fallback).
  Decide before the boxed-ape cleanup deletes `projects-data.js`.
- **Asset migration** — `assets/icons/*` (tab icons) and `assets/link_icons/*`
  (Spotify/Apple/Tidal/PlayStation/Safari) are referenced by the card
  templates. Move into reelplayer and serve from the player origin, or upload
  to R2 and reference via `R2_PUBLIC_URL`. Snapshot in
  `boxed-ape-source/assets/`.
- **Player origin** — boxed-ape iframes will point at the `reelplayer-app`
  Workers domain. Confirm that's the intended public origin, or set up a
  `cards.boxedape.com` / `player.boxedape.com` custom domain.
- **Per-card iframe cost** — N cards on a page = N loads of `player.js` +
  wavesurfer. `loading="lazy"` covers below-the-fold; revisit if a page has
  many above-the-fold cards.
- **Card ↔ reel overlap** — if a project already has a published reel, is the
  card a wrapper around that same reel id, or a self-contained copy? Leaning
  self-contained (simpler; a card owns its own `card_<id>` blob).
