# ReelPlayer

Vanilla JS/CSS embeddable audio/video player builder. No build tooling — plain
`<script type="module">` ES modules, no bundler, no framework, no package.json
dependencies to install for the app itself.

## Two apps in one repo

- **`index.html` + `js/builder.js`** — the builder: the internal tool used to
  configure a "reel" (playlist + player config) and publish it as an embed.
- **`player.html` + `js/player.js`** — the actual embeddable player that runs
  on third-party sites once a reel is published.

**`css/layout.css` is loaded by both.** Anything in it must keep working with
a reel's own per-reel light/dark appearance — never add builder-chrome-only
styling there. Builder-only chrome styling belongs in `css/builder.css`,
scoped under `.builder-app` (see below).

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

## Media browsing: one shared component, two contexts

`js/modules/mediaBrowser.js` (`renderMediaBrowser(container, options)`) is
the single UI for both:
- the Media Library tab (`js/modules/mediaLibrary.js`, `mode: 'manage'`)
- the file-picker modal (`js/modules/filePicker.js`, `mode: 'select'`),
  used everywhere a track/background file needs picking.

Don't fork this into two implementations again — extend the shared
component and thread through `mode`/options instead.

Sizing: both contexts size off the viewport, not off however many files are
in the current folder — see `.file-picker-content` (modal) and
`#mediaLibraryView` (tab) in their respective CSS. `.media-browser-body`
itself is `flex: 1; min-height: 0` and relies on internal `overflow-y: auto`
scrolling on the sidebar/main panes, not on the outer container growing.

## Cloudflare backend (`worker/`)

Reel publishing and the Media Library are backed by a Cloudflare Worker +
KV (reel JSON) + R2 (media files) — see `worker/README.md` for setup.
`js/config.js` holds the live `WORKER_BASE_URL` and `R2_PUBLIC_URL`.

- `worker/secret` holds the plaintext shared password locally and is
  gitignored — never let it leak into a committed file. Grep for it before
  committing if you've touched worker/auth-related code.
- Publish/manage/upload routes are gated by `Authorization: Bearer
  <BUILDER_PASSWORD>`, checked via `isAuthorized()` in `worker/src/index.js`.
  Read-only media serving is public (via the R2 public dev URL).

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
