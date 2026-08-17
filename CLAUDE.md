# ReelPlayer

Vanilla JS/CSS embeddable audio/video player builder. No build tooling — plain
`<script type="module">` ES modules, no bundler, no framework, no package.json
dependencies to install for the app itself.

## Three apps in one repo

- **`index.html` + `js/builder.js`** — the builder: the internal tool used to
  configure a "reel" (playlist + player config) and publish it as an embed,
  or a "page" (ordered content blocks) and publish it as a standalone
  shareable URL. Three sidebar tabs — Reels, Pages, Media Library — switched
  via `js/modules/tabController.js`.
- **`player.html` + `js/player.js`** — the actual embeddable player that runs
  on third-party sites once a reel is published.
- **`page.html`** — the public, standalone renderer for a published page.
  Fetches `GET /pages/:slug` from the Worker and renders each block via
  `js/modules/pageBlockRenderer.js`'s `renderBlock()` — the same function
  the builder's own block-editor live preview uses (`js/modules/
  pageBlocksEditor.js`), so this is never a second copy of block-rendering
  logic. A page's "player" block embeds `player?id=<reelId>` as an iframe,
  reusing `player.html` completely unmodified rather than re-implementing
  reel playback a third time (see `js/modules/embedExporter.js`, which
  already generates that exact markup for third-party embeds).

Pages and reels are separate content types stored in the same Worker/KV
namespace under different key prefixes (`page_<slug>`/`draft_page_<id>` vs
`reel_<id>`/`draft_<id>`) — see `worker/CLAUDE.md`. Unlike a reel's embed id
(an opaque content hash, silently regenerated on every publish), a page's
`slug` is a stable, user-editable public identifier that survives content
edits — `js/modules/pagePublish.js`/`worker/src/index.js`'s `POST
/pages/:slug` handle the resulting rename/collision mechanics that reels
have no equivalent of.

## `player.html`'s embed bootstrap duplicates `js/player.js`, and drifts

`player.html`'s inline `<script type="module">` doesn't call `playerApp`'s
own `renderPlayer()` for a real embed - it has its own hand-written
`renderPlayerHTML()` (DOM markup) and `initializeEmbedPlayer()` (wiring:
`cacheElements()`, mode setup, event listeners, etc.) that are meant to be
equivalent to what `renderPlayer()` does for the builder's live preview, but
are a **separate, manually-kept-in-sync copy**, not the same code path.

This has already caused two real, hard-to-spot bugs (both worked perfectly
in the builder preview, both silently broken only in a real embed):

- `initializeEmbedPlayer()` never created `playerApp.closedIdleManager` -
  every `closedIdleManager?.*` call elsewhere in `player.js` silently
  no-op'd via optional chaining, so player-closed-idle never activated at
  all in an embed.
- `renderPlayerHTML()`'s video elements were missing the unsuffixed
  `main-video`/`track-video` base class that `renderPlayer()` includes
  alongside the `-a`/`-b` suffixed ones. `videoPlayback.js`'s
  `fadeOutVideo()` reads exactly that class to route cleanup by type -
  missing it silently misrouted every track-video cleanup as type `'main'`,
  which compared against the wrong layer pointer and left
  `videoState.trackVideoPlaying` stuck `true` forever after the first exit,
  permanently blocking `checkConditions()` from ever re-entering idle.

Neither failure threw an error or logged a warning - both were just quiet
no-ops. When adding or changing anything in `renderPlayer()` (player.js) -
new DOM structure, new classes, new setup calls, new state resets - check
whether `player.html`'s `renderPlayerHTML()`/`initializeEmbedPlayer()` needs
the equivalent change, and verify by testing an actual embed (see "Test
Embed" button in the export dialog), not just the builder preview.

**`css/layout.css` is loaded by both.** Anything in it must keep working with
a reel's own per-reel light/dark appearance — never add builder-chrome-only
styling there. Builder-only chrome styling belongs in `css/builder.css`,
scoped under `.builder-app` (see below).

## A second, separate duplication pair: Player Text Styles' resolution logic

`js/modules/previewManager.js`'s `resolveTextUnit()`/`textUnitStyleVars()`
(the Reels tab's own live preview) and `player.html`'s inline `<script>`
copies of the same two functions are a **second instance** of the
`player.html`/`player.js` drift problem above — a completely different
file pair, so fixing that one doesn't touch this one. Any change to how a
reel's Title/Track Name/Playlist text resolves (a new fallback tier, a new
field) needs the identical edit in both places, verified by actually
testing an embed, or the builder preview will show something a real embed
doesn't.

Resolution order, most to least specific: the embedding page's own
Customize Text Styles role definition (`page.textStyleDefs`, present only
when this reel is actually inside a page's Player block) → this reel's
own "Edit Fallback Text Styles" role definitions
(`reel.playerTextStyles.roleFallbacks`, edited from the Reels tab) → the
text unit's own custom fields (reachable only when its `role` is unset,
i.e. "Custom" mode) → `css/player.css`'s hardcoded default. A reel isn't
tied to any one page, so the fallback tier exists specifically for the
Reels tab's own preview and any third-party embed with no page context at
all.

## Builder dark theme — scope boundary

The builder chrome (sidebar, forms, buttons, dialogs) is dark-themed,
dark-only, no toggle. Palette: panels `#2f2f2f`/`#252525`, inputs `#1e1e1e`,
accent `#4a90e2`, text `#fff`/`#ccc`/`#999`, borders `#444`/`#3a3a3a`, danger
`#dc3545`.

This must **never** touch the actual reel/player-preview colors — those are
per-reel and user-configurable via Pickr color pickers:
`--ui-accent`, `--background-color`, `--waveform-*`, `--player-border-color`,
`--overlay-*`, `--expandable-*`, `--playback-idle-*`, `--video-*`, `--audio-*`
in `css/variables.css`, plus the reel-color literals in `js/modules/colorPicker.js`,
`js/modules/colorUtils.js`, `js/modules/presetModal.js` (swatch/preview
colors), `js/modules/playlistScroll.js`, `js/modules/previewManager.js`, and
`js/modules/embedExporter.js`. Those hex values (`#2a0026`, `#929292`,
`#001f67`, etc.) are reel *data* being displayed/exported, not UI chrome —
leave them alone.

Dark styling lives in `.builder-app` (in `css/builder.css`), not on `body`,
specifically so `player.html` (which shares `css/layout.css` with the
builder) is unaffected.

`color-scheme: dark` is set on `.builder-app` to get native form-control
dark defaults. Any button that doesn't have an explicit CSS rule falls back
to native chrome under this, which picks up the OS accent color (seen twice:
`#manageEmbedsBtn` and `.crop-preview-btn` both shipped with no matching CSS
rule and rendered as a jarring purple/maroon blob until one was added). If a
new button looks oddly colored, this is the first thing to check.

## Layout gotcha: `.builder-main`'s 500px bottom padding

`.builder-main` has `padding-bottom: 500px` — intentional, gives the reel
edit form room to scroll comfortably so the last field isn't flush against
the viewport bottom. It is **not** a layout bug, but it silently eats almost
all available flex space for any other child (e.g. the Media Library tab),
shrinking a `flex: 1` child down to a sliver regardless of any height you
give it. When adding new full-height content inside `.builder-main`, either
work around this padding (see `.builder-main.media-library-active` for the
pattern of overriding it just for that view) or don't nest inside
`.builder-main` at all.

## Gotcha: a `<td>`'s `width` alone doesn't constrain a column

The default `table-layout: auto` treats a cell's `width` as only a
starting suggestion — a cell whose content wants to be wider (e.g. a
Customize/Fallback Text Styles row previewing a large font-size) still
grows the whole column past it, silently defeating any `overflow:hidden`/
`text-overflow:ellipsis` set on that cell. `table-layout: fixed` — with
widths set on the *header* row's cells, since fixed layout derives every
column's width from the first row and ignores content afterward — is what
actually enforces a cap; see `js/modules/styleToolbarWidgets.js`'s
`openTextStyleDefsDialog()`.

## Gotcha: `js/modules/pageBackground.js` and `document.documentElement.scrollHeight`

Three related, hard-to-spot bugs have come out of this one file, all
variations on the same trap: **never size or trigger a re-measure off
`scrollHeight`/`getContentHeight()` in here** - it reflects the extent of
every descendant, including this module's own absolutely-positioned
layers, so feeding it back into their own sizing creates a growth loop with
no ceiling. Always measure the real content element's own box
(`getContentExtent()` - `contentEl.offsetTop + contentEl.offsetHeight`)
instead:

- The "Extend to top/bottom of page" content-overlay tint
  (`contentOverlayFullBleed`) used `top:0; bottom:0; height:auto`, which
  only stretches to fill the *containing block's own box* - shorter than
  the viewport whenever the page has little content, so the tint stopped
  short of the real bottom on short pages.
- Fixing that by sizing off `scrollHeight` instead created a second bug: in
  "scroll" parallax mode, `.page-background-layer` is deliberately
  oversized past real content (`SCROLL_MODE_BUFFER`), and each `resize`
  event (fired by mobile browsers as their address bar hides/shows during
  scroll) fed that oversize into the overlay's height, which fed back into
  the layer's own next size calculation - unbounded growth on every
  resize, confirmed by hand.
- Separately, `.page-background-layer`'s scroll-driven
  `transform: translateY(scrollPos * factor)` has its own version of the
  same trap: Chrome includes a transformed element's *post-transform* box
  in its ancestor's scrollable overflow, so translating the layer down as
  the user scrolls directly grew the page's own `scrollHeight` by the same
  amount - which grew how far they could scroll, which grew the next
  translate. This read as "scrolling near the bottom of the page slowly
  extends it forever" and had nothing to do with resize events at all. The
  layer is now wrapped in `.page-background-clip` (`overflow:hidden`,
  height capped via `getContentExtent()`) specifically to absorb this
  before it reaches the page's own scroll region.
- A later attempt to pad the full-bleed tint past the real bottom (as a
  safety margin for native rubber-band/elastic overscroll bounce) hit the
  same trap from a different angle: any real DOM box tall enough to be
  visible during a bounce is, by definition, tall enough to be reachable by
  *ordinary* scrolling too - there's no CSS way to paint below an element's
  true edge without that space becoming genuinely scrollable. The fix was
  to set `scopeEl`'s own `background-color` to the tint instead - browsers
  paint the overscroll-bounce gap from the container's `background-color`,
  which never affects scrollable layout at all.

If you touch parallax, full-bleed sizing, or anything that reads
`document.body`/`#pagePreviewPane`'s height in this file, verify by
scripting repeated `resize` events and a direct `element.style.transform =
'translateY(2000px)'` probe (not just eyeballing it - the growth is
gradual and easy to miss in a quick check) and confirming
`document.documentElement.scrollHeight` doesn't move.

## Media browsing, text-style toolkit, and Cloudflare backend

See `js/modules/CLAUDE.md` for the shared media-browser component
(`mediaBrowser.js`/`mediaLibrary.js`/`filePicker.js`) and the shared
text-style toolbar/dialog toolkit (`styleToolbarWidgets.js`), and
`worker/CLAUDE.md` for the Cloudflare Worker + KV + R2 backend.

## Verification workflow

Prefer DOM inspection (`page.evaluate()` + `getBoundingClientRect()` /
`getComputedStyle()`) over screenshots when checking layout, sizing, or
colors — screenshots are far more expensive in tokens and usually aren't
needed to answer a layout question. Reserve actual screenshots for genuine
visual/aesthetic judgment calls, and clip to the relevant region rather than
capturing the full page.

No test suite exists. `node --check` (via `node --input-type=module --check
< file.js`, since these aren't `.mjs`) catches syntax errors; brace-count
(`grep -o "{" | wc -l` vs `}`) is a quick CSS sanity check. Beyond that,
verification means actually loading `index.html`/`player.html` in a browser
and exercising the feature.

## Git workflow

Commit and push to `main` after making a change, without asking for
confirmation each time - the user has authorized this standing behavior for
this repo. (Ordinary git safety rules still apply otherwise: don't force-push,
don't skip hooks, don't rewrite existing commits.)
