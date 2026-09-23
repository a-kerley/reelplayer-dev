# Session status — 2026-09-23

Working notes on an **unresolved** player bug: playlist scrolling (mouse
wheel or trackpad) is laggy/unresponsive during playback, not when paused.
Multiple real bugs were found and fixed along the way (all landed, all
believed-good on their own merits), but the core symptom the user reported
is **still not fixed** as of the last message in this session. Read
"Current status" at the bottom first if you're picking this back up.

## Original symptom (verbatim, first report)

"I'd like to look into the scrolling performance of the player - it's quite
laggy especially during playback."

## Latest, more precise symptom (verbatim, after several fix rounds)

"scrolling using wheel or 2 fingers on trackpad in the playlist items area
during playback is laggy (not the case when paused). its like the area
isnt sensitive to when i start scrolling, or when the scroll is slow. it
only responds when the scroll is very fast."

Also reported in the same message, possibly related, possibly separate:

- Moving the mouse off a **static** player during playback doesn't trigger
  the idle dim.
- Trackpad-scrolling the playlist doesn't exit idle (when the player is
  already dimmed).

After the fixes below for both of those plus the "only fast scrolling
works" bug, the user's response was: **"ok this is not fixed."** — i.e. the
core laggy/unresponsive-scroll-during-playback symptom persists even after
fixing two real, confirmed, independent bugs that looked like strong
candidates.

## Fix progression (all commits on `main`, all still believed correct)

1. **`9b765f0`** — First real perf fix. `js/player.js`'s WaveSurfer
   `"audioprocess"`/`"seek"` handlers (fire continuously during playback)
   read `#waveform.clientWidth` every tick, forcing a synchronous layout
   flush each time. Cached as `this.waveformWidthPx` (set in
   `updateWaveformWidth()`, already frozen as an explicit inline style for
   an earlier, unrelated bug). Also split `playlistScroll.js`'s scrollbar
   position update (`getBoundingClientRect()` x2) out of the `'scroll'`
   listener - position only needs recomputing on real layout changes, not
   every scroll tick.

2. **`5ad0899`** — User reported the idle-dim state wasn't resetting while
   wheel/trackpad-scrolling the playlist (a wheel scroll fires no
   `mousemove`, which is all `resetPlaybackIdleTimer()` was wired to).
   Added a call to it inside the playlist's `'scroll'` listener.

3. **`d7a0a7c`** — User reported scrolling went "sticky again" right after
   #2. Cause: `resetPlaybackIdleTimer()` (`idleState.js`) called
   `getComputedStyle()` on every single call to re-read the static
   `--playback-idle-delay` CSS var - now hit on every scroll tick because
   of #2's change. Cached it (`cachedIdleDelay`).

4. **`84dc145`** — User asked directly "are we doing any caching when it
   comes to scrolling?" Audited and found `scrollHeight`/`clientHeight`
   were still read live in three hot paths (`updateScrollbarMetrics()`,
   `moveDrag()`, the `wheel` handler). Cached, refreshed only at real
   layout-change moments. Also found and fixed two **unrelated but real**
   memory/listener leaks while auditing for "prevent memory leaks/CPU
   creep": `initCustomScrollbar()` and `setupVolumeControls()` both run on
   *every* `renderPlayer()` call (the builder's live preview re-renders on
   every settings tweak, not once per session), and neither tore down its
   previous `ResizeObserver`/`document`-level listeners first - each
   re-render permanently leaked one more set.

5. **`0717733`** — Scrolling still laggy after #4. A fresh subagent
   re-read of the current code (specifically to rule out #4 as a
   regression before looking further) found `resetPlaybackIdleTimer()`
   still did real work every call even with #3's cache: `clearTimeout()`
   x3 + a classList check + a fresh `setTimeout()` allocation, on every
   scroll tick, but *only* while something is playing (its own first line
   is `if (!isPlaying) return`) - which is exactly why this only ever
   manifested "during playback". Throttled to one real reset per 150ms.

6. **`5f4045f`** — Still not fixed after #5. A second, more targeted
   subagent investigation (given the sharper "only responds to fast
   scrolling, not slow" description) found two genuinely different,
   previously-unexamined bugs, neither related to any of the perf work
   above:
   - **The actual "only fast scrolling works" bug**: `playlistScroll.js`'s
     `wheel` handler called `smoothScroll()` *synchronously* on the first
     event of any gesture, which immediately evaluated the `0.1` velocity
     stop-threshold against just that single event's contribution. A
     slow/gentle trackpad scroll's per-event `deltaY` is often small
     enough that `deltaY * 0.5` never clears `0.1` on its own, so the loop
     died on the spot every time - only a fast flick (one event with
     enough `deltaY` alone) ever crossed the bar. Fixed by never
     evaluating the threshold synchronously from the wheel handler -
     always defers to the next `requestAnimationFrame`, giving same-frame
     wheel events a chance to accumulate first.
   - **The mouseleave-idle bug**: both `setupStaticModeInteractions()`'s
     and `setupExpandableModeInteractions()`'s `mouseleave` handler only
     called `clearPlaybackIdleTimeout()` (cancels the pending countdown,
     replaces it with nothing), so once the cursor actually left the
     wrapper there was no countdown running at all - idle could only be
     reached by moving the mouse and then holding it still *inside* the
     wrapper. Fixed the static-mode case (the one reported) to call
     `resetPlaybackIdleTimer()` instead, arming the same countdown rather
     than cancelling it. Expandable mode's `mouseleave` was deliberately
     left alone - it also collapses the player, which already arms a
     separate `collapsedIdleTimeout` downstream, and that path wasn't
     reported broken.

   **Known loose end at the time this was fixed**: the wheel-sync-kill bug
   is pure velocity math, not conditioned on `isPlaying` anywhere - it
   should have reproduced identically when paused, which doesn't match the
   user's "not the case when paused" observation. Flagged but never
   resolved before the user retested.

## Current status — STILL BROKEN

After `5f4045f` (fix #6 above), the user's exact response was:

> "ok this is not fixed."

No further detail was given before this note was written (the user asked
directly for this progress note instead of continuing back-and-forth). So:
**two real, independently-confirmed bugs were fixed in #6, but whatever the
user is actually experiencing as "laggy during playback, not when paused"
persists regardless.**

## Where to pick this back up

Six rounds of "read the code, form a hypothesis, fix it, retest" have each
found *something* real but never the actual dominant cause - a pattern
worth noticing on its own. The next session should probably **stop
guessing from static code reading** and instead:

1. **Get a real Chrome DevTools Performance recording** of the exact
   repro: start playback, then slow-scroll the playlist with a trackpad or
   mouse wheel, capture ~5s, and look at the actual flame graph - what's
   consuming main-thread time frame-by-frame, whether frames are being
   dropped, and whether it's even a "something is slow" problem at all
   versus something more like an input-handling/event-coalescing issue
   under Chrome's own scroll-performance heuristics (e.g. the `wheel`
   listener's `{ passive: false }` + `preventDefault()`/`stopPropagation()`
   combo in `playlistScroll.js` is exactly the kind of thing that can make
   a browser treat a listener as "blocking" and change its own scroll
   scheduling behavior - not yet investigated at all).
2. **Re-confirm the paused-vs-playing discrepancy directly** - since fix #6
   in this session wasn't conditioned on playback state, if scrolling is
   *still* fine when paused and *still* bad when playing, that's strong
   evidence there's a genuinely separate, playback-only mechanism nobody
   has found yet (a real per-frame cost during playback, not a one-off
   logic bug like #6 turned out to be) - worth deliberately testing this
   specific comparison first, before anything else, to decide which
   direction to dig.
3. Consider whether `wavesurfer.js`'s own internal event dispatch (not
   just what this codebase's own `"audioprocess"` handler does with it,
   which was already checked and is cheap) could be doing something
   heavier - the two subagent investigations this session read wavesurfer
   v7's *source* for its rendering behavior (concluded cheap, a CSS
   clip-path/width update) but did not profile it running live.
