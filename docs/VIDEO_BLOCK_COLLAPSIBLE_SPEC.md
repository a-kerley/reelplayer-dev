# Video Block — Collapsible / Expandable Mode Spec

Status: **in progress** — desktop hover path, editor UI, overlay colour +
toggle, and YouTube/Vimeo playback detection all landed and verified with
YouTube. Mobile touch path (scroll observer + tap bar + scroll
compensation) implemented, pending on-device verification. Remaining:
verification pass (pageBackground probe, non-expandable unchanged check,
page.html), then commit. Part 2 (cross-media pause coordination) still
separate.
Scope: the page builder's `embedded-video` block only. Part 1 of a larger
video-block effort (Part 2: cross-media pause coordination; Part 3: idle
dimming / "cinema mode"). Those are out of scope here except where a stub
hook is noted.

Test locally, do not push per change. Claude scripts the checks; the user
runs them in a local browser and confirms before any commit.

---

## 1. Concept

An `embedded-video` block can opt into **expandable mode**. When on:

- On load it renders **collapsed** — a short, understated box (`collapsedHeight`)
  showing a blurred background image + an optional overlay (image or text),
  so it doesn't dominate the page.
- On **pointer-enter** (desktop) / **scroll into the viewport middle third**
  or **tap** (touch) it **expands** to its natural size (aspect-ratio driven,
  i.e. exactly today's rendering) with an elegant de-blur + fade-out of the
  collapsed layers, revealing the YouTube/Vimeo iframe.
- It will **not collapse while the video is playing** (Part 2 wires the
  play-state signal; this spec leaves the hook).

Non-expandable video blocks render **exactly as today** — the renderer
early-returns the existing path.

---

## 2. Data model

New fields on an `embedded-video` block (defaults chosen so an existing
saved block, lacking all of them, is byte-for-byte unchanged):

```js
{
  // existing
  blockId, type: "embedded-video", videoUrl: "", aspectRatio: "16:9",

  // new — expandable mode
  expandable: false,          // master toggle
  collapsedHeight: 120,       // px

  // collapsed BACKGROUND fill (cover, blurred, behind everything)
  closedBgMode: "thumbnail",  // "thumbnail" (YouTube only) | "custom"
  closedBgImage: "",          // media-library path, used when closedBgMode === "custom"
  closedBgBlur: 8,            // px

  // collapsed FOREGROUND overlay (contained, centered, on top of the bg fill)
  overlayMode: "none",        // "none" | "image" | "text"
  overlayImage: "",           // when overlayMode === "image"
  overlayText: "",            // when overlayMode === "text"
  // text styling — identical shape to the button block (createButtonConfig):
  overlayTextStyleRole: undefined,   // role drives font/size/weight/color together
  overlayFontFamily: undefined,      // the four below apply only in "Custom" (role unset)
  overlayFontSize: undefined,
  overlayFontWeight: undefined,
  overlayTextColor: undefined,
}
```

Two **separate** image slots, confirmed intentional:
- `closedBgImage` / thumbnail = background fill, `object-fit: cover`, blurred.
- `overlayImage` = foreground layer, contained + centered, with the reel
  player's intro scale-in animation (see §4).

Worker: no changes — `blocks` is stored verbatim (`Array.isArray` only).

---

## 3. Editor — `createEmbeddedVideoConfig` (`js/modules/pageBlocksEditor.js`)

Append below the existing URL + aspect-ratio rows. All reuse existing shared
components; consistent with the reel player's Expandable Mode Settings
fieldset (`js/modules/expandableMode.js`).

| Control | Component | Notes |
|---|---|---|
| **Expandable** | `createToggleSwitch` (`domUtils.js`) | Off by default. When off, the rows below are hidden/dimmed (toggle-gating pattern from `createUrlInputRow`). |
| **Collapsed Height (px)** | `createValueControl` (`valueControl.js`) | default 120, min 60, max 400, step 5. Expanded height is computed, never authored. |
| **Collapsed background** | `<select class="builder-select">` | options: *YouTube thumbnail* / *Custom image*. The thumbnail option is only present when `videoUrl` parses as YouTube; Vimeo forces *Custom*. |
| **Custom image** | `createUrlInputRow` + file picker | shown when `closedBgMode === "custom"`. `directory: "assets/images/page-blocks"`, image extensions. |
| **Background blur (px)** | `createValueControl` | default 8, min 0, max 50, step 1. Mirrors `playerClosedIdleBlur`. |
| **Overlay** | `<select class="builder-select">` | *None* / *Image* / *Text*. Mutually exclusive. |
| — Overlay image | `createUrlInputRow` + file picker | when `overlayMode === "image"`. Same directory/extensions as above. |
| — Overlay text | `<input type="text">` + `createTextStyleToolbar` (`styleToolbarWidgets.js`) | when `overlayMode === "text"`. Toolbar wired to the `overlay*` getters/setters, `roleDefs: page?.textStyleDefs`, `pickrInstances: toolbarPickrInstances`, `onCommit: () => { refreshPreview(); onChange(); }`. Exactly the button block's pattern. |

Every commit calls `refreshPreview()` + `onChange()`. URL fields commit on
blur (matches the existing video URL field).

---

## 4. Renderer — `renderEmbeddedVideo` (`js/modules/pageBlockRenderer.js`)

`if (!block.expandable)` → **return the existing implementation untouched.**

`if (block.expandable)` → build this layer stack inside
`.page-block-embedded-video` (which gets `data-expandable` and inline
`--ev-collapsed-height` / `--ev-blur` custom properties):

1. **iframe** — rendered as today (full size, `aspect-ratio` box, broad
   `allow=`, `allowfullscreen`). Mounted **immediately** on page load, behind
   the closed layers (user's choice — instant reveal, accepts the up-front
   ~1MB load per block).
2. **`.ev-closed-bg`** — `<img>`, `position: absolute; inset: 0;
   object-fit: cover; filter: blur(var(--ev-blur))`.
   - src: YouTube `https://img.youtube.com/vi/<id>/hqdefault.jpg`
     (`hqdefault` always exists, unlike `maxresdefault`) or `closedBgImage`.
   - `onerror` → drop this layer (reveal iframe), mirroring
     `validateProjectTitleImage()` in `player.js`.
   - Needs a YouTube-id accessor: **extend `VIDEO_URL_PATTERNS`** with a
     `thumb` builder rather than add a second parser — keeps YT/Vimeo
     detection single-sourced (see the comment above the table).
3. **`.ev-overlay`** — only when `overlayMode !== "none"`.
   - Image: `<img>`, contained + centered. Reuse the reel player's
     `.project-title-overlay` intro classes (`needs-intro` →
     `intro-animation`, ~800ms scale-in on first load). Port the keyframes
     into `page.css` if they aren't in a shared sheet.
   - Text: a text element with `data-text-role="<role>"` (when a role is
     set) or inline `font-family` / `font-size` / `font-weight` / `color`
     (Custom mode) — identical resolution to `renderButtonBlock()`.

### State machine

- **Collapsed** (default): wrapper `height: var(--ev-collapsed-height)`;
  layers 2–3 `opacity: 1`, blur applied.
- **Expand**: add `.ev-expanded`. Compute the target pixel height
  (`aspectRatio` × current wrapper width), set it explicitly, transition,
  then clear to `""` on `transitionend` so `aspect-ratio` resumes. Layers
  2–3 transition `filter: blur → 0` and `opacity → 0`. (Same
  compute-then-clear trick as `--expandable-expanded-height` in the reel
  player.)
- **Collapse**: reverse. **Blocked while playing** — Part 2 hook. Desktop:
  triggered on pointer-leave, with the reel player's ~1.2s incidental-leave
  dead-time. Mobile: immediate (see §5).
- `prefers-reduced-motion` → no transitions, snap.
- **No-JS** → renders expanded (iframe visible) so content is always
  reachable.

### Runs in both contexts

The renderer's expand/collapse wiring executes both on the public page
(`page.html`) and in the builder preview pane (`pageBlocksEditor.js`'s
`updatePageBlocksEditor` → `renderBlock`). `refreshPreview()` re-renders the
row on field edits; the hover/expanded state is transient DOM, rebuilt
clean — acceptable, confirm during testing.

---

## 5. Mobile (touch) behavior

Replicates the reel player's expandable mobile UX
(`setupExpandableModeTouchInteractions` in `player.js`).

**Detection:** `window.matchMedia('(hover: none) and (pointer: coarse)')` —
verbatim from `player.js:107`. NOT touch-support detection (keeps
mouse-primary touchscreen laptops on the hover path).

On touch, wire the scroll/tap path **instead of** the hover listeners:

1. **Scroll-position expand/collapse** — `IntersectionObserver`,
   `rootMargin: '-33% 0px -33% 0px'` (root = viewport middle third),
   `threshold: 0`. Asymmetric: expands when *any* part enters the band,
   collapses only once *fully* out either side.
2. **Immediate collapse** on mobile (no desktop dead-time — a scrolling user
   passes the trigger too fast).
3. **Mobile-only tap bar** — a `.ev-tap-bar` element (analogous to
   `.expandable-tap-bar`), rendered only in expandable mode, shown only
   under `@media (hover: none) and (pointer: coarse)`, present in both
   states. Tapping it toggles expand/collapse. Tapping anywhere on the
   collapsed block also expands.
4. **Flat tap cooldown** — after a manual tap, ignore every
   IntersectionObserver firing for `fade + transition + 150ms`
   (`mobileManualOverrideUntil` pattern). The observer also fires *during*
   the expand/collapse animation as the box geometry changes; inferring
   "animation done" from intersection state is unreliable.
5. **Directional scroll compensation** — on scroll-out collapse, run
   ResizeObserver-driven scroll compensation (like
   `compensateScrollDuringCollapse`) **only when the block exits off the
   top** of the viewport (off the bottom there's no visible space below to
   anchor). The video block is in-document (not an iframe), so read rects
   directly — the cross-frame `boundingClientRect` vs `rootBounds` gotcha
   from `player.js` does not apply here.
6. **Playback lock on touch** — while playing, the scroll observer must NOT
   auto-collapse when the block leaves the band (mobile equivalent of the
   desktop no-collapse-while-playing rule). Part 2 hook.

Not ported (no equivalent surface in v1): the `@media (hover: none)`
control-reveal for `#playPause` / `.volume-control`, and the volume-icon
tap-to-reveal — the video block's play/volume controls live inside the
provider iframe.

Deferred: a "hover / tap to expand" text hint on the collapsed state.

---

## 6. CSS — `css/page.css`

- `.page-block-embedded-video[data-expandable]` + `.ev-closed-bg` /
  `.ev-overlay` / `.ev-tap-bar` / `.ev-expanded` states and transitions.
- `@media (prefers-reduced-motion: reduce)` — kill the transitions.
- `@media (hover: none) and (pointer: coarse)` — show `.ev-tap-bar`.
- Port `.project-title-overlay` intro keyframes if not shared.
- Brace-count sanity check after editing.

---

## 7. Risks on record

- **Height animation** between explicit `collapsedHeight` and
  `aspect-ratio`: needs the compute-then-clear trick. Test that clearing on
  `transitionend` doesn't cause a visible reflow jump.
- **`pageBackground.js` re-measure**: expand changes block height → content
  height → parallax / full-bleed re-measure. Verify with the scripted
  `resize` + `element.style.transform = 'translateY(2000px)'` probe from
  `CLAUDE.md`; confirm `document.documentElement.scrollHeight` doesn't move.
- **Builder preview parity** (§4) — transient hover DOM through
  `refreshPreview()`.
- **Mobile observer vs animation** — the flat cooldown (§5.4) is the
  mitigation; verify a fast tap-collapse-then-scroll doesn't re-expand.

---

## 8. Test plan (local, user-verified)

1. `node --input-type=module --check < js/modules/pageBlockRenderer.js`
   and `< js/modules/pageBlocksEditor.js`. CSS brace count.
2. User loads `index.html` locally: add an `embedded-video` block, toggle
   **Expandable**, exercise every field. Hover expand/collapse in the
   preview pane. Confirm YouTube thumbnail auto-fills; confirm Vimeo forces
   Custom image.
3. User loads `page.html` for a page containing the block (Preview Page or
   published). Confirm desktop hover and, via device emulation / a real
   device, the mobile scroll + tap-bar path.
4. `pageBackground.js` probe (Claude scripts, user runs) on a parallax page
   containing an expandable video.
5. Confirm a **non-expandable** video block is unchanged from `main`.

---

## 9. Build order

1. Data model + renderer (non-expandable path proven untouched first, then
   the expandable layer stack + desktop hover state machine).
2. Editor config UI. DONE (+ Overlay Colour row with enable toggle,
   modelled on the reel builder's "Idle Overlay Colour")
3. YouTube/Vimeo playback detection (wireExpandableVideoPlayback) - pulled
   forward from Part 2 because "don't contract while playing" needs it.
   Sets wrapper.dataset.evPlaying, dispatches ev:play / ev:pause. Only the
   cross-media *pausing* stays in Part 2. DONE
4. Mobile touch path (scroll observer, tap bar, cooldown, directional
   scroll compensation). IMPLEMENTED - not yet verified (see section 10).
5. CSS polish + reduced-motion + intro animation. DONE

Steps 1 and 5 also DONE.

Part 2 (cross-media pause coordination) builds on the ev:play / ev:pause
signal from step 3.

## 10. Deferred verification - TODO before this chunk ships

Flagged 2026-08-31. Desktop hover path + playback detection verified with
YouTube; everything below still outstanding.

- [ ] Mobile touch path on a real device / Chrome device-emulator:
  tap-to-expand via the .ev-tap-bar grabber; scrolling into / out of the
  viewport middle third expands / collapses; playback lock (scroll a
  playing video out means it stays expanded; pause means it collapses);
  scroll-out collapse near the top of the page doesn't jump content below.
- [ ] pageBackground.js growth probe - on a parallax page with an
  expandable video, script repeated resize events + a direct
  wrapper.style.transform = 'translateY(2000px)' probe; confirm
  document.documentElement.scrollHeight does not move (CLAUDE.md gotcha).
- [ ] page.html render (Preview Page / published): desktop hover
  expand/collapse, playback lock, overlay image intro animation, overlay
  text roles.
- [ ] Non-expandable regression - a plain embedded-video block visually and
  behaviourally unchanged. NB its embed URL now carries ?enablejsapi=1 (+
  &origin=) unconditionally; intentional, no visible effect, but the one
  non-cosmetic delta from main.
- [ ] Vimeo playback detection (only YouTube tested so far).
