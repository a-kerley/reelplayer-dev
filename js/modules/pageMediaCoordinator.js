// pageMediaCoordinator.js - "one media source playing at a time" for a
// rendered ReelPlayer page.
//
// Two kinds of source live in a page's block list:
//   - embedded-video blocks (.page-block-embedded-video) - YouTube/Vimeo in
//     a cross-origin iframe. js/modules/pageBlockRenderer.js's
//     wireVideoPlaybackDetection() fires bubbling `ev:play` / `ev:pause`
//     CustomEvents on the wrapper as the embed plays/pauses, and listens for
//     an `ev:command:pause` CustomEvent back.
//   - reel player blocks (.page-block-player > iframe) - player.html in a
//     same-origin iframe. js/player.js posts `reelplayer:playing` /
//     `reelplayer:paused` to us and accepts `{type:'reelplayer:command',
//     command:'pause'}` back.
//
// Reel <-> reel is already handled inside the player itself
// (pauseOtherPlayers()/pauseForOtherPlayer() in js/player.js), so a
// `reelplayer:playing` here only needs to pause the *video* blocks; an
// `ev:play` from a video pauses everything else.
//
// One coordinator per full-page render - page.html's renderPage() and
// js/pagesController.js's renderPagePreview(). attachMediaCoordinator()
// returns a cleanup function; call it before re-rendering.

const VIDEO_SEL = ".page-block-embedded-video";
const REEL_IFRAME_SEL = ".page-block-player iframe";

export function attachMediaCoordinator(root) {
  if (!root) return () => {};

  // The source currently holding "the floor" (a video wrapper el, or a reel
  // iframe el). A repeat "playing" from whatever is already current is an
  // echo of our own pausing others - ignore it, so the pause/echo/pause
  // loop can't get going. Cleared when that same source reports paused.
  let current = null;

  function pauseVideos(except) {
    root.querySelectorAll(VIDEO_SEL).forEach((wrapper) => {
      if (wrapper !== except) wrapper.dispatchEvent(new CustomEvent("ev:command:pause"));
    });
  }

  function pauseReels(exceptIframe) {
    root.querySelectorAll(REEL_IFRAME_SEL).forEach((iframe) => {
      if (iframe !== exceptIframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: "reelplayer:command", command: "pause" }, "*");
      }
    });
  }

  function reelIframeFor(source) {
    return [...root.querySelectorAll(REEL_IFRAME_SEL)].find((f) => f.contentWindow === source) || null;
  }

  function onVideoPlay(event) {
    const wrapper = event.target.closest ? event.target.closest(VIDEO_SEL) : null;
    if (!wrapper || !root.contains(wrapper) || current === wrapper) return;
    current = wrapper;
    pauseVideos(wrapper);
    pauseReels(null);
  }

  function onVideoPause(event) {
    const wrapper = event.target.closest ? event.target.closest(VIDEO_SEL) : null;
    if (wrapper && current === wrapper) current = null;
  }

  function onMessage(event) {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "reelplayer:playing") {
      const iframe = reelIframeFor(event.source);
      if (!iframe || current === iframe) return;
      current = iframe;
      pauseVideos(null);
      // reel <-> reel is the player's own job (pauseOtherPlayers()).
    } else if (data.type === "reelplayer:paused") {
      const iframe = reelIframeFor(event.source);
      if (iframe && current === iframe) current = null;
    }
  }

  // `ev:play` / `ev:pause` bubble from the video wrapper.
  root.addEventListener("ev:play", onVideoPlay);
  root.addEventListener("ev:pause", onVideoPause);
  window.addEventListener("message", onMessage);

  return () => {
    root.removeEventListener("ev:play", onVideoPlay);
    root.removeEventListener("ev:pause", onVideoPause);
    window.removeEventListener("message", onMessage);
  };
}
