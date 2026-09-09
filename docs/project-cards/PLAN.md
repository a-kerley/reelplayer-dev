# Project Cards — build plan

Add a **Project Cards** builder tab to reelplayer. Cards are authored here,
published to Cloudflare KV like reels, and embedded on any hand-built
boxed-ape marketing page as **one `<iframe>` per card** — cards get sprinkled
in among non-reelplayer content, so each card must be fully self-contained,
lazy-loadable, and placeable anywhere. (A reelplayer *Page* is not an option
here: the host pages are hand-authored, not reelplayer-rendered.)

Status: not started. Source snapshot from boxed-ape-site is in
`boxed-ape-source/` (see its README for provenance + a per-file guide).

---

## 1. Guiding decision: a card is a *referenced* reel + an Info panel

Do **not** build a new player or a second render path. A project card =

- a real **reelplayer reel** (expandable mode: collapsed video/logo banner ⇄
  expanded player) — authored 100% in the existing Reel builder, untouched,
  and referenced by id. The card does **not** copy the reel's config.
- **+ an "Info" tab** next to the reel's "Listen" tab: description, stats,
  links, partner logos. This markup is ported from
  `boxed-ape-source/project-card.js` — the chrome only, not its interaction
  logic (see §5).

**Reference model, not copy.** A `card_<id>` blob holds only card-only fields
+ a `reelId`. The Worker inlines the referenced reel into the `/cards/:id`
response, and the player draws that reel **inline** (one iframe, one document,
one resize handshake — not an iframe nested inside the card iframe). Editing
the reel in the Reel builder updates every card that points at it.

New content type key: **`card`**, beside `reel` and `page`.
KV prefixes: `card_<id>` (published), `draft_card_<id>` (in progress) —
mirrors the reel/page convention in `worker/CLAUDE.md`.

---

## 2. What gets reused (the point of doing this in reelplayer)

| Piece | File | How |
|---|---|---|
| Reel authoring | Reels tab (whole flow) | **unchanged** — the reel half of a card is just a normal published reel |
| Sidebar tab switch | `js/modules/tabController.js` | add one `createTabController` entry |
| Draft persistence | `js/modules/draftStoreFactory.js` | `createDraftStore({ prefix: "/drafts/cards", normalize })` — new instance, zero new persistence logic |
| Sidebar list / rename / delete | `js/modules/sidebarList.js` | reuse as Reels/Pages do |
| Auth + password gating | `js/modules/builderAuth.js` | unchanged |
| Content-hash IDs | `js/modules/contentHash.js` | `generateCardId(card)` like `embedExporter.generateReelId` |
| Reel picker | reel list route + `sidebarList` data | the card form's "which reel plays here" dropdown |
| Media pick (logo, partner logos) | Media Library tab + `media.boxedape.com` R2 | cards pick from the same library |
| Player runtime | `player.html` / `js/player.js` | `mode:"card"` branch calls the **same `renderPlayer()`** the builder preview uses, on the inlined reel data — see §5 |
| Iframe embed markup + auto-height | `js/modules/embedExporter.js` | its `<iframe>` + `reelplayer:resize` / `reelplayer:scrollCompensate` postMessage handshake already does everything the card grid needs |
| Opt-in analytics | `worker/src/index.js` `/stats/*`, builder View Stats modal | add `card` as a third stat type — see §4 |
| Cloudflare Worker + KV + R2 | `worker/src/index.js` | route blocks copied from `/reels/:id` + `/drafts/pages/:id` (see §4) |

New from-scratch work is small: the **Card Info form** (§3), the
**`mode:"card"` render branch** (§5), the **worker routes + reel inlining**
(§4), and the **boxed-ape iframe injector** (§6).

---

## 3. Card schema + builder form

### Schema

Because the reel is referenced, a card blob is *just* the card-only fields —
none of the colour / background / expandable / playlist / text-style fields
(those live on the reel):

```
reelId          string   (which published reel plays in this card;
                          absent = Info-only card, no player)
logo            string   (overlay logo on the banner)
logoAlt         string
partnerLogos    [{ src, alt }]
composers       string   ("Music by …" hover text)
description     [string]  (paragraphs, Info tab)
stats          [{ label?, value }]   (label omitted = badge style)
links          [{ url, icon, alt }]  (icon = filename in assets/card-icons/)
analyticsEnabled boolean  (default false; see §4)
order           number   (default sort in the sidebar list; NOT layout —
                          layout is per-page on the boxed-ape side)
```

`enableListenTab` from the snapshot is gone — it's just `!reelId`.

### Form

A single small panel — no reel-config fields:

- **reel picker** — dropdown of published reels (+ "none / Info-only")
- description — textarea, blank-line separated → `description[]`
- stats — repeater of `{ label, value }` rows
- links — repeater of `{ url, icon (select from `assets/card-icons/`), alt }`
- partner logos — repeater using the existing media/file picker
- logo + logoAlt — media picker + text
- composers — text
- analyticsEnabled — checkbox

**v1 shortcut:** ship the form as the reel picker + one raw-JSON textarea for
the rest. Prove the spine end to end (§7) before building the repeater UI.

---

## 4. Worker changes (`worker/src/index.js`)

1. **`/drafts/cards/:id`** — GET/POST/DELETE, password-gated. Byte-for-byte
   the `/drafts/pages/:id` block with the key prefix changed.
2. **`/cards/:id`** — public GET, password-gated POST (publish) and DELETE.
   Model on `/reels/:id` (content-hash id, no slug/rename machinery). **GET
   inlines the referenced reel:** read `card_<id>`, then if it has a `reelId`
   also read `reel_<reelId>` and return `{ ...card, reel: <reelData|null> }`.
   `reel: null` when the reel is missing/unpublished → card renders Info-only
   (dangling-reference rule, below).
3. `/drafts/cards` and `/cards` **list** routes — copy the reel list routes
   (`listEntries(env, "card_", …)`), for the sidebar + the reel picker's
   inverse ("which cards use this reel").
4. **Analytics.** Widen the `/stats/(reel|page)/…` regex to
   `(reel|page|card)`, add a `card_<id>` existence + `analyticsEnabled`
   branch (public POST, re-checked per beacon, exactly as reel/page). Events
   store as `stat_card_<id>_<ts>_<rand>` in the same `REELS` namespace. See
   §8 "Analytics" for where a card's *play* events land.

**Dangling reference.** When a reel is deleted in the builder, scan `card_*`
for `reelId === <that id>` and warn ("used by N cards") before allowing it.
Runtime is already safe (GET returns `reel: null` → Info-only), so the warn
is a courtesy, not a guard.

No KV namespace change — cards live in `REELS` under the new prefix.

---

## 5. `mode:"card"` render branch

**Route the player half through `renderPlayer()` in `js/player.js` — never a
second hand-written copy.** This repo's `CLAUDE.md` documents three real bugs
from `player.html`'s bootstrap drifting from `player.js`; a hand-copied card
player would be a fourth.

Bootstrap flow for `player?id=<cardId>`:

1. Fetch `/cards/<cardId>` → `{ ...cardFields, reel }`.
2. Render the **card chrome** from `cardFields`: the outer frame, the
   Info/Listen `.tab-toggle`, and the Info panel (`renderExtraContent()`,
   `renderStats()`, `renderLinks()`, `renderPartnerLogos()` ported from
   `boxed-ape-source/project-card.js` — **markup only**).
3. For the collapsed banner + Listen tab, call the **same `renderPlayer()`**
   the builder preview uses, passing `reel` as its config. Identical code
   path, no copy.
4. No `reel` → Info-only: skip step 3 entirely (no player instantiated).
5. Port `boxed-ape-source/project-card.css` → new **`css/card.css`**, loaded
   by `player.html`. Keys off `--card-*` vars set from the reel's own
   theme/appearance (reuse the reel's colour resolution — the card does not
   carry its own `themeColors`).

### Do NOT port the snapshot's interaction logic

`project-card.js`'s `handleMouseEnter/Leave`, `expand()`, `collapse()`,
`MOUSE_LEAVE_DELAY` auto-collapse are **desktop-hover-only** and break on
touch (no `mouseleave` on a phone → card stuck open). The reel's existing
**expandable-mode** expand/collapse + touch handling already solves this for
every third-party embed. The card wrapper adds only the Info/Listen tab
toggle on top of that — it does not re-implement expand/collapse or
hover-to-play.

### Mobile parity (must match the existing player)

- The reel player already works on mobile (it's a third-party embed). The
  **new** surface is the card chrome — hold it to the same bar.
- `reelplayer:resize` must re-fire on viewport resize, orientation change,
  and mobile address-bar show/hide, and must report the height of whichever
  of {collapsed banner, Info tab, Listen tab} is currently visible — not just
  the player (the snapshot's `switchTab()` already measures the Info tab;
  keep that, wire it to the resize post).
- Info/Listen tab buttons ≥44px touch targets.
- Banner `<video>`: `muted loop playsinline preload="metadata"` (snapshot has
  `preload="auto"` — N cards would pull N full videos on load).
- Verify on real device emulation, matching how the player is already tested
  — not just a narrow desktop window.

`css/layout.css` is shared with the builder — keep card styling in
`css/card.css` (same rule as `css/player.css`).

---

## 6. boxed-ape-site side

Strip the projects system to a placement layer:

- **Delete:** `projects-data.js`, `project-card.js`, `AudioPlayer.js`,
  `audio-player.css`, `project-card.css` (moves here as `css/card.css`).
- **Keep:** `masonry-layout.js` — repoint its reflow trigger from card DOM
  class changes to `window` `message` events
  (`event.data.type === "reelplayer:resize"` for any card iframe). One column
  on mobile, reflow on every resize message.
- **New (~30 lines):** an injector taking an ordered `[{ cardId }]` list
  (inline in the page, or a tiny `cards.js`), appending
  `<iframe src="https://player.boxedape.com/player?id=<cardId>"
   loading="lazy" style="width:100%;border:none">` into
  `.project-cards-container`, then handing the wrappers to `MasonryLayout`.
- Per-page arrangement = the order of that list on each page. Any hand-built
  boxed-ape page includes the injector with its own list.

Host-height handshake: copy the `message` listener from `embedExporter.js`'s
`resizeScript` (handles both `resize` and `scrollCompensate`), generalised to
match any card iframe by id prefix.

---

## 7. First slice (spine, then flesh)

1. Worker: `/drafts/cards/:id`, `/cards/:id` (with reel inlining), list routes.
2. `createDraftStore` card instance + `createTabController` entry + a stub
   "Project Cards" panel: reel picker + one raw-JSON textarea.
3. `generateCardId` + `publishCard()` (copy of `embedExporter.storeReelData`
   → `POST /cards/:id`).
4. `mode:"card"` branch: fetch card, render chrome + Info/Listen tabs, call
   `renderPlayer()` on the inlined `reel`. Minimal CSS.
5. Publish one test card pointing at an existing reel. In a throwaway
   boxed-ape page, embed its iframe; confirm `reelplayer:resize` drives
   height (banner *and* Info tab), masonry reflows, and it works on a phone
   viewport.
6. Only then: real Card Info form (repeaters), full `card.css`, asset
   migration, analytics wiring, boxed-ape cleanup.

---

## 8. Resolved decisions

Settled 2026-09-09.

- **Card ↔ reel: reference model.** A `card_<id>` blob = card-only fields +
  `reelId`. The Worker inlines the reel on GET; the player draws it inline
  (one iframe). Editing the reel updates every card. The card form loses all
  reel-config fields — just the Info panel + a reel picker. Cost: the
  reference can dangle (handled — GET returns `reel: null` → Info-only, plus
  a builder warn on reel delete).

- **Embed shape: one iframe per card, drawn inline.** Cards go into
  hand-authored boxed-ape marketing pages among non-reelplayer content, so a
  reelplayer Page renderer isn't applicable and modularity is the point. The
  reel player renders inline inside the single card iframe — no iframe nested
  in an iframe, no resize-handshake chaining.

- **Mobile: parity with the existing player.** Reuse the reel's
  expandable-mode expand/collapse + touch handling; port only the Info-panel
  markup and tab toggle from the snapshot, not its hover/auto-collapse logic.
  Resize handshake re-fires on orientation/address-bar changes and reports
  the visible tab's height. Verify on device emulation. (§5.)

- **Analytics: card-level, opt-in.** Add `card` as a third stat type
  (`stat_card_<id>_*`, `card.analyticsEnabled` default false, same public
  POST + per-beacon opt-in check as reel/page). **Play events from the inline
  player must target `/stats/card/<cardId>`, not the reel** — the card is the
  marketing unit on the page, so `renderPlayer()` / the bootstrap needs a
  stats-target override (`{ statsType:'card', statsId: cardId }`) when
  rendering inside a card. The referenced reel's own standalone embeds keep
  logging to `reel_<id>` unaffected. Event vocab: reuse existing `view`
  (card iframe rendered) + `play` (track played); skip a separate `expand`
  event for v1. Builder View Stats modal: add the `card` type to its
  client-side aggregation.

- **SEO — none needed.** Host pages are marketing pages, not indexed project
  listings. Injector appends iframes from a bare `[{ cardId }]` list, no
  host-DOM text mirror. `projects-data.js` deleted outright.

- **Asset migration — ship the SVGs in this repo, no R2.** Move
  `boxed-ape-source/assets/icons/*` + `assets/link_icons/*` (~13 files) into
  `assets/card-icons/`, served by the existing `reelplayer-app` static worker
  (all paths but `/` and `/index.html` are public). Reference them
  **root-relative** (`/assets/card-icons/…`) — the card renders on the player
  origin, so no domain constant is needed and the snapshot's broken relative
  paths are fixed. R2 is for user media; these are code-coupled chrome.
  *Optional:* inline the ~13 SVGs into the template/CSS as the snapshot
  already does for the play/pause/volume icons — kills 13 requests per card,
  nothing to migrate.

- **Player origin — custom domain.** Register `player.boxedape.com` for the
  `reelplayer-app` static worker (serves reels *and* cards — one domain, not
  a separate `cards.` host). `embedExporter.js` derives embed URLs from
  `window.location.origin`, so pointing the builder there fixes reel and card
  embeds together. Not a blocker for the internal spine (§7); must exist
  before any boxed-ape page bakes in an iframe `src`. *Same pass:* give the
  API worker a real host too (`api.boxedape.com`) — `js/config.js` currently
  hardcodes a bare `*.workers.dev` subdomain that every published card/reel
  fetches at runtime and that some networks block.

- **Per-card cost — accept for v1.** `loading="lazy"` + browser cache dedupes
  shared assets across iframes, so past the first card it's N× parse, not N×
  download. Wavesurfer init is already deferred to the first Listen-tab
  click; **also confirm `player.js` doesn't *statically* import wavesurfer**
  — if it does, make it a dynamic `import()` so collapsed cards never fetch
  it. Revisit at >12 above-the-fold cards or a measured LCP regression.
