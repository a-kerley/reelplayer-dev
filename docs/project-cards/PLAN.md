# Project Cards — build plan

Add a **Project Cards** builder tab to reelplayer. Cards are authored here,
published to Cloudflare KV like reels, and embedded on any hand-built
boxed-ape marketing page as **one `<iframe>` per card** — cards get sprinkled
in among non-reelplayer content, so each card must be fully self-contained,
lazy-loadable, and placeable anywhere. (A reelplayer *Page* is not an option
here: the host pages are hand-authored, not reelplayer-rendered.)

Status: spine in progress (§7). Done so far, 2026-09-13:
- §7.1 Worker routes: `/cards/:id` (with reel inlining + dangling-reference
  →Info-only fallback), `/drafts/cards/:id`, both list routes, `/stats/card/:id`.
- §7.2 (partial) Builder: Project Cards tab exists (grouped with Reels/Pages;
  Media Library moved to its own pinned sidebar section, no longer competing
  for tab-row space). v1 stub form: reel picker + one raw-JSON textarea for
  everything else (`js/cardsController.js`, `js/modules/cardDraftStore.js`,
  `js/modules/cardPublish.js`).
- §7.4 `player.html?id=<cardId>&type=card` fetches the card and renders
  its chrome via `js/modules/cardChrome.js`: banner (image only - no video
  crossfade yet) with logo/partner-logos-on-hover/composers, Info/Listen
  tab toggle, Info tab (title/description/stats/links, icons served from
  `assets/card-icons/`), and a Listen tab that lazily mounts the inlined
  reel (forced `mode:"static"`) via `playerApp.renderPlayer()` the first
  time it's opened - never a second render copy. Desktop-hover expand/
  collapse only (new code modeled on, not reusing, the reel's own
  expandable-mode UX - see §5's updated note) with a working
  `reelplayer:resize` handshake verified through a real iframe.
  `applyReelStyles()` was split into `applyReelStyleVars()` (CSS vars only,
  used by a card's mounted reel) vs. the container-background half (plain
  reel embeds only) so a card's own banner background doesn't get
  clobbered by its reel's.
  Not yet done: banner video and analytics.
- Mobile scroll-band expand/collapse (2026-09-14): `js/modules/
  cardChrome.js` branches on the same `isTouchDevice()` media-query check
  `js/player.js` uses. Touch devices get an `IntersectionObserver` on the
  card (`-33% 0px -33% 0px` rootMargin - the same middle-third band the
  reel's own `setupExpandableModeTouchInteractions()` uses) that expands
  on entry and collapses on exit, plus a tap-the-active-tab-again-to-close
  affordance (hover has `mouseleave` for this, touch has nothing
  equivalent) guarded by a 500ms manual-tap cooldown so a deliberate tap
  isn't immediately undone by the observer re-firing. Deliberately
  simpler than the reel's version: no top-half tracking (a real accepted
  gap - the reel skips compensating a collapse that exits off the bottom
  of the screen as a pure optimization, this always compensates, which is
  harmless but slightly more work than strictly needed). Scroll
  compensation on collapse IS implemented, just with a simpler mechanism
  than the reel's - `js/player.js`'s compensateScrollDuringCollapse()
  watches a CSS *transition* frame-by-frame via ResizeObserver, but
  `card.css` doesn't animate the collapse (a plain `display` toggle, not a
  transitioned height), so there's no multi-frame shrink to track - a
  single before/after height measurement one frame after the class
  toggle is the equivalent fix for an instant change. `.tab-btn` also
  bumped to the 44px touch-target minimum (`.card-banner-btn` already
  met it). Verified by forcing the touch media query and scrolling a
  tall test page - auto-expand entering the band, auto-collapse leaving
  it, and both directions of the manual tap-toggle, all confirmed
  through the browser with no console errors; desktop hover re-verified
  unaffected on a real (non-forced) run right after.
- Scroll compensation follow-up (2026-09-14, same day): the "accepted
  gap" above initially skipped compensation entirely - reconsidered after
  a correctness question about whether a card's collapse height delta is
  really smaller than the reel's, per the note above it isn't necessarily
  (a full Info panel or Listen tab can be 500px+, comparable to or bigger
  than the reel's own). Implemented and verified two ways: (1) directly,
  measuring an on-page marker element's screen position before/after a
  manual collapse with real scroll headroom - drifted <1px vs. the raw
  247px height delta; (2) through a real iframe with a host page running
  the actual `reelplayer:resize`/`reelplayer:scrollCompensate` listener
  pair (PLAN.md §6's future injector will need this same pair) - iframe
  correctly resized 493px→240px and the host page's own marker element
  drifted only ~6px against a 247px collapse. No known gap remains beyond
  the accepted top-half-tracking optimization above.
- Card open/close animation (2026-09-14, same day): the card had NO
  expand animation at all until this point - `.project-card-extra` just
  snapped between `display:none`/`block`. Replaced with the CSS Grid
  `grid-template-rows: 0fr → 1fr` trick on `.project-card-extra` itself
  (a `.project-card-extra-inner` child holds the padding/content, clipped
  by `overflow:hidden` while its row is near-0) - handles arbitrary/
  variable content height correctly without JS measuring anything, and
  respects `prefers-reduced-motion` matching this codebase's existing
  convention (`css/page.css`) of defining the transition unconditionally
  then stripping it in a `(prefers-reduced-motion: reduce)` override.
  This exposed two things needing fixes, not just new CSS:
  - `postResize()` used to read the *animating* element's own
    `scrollHeight` for the target iframe height - correct when the
    change was instant, wrong mid-transition (it'd report whatever
    height the animation happened to be at that instant). Now computes
    the target directly from `banner.offsetHeight +
    extraInner.scrollHeight` (the inner element's full natural content
    height is unaffected by the outer grid row's current clipped size),
    and posts that single target once - the same "host CSS transitions
    the iframe smoothly toward one target number" pattern
    `embedExporter.js`'s generated markup already uses for reels (PLAN.md
    §6's injector needs the same `transition: height` on its own
    wrapper).
  - `compensateScrollForCollapse()`'s previous single before/after
    measurement (correct for an instant snap) would now leave a visible
    jump at either end of a real multi-frame transition. Upgraded to the
    same `ResizeObserver`-per-frame technique `js/player.js`'s
    `compensateScrollDuringCollapse()` already uses - watches the card's
    actual rendered height on every frame of the shrink and scrolls by
    the same delta each time, so content below stays anchored throughout
    the whole animation, not just at the ends.
  Verified: sampled `card.getBoundingClientRect().height` every 40ms
  through both expand (280px→487px over ~330ms, progressive, not an
  instant jump) and collapse, and re-ran the marker-drift test through
  the full animated collapse this time (not just an instant one) - marker
  stayed within ~22px throughout the entire 487px→280px animated shrink
  while `scrollY` tracked it in lockstep frame by frame. No console
  errors; Listen tab + lazy reel mount re-verified working with the new
  markup structure.
- Analytics wiring (2026-09-14): `player.html`'s module-level
  `analyticsReelId` generalized to `analyticsStatsType`/`analyticsStatsId`,
  set by `loadAndRenderCard()` to `'card'`/`cardId` (never the card's
  *referenced* reelId) right after fetching the card, so both the
  immediate "view" beacon and the later "play" segment tracking inside
  `onActivateListen` (which reads the same module-level vars) correctly
  target `/stats/card/<cardId>` - PLAN.md §8: a card's plays are the
  marketing unit's own stats, not the underlying reel's. `endListenSegment()`
  now sends through these generic vars instead of a hardcoded `'reel'`.
  `js/modules/statsViewer.js`'s `openStatsModal()`/`fetchStats()` needed
  zero code changes - already fully generic on `targetType`, just a stale
  JSDoc (`'reel'|'page'`, now includes `'card'`) - no "Manage Published
  Cards" modal exists yet to wire a Stats button into, that's part of the
  real form/management UI (§7.6), not this slice. Verified against the
  Worker's stored stat events directly: `view` fires on card load,
  `play` fires with correct track index/title/duration after a full
  play-through, targeted at `stat_card_<id>_*` - and confirmed the
  referenced reel's own `stat_reel_*` stayed empty (correctly isolated).
  Also had to clear this browser's `reelplayer_operator` localStorage
  self-exclusion flag (set by every builder page load) to get a beacon to
  fire in testing at all - restored after.
- `textStyles` resolver tier (2026-09-14): turned out much smaller than
  expected - `previewManager.js`'s `resolveTextUnit()` already takes a
  generic "highest-precedence role style source" parameter
  (`pageRoleStyles`), and doesn't care whether that source is a page or a
  card; a card is never also inside a reelplayer Page player block (§1 -
  pages aren't an option for cards), so `pageTextStylesParam` and a card's
  `cardOverrides.textStyles` can never both apply to the same
  `player.html` render. So no changes were needed to either file's
  `resolveTextUnit()`/`textUnitStyleVars()` at all - `player.html`'s card
  path just sets the same module-level `pageRoleStyles` variable to
  `cardData.cardOverrides?.textStyles` right before calling
  `applyReelStyleVars()`, reusing the exact tier PLAN.md called for
  instead of needing a fourth one. `previewManager.js` needed zero
  changes (the Reels-tab builder preview never has card context).
  Verified with deliberately conflicting values (reel fallback: blue
  30px; card override: orange 40px/900 weight) - card override rendered
  correctly, no console errors.
- Banner video crossfade (2026-09-14): `resolveBannerVideo()` mirrors
  `resolveBannerImage()`'s fallback chain (`cardOverrides.bannerVideo` →
  the reel's own `backgroundVideo`/`backgroundVideoEnabled`). Desktop-hover
  only - `preload="metadata"` (not `"auto"`, per PLAN.md's mobile-parity
  note - N cards pulling full videos on load would be wasteful) means the
  video usually isn't fully buffered yet when a hover starts, so
  `previewBannerVideo()` calls `.play()` immediately (harmless while still
  at `opacity:0`) but only reveals it (`.video-ready` class, CSS fades
  opacity in) once `readyState >= HAVE_ENOUGH_DATA`/`canplaythrough` -
  matches this project's own convention of gating visible playback start
  on real readiness rather than forcing a partial-data start
  (`js/modules/videoPlayback.js`). Touch devices never trigger this at all
  (no hover) - banner stays the static image there, consistent with why
  `preload="metadata"` matters. Verified against the real "Horizon Call of
  the Mountain" banner video (already on production R2): hover reveals and
  plays it, hover-away pauses and hides it back to the static image, and a
  card with no banner video at all (the null-guarded common case) shows no
  regression - no console errors either way.
- `cardOverrides` merge (2026-09-14): `js/modules/cardChrome.js`'s
  `mergeCardOverrides()` applies the whitelist's reel-facing fields
  (accent/waveformUnplayed/waveformHover/outlineWidth/outlineColor/
  playerBackground/showReelTitle) onto the reel before it renders, and
  `renderCardChrome()` applies every `--card-*` key straight onto the card
  element as inline CSS custom properties. `bannerImage`/`bannerVideo` are
  handled by `resolveBannerImage()`/`resolveBannerVideo()` in the banner
  itself, not here (see the banner-video-crossfade entry below - built
  the same day, after this one). `textStyles` is still explicitly NOT
  handled anywhere yet - needs its own new tier in the previewManager.js/
  player.html text-style resolver pair (§5's "second drift pair").
  Verified against a
  local card with deliberately conflicting reel vs. card-override values
  (different accent colors, outline, background, title) - every override
  won cleanly, all via the browser, no console errors.
- Also: `js/config.js` now points `WORKER_BASE_URL` at `localhost:8787`
  automatically when served from `localhost`, so local dev never touches
  production KV - run `npx wrangler dev` (from `worker/`, or pass
  `--config wrangler.toml` explicitly - see worker/README.md for why) +
  `python3 dev-server.py` together for a fully local loop.
- A real (non-test) example is live: the "Horizon Call of the Mountain"
  reel is published to production as reel id `hcotm` (6 real tracks, real
  per-track background images), and all of its card assets (banner image/
  video, logo, 4 partner logos, 6 audio tracks) are uploaded to production
  R2 under `images|video|audio/project-cards/hcotm/`. The card record
  itself (description/stats/links/cardOverrides JSON, ready to paste into
  the v1 stub form) hasn't been published yet - see chat history for the
  full JSON blob, not saved to a repo file.

Not started: §7.6 (real repeater form, including a "Manage Published
Cards" modal with its own Stats button), and all of §6 (boxed-ape-site
injector). §7a (not scheduled) notes a possible future contextual-hint UX
for reel fields a card ignores.

**Everything in §5 (the render slice) is now done.** What's left is
entirely builder-side UI (§7.6) and the boxed-ape-site injector (§6).

Source snapshot from boxed-ape-site is in `boxed-ape-source/` (see its
README for provenance + a per-file guide).

---

## 1. Guiding decision: a card is a *referenced* reel + an Info panel

Do **not** build a new player or a second render path. A project card =

- a real **reelplayer reel** — authored 100% in the existing Reel builder,
  untouched, referenced by id. The card does **not** copy the reel's config.
- **+ an "Info" tab** next to the reel's "Listen" tab: description, stats,
  links, partner logos. Markup ported from
  `boxed-ape-source/project-card.js` — chrome only, not its interaction logic
  (see §5).

**The card owns the collapse.** The banner ⇄ tabs expand/collapse is *card*
chrome (the boxed-ape mechanic). The reel inside renders in **static
presentation, always** — just the player, no reel-level banner, no nested
expand. `mode` and every expandable / player-closed-idle field on the reel is
ignored in a card. Any reel is pickable; how it was authored for its own
standalone embed doesn't matter.

**Reference model, not copy.** A `card_<id>` blob holds only card-only fields
+ `reelId` + a `cardOverrides` block. The Worker inlines the referenced reel
into the `/cards/:id` response; the player draws it **inline** (one iframe,
one document, one resize handshake — not an iframe nested in the card
iframe). Editing the reel updates every card that points at it.

Precedent: `js/modules/pageBlockRenderer.js`'s `renderPlayer()` +
`js/modules/reelPicker.js` already do exactly this for Page *player blocks* —
reference a reel by id, pass page-level overrides into the player. Cards are
the same shape; reuse `reelPicker.js` for the card form's picker.

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

Because the reel is referenced, a card blob is *just* the card-only fields
plus an override block — none of the colour / background / expandable /
playlist / text-style fields (those live on the reel):

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
order           number   (default sort in the sidebar list; NOT layout)
cardOverrides   object   (see "Data boundary" below — visual props that win
                          over the reel's own, for page-wide consistency)
```

`enableListenTab` from the snapshot is gone — it's just `!reelId`.

### Data boundary: reel vs card

What `renderPlayer()` gets is the inlined reel with `cardOverrides` merged on
top and `mode` forced to static. Reel schema is `embedExporter.js`
`storeReelData()` / `builder.js` `createEmptyReel()`.

**Pass through unchanged (the actual player):**
`playlist[]` (url, title, per-track `backgroundImage`/`backgroundVideo`/
`backgroundZoom`).

**Pass through, but `cardOverrides` wins when set:**
`varUiAccent`, `varWaveformUnplayed`, `varWaveformHover`, `playerTextStyles`
(track-name / playlist text), `hoverDarken*`, `idleUnblur*`,
`playerOutline*`, wrapper `backgroundColor` / `overlayColor` /
`backgroundOpacity` / `backgroundBlur`.

**Ignored in a card (card chrome supersedes):**
`mode`, `expandableCollapsedHeight`, `expandableExpandedHeight`,
`projectTitleImage`, `showWaveformOnCollapse`, all `playerClosedIdle*`
(no collapsed reel state), `playerHeight` (player fills the Listen-tab box,
playlist scrolls via `playlistScroll.js`), `showTitle`/`title` as a player
overlay (card has its own `<h3>` + banner logo — override back on with
`cardOverrides.showReelTitle`).

**Banner visual:** defaults to the reel's `backgroundVideo` →
`backgroundImage` → `playlist[0].backgroundImage`; `cardOverrides.bannerImage`
/ `bannerVideo` override.

**`cardOverrides` whitelist:** `accent`, `waveformUnplayed`, `waveformHover`,
`playerBackground`, `textStyles`, `bannerImage`, `bannerVideo`,
`showReelTitle`, `outlineWidth`/`outlineColor`, plus card-chrome vars
(`--card-gradient-top`/`-bottom`, `--card-tab-toggle-bg`, `--card-tab-active-bg`,
`--card-text-primary`/`-secondary`, `--card-icon-filter` — from the snapshot's
`themeColors`).

### Form

A single small panel — no reel-config fields:

- **reel picker** — `reelPicker.js` (already built for Page player blocks) +
  a "none / Info-only" option
- description — textarea, blank-line separated → `description[]`
- stats — repeater of `{ label, value }` rows
- links — repeater of `{ url, icon (select from `assets/card-icons/`), alt }`
- partner logos — repeater using the existing media/file picker
- logo + logoAlt — media picker + text
- composers — text
- analyticsEnabled — checkbox
- **Card style overrides** `<details>` — the `cardOverrides` whitelist:
  colour pickers (reuse `colorPicker.js`) for accent / waveform / player
  background / card-chrome vars, banner media pickers, `showReelTitle`
  toggle. All optional; empty = use the reel's own value.

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

1. Fetch `/cards/<cardId>` → `{ ...cardFields, cardOverrides, reel }`.
2. Render the **card chrome** from `cardFields`: outer frame, Info/Listen
   `.tab-toggle`, Info panel (`renderExtraContent()`, `renderStats()`,
   `renderLinks()`, `renderPartnerLogos()` ported from
   `boxed-ape-source/project-card.js` — **markup only**). The collapsed
   **banner** is card chrome too (background media + overlay `logo` +
   `partnerLogos` on hover), not the reel's collapsed state.
3. Build the player config: `{ ...reel, ...merge(cardOverrides), mode:
   "static" }` (see §3 "Data boundary" for the merge rules), then call the
   **same `renderPlayer()`** the builder preview uses. Identical code path,
   no copy. Pass `showTitle: cardOverrides.showReelTitle ?? false`.
4. No `reel` → Info-only: skip step 3 (no player instantiated).
5. **Sizing:** the player fills the Listen-tab box; `playlistScroll.js`
   scrolls the playlist within it (the snapshot's `switchTab()` already
   matches both tabs to the Info tab's height — keep that). The card
   bootstrap owns the single `reelplayer:resize` post to the host —
   `max(bannerHeight, activeTabHeight)`; the inline player posts nothing
   cross-frame (same document).
6. Port `boxed-ape-source/project-card.css` → new **`css/card.css`**, loaded
   by `player.html`. Card-chrome `--card-*` vars come from
   `cardOverrides` (falling back to the reel's own colours); the player
   region's own vars resolve as they already do.

### Text-style resolver — the CLAUDE.md duplication pair

`cardOverrides.textStyles` must slot in as a **new top tier** above
`reel.playerTextStyles`, mirroring how `page.textStyleDefs` already does for
Pages. That resolution lives in `previewManager.js`'s
`resolveTextUnit()`/`textUnitStyleVars()` **and** a hand-copy inside
`player.html`'s inline `<script>` — the identical edit goes in both, verified
against a real embed (this is the second drift pair CLAUDE.md warns about).

### Do NOT port the snapshot's interaction logic

`project-card.js`'s `handleMouseEnter/Leave`, `expand()`, `collapse()`,
`MOUSE_LEAVE_DELAY` auto-collapse are **desktop-hover-only** and break on
touch (no `mouseleave` on a phone → card stuck open).

**Modeled on, not literally reusing, the reel's expandable-mode.** The card
should *feel* identical to a reel expanding — hover-to-expand on desktop,
the same scroll-band `IntersectionObserver` approach on mobile
(`setupExpandableModeTouchInteractions()` in `js/player.js`) rather than
boxed-ape's fragile hover-timeout, so it never gets stuck open on touch.
But `player.js`'s actual `expandPlayer()`/`collapsePlayer()` aren't callable
for this: they're wired directly into that one reel's own wavesurfer/video-
crossfade/idle-manager state and a resize height keyed to the *reel's own*
`--expandable-expanded-height` — none of which exists (or should exist,
since the reel inside always renders `mode:"static"`) for the card wrapper.
The card needs its **own small, new expand/collapse controller** — same
desktop-hover / mobile-scroll-band interaction pattern, new code, targeting
the card wrapper's own banner⇄Info/Listen-tabs state and its own resize
height (whichever of {banner, Info tab, Listen tab} is visible) instead of
the reel's. The card wrapper adds only the Info/Listen tab toggle on top of
that — it does not re-implement hover-to-play.

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

## 7a. Future UX idea: contextual hint for card-ignored reel fields

Not scheduled, no slice assigned yet - noted 2026-09-14 so it isn't lost.

A reel author who already knows they're building specifically for a card
has no way to tell, while editing, that Player Mode/Height/Closed-idle
settings are ignored once that reel is referenced by a card (§3 "Data
boundary"). Considered adding a third "Project Card" mode alongside
Static/Expandable to strip those fields - rejected: a reel is meant to be
reused (the same reel can back a standalone embed *and* several cards at
once), so permanently hiding fields based on "how is this used" breaks
the moment that reel is also used somewhere they matter.

Preferred direction instead: once a reel is referenced by at least one
published card (`card_*` scan, same shape as the existing dangling-
reference warn on reel delete - §4), show a small inline notice next to
the Player Mode/Static-or-Expandable-settings/Closed-idle sections in the
Reels tab ("Ignored when this reel is embedded in a card") - informational
only, never removes/disables anything, so a reel used both standalone and
in a card still shows every field for its standalone use.

---

## 8. Resolved decisions

Settled 2026-09-09.

- **Card ↔ reel: reference model.** A `card_<id>` blob = card-only fields +
  `reelId` + `cardOverrides`. The Worker inlines the reel on GET; the player
  draws it inline (one iframe). Editing the reel updates every card. The card
  form loses all reel-config fields — Info panel + reel picker
  (`reelPicker.js`, already built) + an optional override block. Cost: the
  reference can dangle (handled — GET returns `reel: null` → Info-only, plus
  a builder warn on reel delete).

- **Reel renders static inside a card; `cardOverrides` is the consistency
  layer.** The card owns collapse/expand, so the reel's `mode` +
  expandable/closed-idle fields are ignored (§3 "Data boundary" has the full
  pass-through / ignored / overridable split). The player config is
  `{ ...reel, ...cardOverrides, mode:"static" }` merged at one point in the
  `mode:"card"` bootstrap. Any reel is pickable regardless of how it was
  authored. `cardOverrides.textStyles` needs a new top tier in the
  `previewManager.js` + `player.html` text-style resolver pair (§5).

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
