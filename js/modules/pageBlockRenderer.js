// pageBlockRenderer.js - Renders a single page block to a DOM element, given
// its data-model shape (see worker/src/index.js's page routes doc comment
// for the shared shape). This is the ONE render implementation used by both
// the page block editor's live preview (js/modules/pageBlocksEditor.js) and
// the public renderer (page.html) - never duplicate this logic a second
// time for either caller. This is the specific mechanism that keeps page
// blocks from repeating the player.html/player.js drift bug documented in
// this repo's CLAUDE.md (two hand-kept-in-sync copies of the same render
// logic, silently going out of sync).
//
// Player blocks are the one exception: they never get a second, non-iframe
// render path here - both callers embed the exact same
// `player?id=<reelId>` iframe markup embedExporter.js already generates for
// third-party embeds, so a reel's rendering logic itself is never
// duplicated a third time either.
import { sanitizeHtml } from "./htmlSanitizer.js";
import { ASSIGNABLE_TEXT_ROLES, TEXT_FONT_OPTIONS, ensureInlineGoogleFont } from "./pageTextStyles.js";

const DEFAULT_BANNER_MAX_HEIGHT = 600;
const WIDTH_PRESETS = { full: "100%", medium: "70%", small: "40%" };

// Banner/image blocks fade in once loaded (css/page.css's .page-image-fade)
// rather than popping in abruptly. Listeners attached BEFORE `src` is set,
// not after - setting `src` first risks a cached image finishing loading
// synchronously before the listener exists, in which case "load" would
// simply never fire and the image would stay invisible forever. `error`
// gets the same treatment so a broken image link still reveals itself
// (as the browser's own broken-image glyph) instead of staying hidden.
function fadeInOnLoad(img) {
  img.classList.add("page-image-fade");
  img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
  img.addEventListener("error", () => img.classList.add("is-loaded"), { once: true });
}

function renderBannerImage(block) {
  const el = document.createElement("div");
  el.className = "page-block page-block-banner";
  if (block.imageUrl) {
    // An <img> (not a CSS background-image + background-size:cover) so the
    // full image is always visible - background-size:cover inside a fixed-
    // height box crops whatever doesn't fit that exact aspect ratio.
    // max-height is a cap, not an exact size: combined with the CSS
    // max-width:100%/height:auto pair below, it only ever shrinks unusually
    // tall (portrait) images down to something reasonable - wide/landscape
    // images typically render well under it and are unaffected. Never
    // crops either dimension; letterboxes (extra space, no fill color)
    // rather than cutting off part of the image.
    const img = document.createElement("img");
    img.alt = block.altText || "";
    img.style.maxHeight = `${block.maxHeight || DEFAULT_BANNER_MAX_HEIGHT}px`;
    fadeInOnLoad(img);
    img.src = block.imageUrl;
    el.appendChild(img);
  } else {
    el.textContent = "Banner image not set";
    el.classList.add("page-block-empty");
  }
  if (block.caption) {
    const caption = document.createElement("div");
    caption.className = "page-block-caption";
    caption.textContent = block.caption;
    el.appendChild(caption);
  }
  return el;
}

// Markdown-lite inline formatting (**bold**, *italic*) plus auto-
// linkification of URLs/emails/phone numbers - the whole reason this is a
// layered regex-split pipeline rather than one big regex or an innerHTML
// pass: it renders on the public page, fed by a client-controlled textarea,
// so every node here is built via createElement/createTextNode, never
// innerHTML/markdown-to-HTML-string - there's no string position at which
// arbitrary markup could be injected.
const URL_RE = /\bhttps?:\/\/[^\s<]+[^\s<.,:;!?'")\]]/g;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
// Deliberately conservative (10+ digits, optional leading +, digit-first
// and digit-last) - false negatives (a phone number that isn't linked) are
// far less annoying than false positives (some unrelated number, e.g. a
// year or a price, turned into a bogus tel: link).
const PHONE_RE = /(?<![\w@])(\+?\d[\d\-.\s]{8,}\d)(?![\w@])/g;

// Splits `text` on every match of `regex`, returning an alternating list of
// {type:'text', value} and {type:'match', value, groups} segments in
// original order - the shared primitive both the bold/italic pass and the
// link-detection pass build on.
function splitByRegex(text, regex) {
  const segments = [];
  let lastIndex = 0;
  let m;
  regex.lastIndex = 0;
  while ((m = regex.exec(text))) {
    if (m.index > lastIndex) segments.push({ type: "text", value: text.slice(lastIndex, m.index) });
    segments.push({ type: "match", value: m[0], groups: m });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) segments.push({ type: "text", value: text.slice(lastIndex) });
  return segments;
}

function makeLink(text, href) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  if (/^https?:/.test(href)) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  return a;
}

// Runs URL -> email -> phone detection in sequence, each pass only looking
// at whatever plain text the previous pass left behind - so a URL match
// can never be re-split by the email/phone pass, etc.
function linkify(text) {
  let nodes = [{ type: "text", value: text }];
  [
    [URL_RE, (m) => makeLink(m, m)],
    [EMAIL_RE, (m) => makeLink(m, `mailto:${m}`)],
    [PHONE_RE, (m) => makeLink(m, `tel:${m.replace(/[^\d+]/g, "")}`)],
  ].forEach(([regex, toNode]) => {
    nodes = nodes.flatMap((seg) => {
      if (seg.type !== "text") return [seg];
      return splitByRegex(seg.value, regex).map((part) =>
        part.type === "match" ? { type: "node", node: toNode(part.value) } : part
      );
    });
  });
  return nodes.map((seg) => (seg.type === "node" ? seg.node : document.createTextNode(seg.value)));
}

function renderInlineMarkdown(line) {
  return splitByRegex(line, /\*\*(.+?)\*\*/g).flatMap((part) => {
    if (part.type !== "match") return renderItalicAndRest(part.value);
    const strong = document.createElement("strong");
    renderItalicAndRest(part.groups[1]).forEach((n) => strong.appendChild(n));
    return [strong];
  });
}

function renderItalicAndRest(text) {
  return splitByRegex(text, /\*(.+?)\*/g).flatMap((part) => {
    if (part.type !== "match") return renderUnderlineAndLinks(part.value);
    const em = document.createElement("em");
    renderUnderlineAndLinks(part.groups[1]).forEach((n) => em.appendChild(n));
    return [em];
  });
}

// __underline__ - not standard Markdown (which has no underline syntax at
// all), but symmetric with **bold**/*italic*'s marker-count convention and
// unambiguous alongside them (neither uses a bare "_").
function renderUnderlineAndLinks(text) {
  return splitByRegex(text, /__(.+?)__/g).flatMap((part) => {
    if (part.type !== "match") return linkify(part.value);
    const u = document.createElement("u");
    linkify(part.groups[1]).forEach((n) => u.appendChild(n));
    return [u];
  });
}

// Splits a text block's body into heading/paragraph blocks - a line
// matching Markdown heading syntax (#/##/### + space) becomes a standalone
// h1/h2/h3 block; consecutive non-heading lines accumulate into a
// paragraph block exactly like the old body.split(/\n{2,}/) did (a blank
// line ends the paragraph, single \n within it becomes <br> at render
// time - see renderText() below).
function parseBodyToBlocks(body) {
  const blocks = [];
  let paragraphLines = null;

  function flushParagraph() {
    if (paragraphLines && paragraphLines.length) blocks.push({ type: "p", lines: paragraphLines });
    paragraphLines = null;
  }

  body.split("\n").forEach((line) => {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      blocks.push({ type: `h${headingMatch[1].length}`, text: headingMatch[2] });
      return;
    }
    if (line.trim() === "") {
      flushParagraph();
      return;
    }
    if (!paragraphLines) paragraphLines = [];
    paragraphLines.push(line);
  });
  flushParagraph();

  return blocks;
}

function renderText(block) {
  const el = document.createElement("div");
  el.className = "page-block page-block-text";
  el.style.textAlign = block.alignment === "center" ? "center" : "left";
  // Per-field line spacing (createTextConfig's line-height control) - css/
  // page.css's .page-block-text rules read this with a 1.6 fallback, so an
  // unset value renders exactly as before.
  if (block.lineHeight != null) el.style.setProperty("--page-text-block-line-height", String(block.lineHeight));

  // bodyHtml (contenteditable WYSIWYG editor, js/modules/pageBlocksEditor.js)
  // takes priority over the legacy Markdown body below - a block only ever
  // has one or the other; bodyHtml is written the first time an old
  // Markdown block is opened and edited in the new editor. sanitizeHtml()
  // is called again here even though js/modules/pageBlocksEditor.js
  // already sanitizes before storing - this is the real security boundary
  // (what anonymous visitors' browsers actually execute), so stored HTML
  // is never trusted on the strength of "it was sanitized once already."
  // The only innerHTML assignment of dynamic content in this whole file -
  // legitimate here specifically because the content has just passed a
  // strict allowlist sanitizer, not because it's been validated any other way.
  if (block.bodyHtml) {
    el.innerHTML = sanitizeHtml(block.bodyHtml);
    return el;
  }

  // heading is a legacy field from before the text block was simplified to
  // a single body textarea - still rendered so pages saved before that
  // change don't lose their heading. It and an inline "## heading" in the
  // body below both render as <h2> and both pick up the page's h2 style
  // customization (js/modules/pageTextStyles.js).
  if (block.heading) {
    const h = document.createElement("h2");
    h.textContent = block.heading;
    el.appendChild(h);
  }
  if (block.body) {
    parseBodyToBlocks(block.body).forEach((b) => {
      if (b.type === "p") {
        const p = document.createElement("p");
        b.lines.forEach((line, i) => {
          if (i > 0) p.appendChild(document.createElement("br"));
          renderInlineMarkdown(line).forEach((n) => p.appendChild(n));
        });
        el.appendChild(p);
      } else {
        const h = document.createElement(b.type);
        renderInlineMarkdown(b.text).forEach((n) => h.appendChild(n));
        el.appendChild(h);
      }
    });
  }
  if (!block.heading && !block.body) {
    el.textContent = "Empty text block";
    el.classList.add("page-block-empty");
  }
  return el;
}

function renderImage(block) {
  const wrapper = document.createElement("div");
  wrapper.className = "page-block page-block-image";
  wrapper.style.maxWidth = WIDTH_PRESETS[block.widthPreset] || WIDTH_PRESETS.full;
  if (block.imageUrl) {
    const img = document.createElement("img");
    img.alt = block.altText || "";
    fadeInOnLoad(img);
    img.src = block.imageUrl;
    wrapper.appendChild(img);
  } else {
    wrapper.textContent = "Image not set";
    wrapper.classList.add("page-block-empty");
  }
  return wrapper;
}

function renderPlayer(block, page) {
  const wrapper = document.createElement("div");
  wrapper.className = "page-block page-block-player";
  if (!block.reelId) {
    wrapper.textContent = "No reel selected";
    wrapper.classList.add("page-block-empty");
    return wrapper;
  }
  const height = block.height || 500;
  const iframe = document.createElement("iframe");
  // Forwards this page's own customized text-style roles into the
  // embedded reel, so a title/track-name set to "inherit" a role
  // (js/modules/playerTextStyles.js) can actually resolve to real values
  // - see player.html's identical resolveTextUnit()/getPlayerTextStyles().
  // Only added when the page actually has at least one role customized -
  // a page with none, or a raw third-party embed generated by
  // embedExporter.js (which never has a `page` at all), simply omits the
  // param, and the reel falls back to its own custom/default values.
  const iframeParams = new URLSearchParams({ id: block.reelId });
  if (page?.textStyleDefs && Object.keys(page.textStyleDefs).length) {
    iframeParams.set("pageTextStyles", JSON.stringify(page.textStyleDefs));
  }
  iframe.src = `player?${iframeParams}`;
  iframe.width = "100%";
  iframe.height = String(height);
  // No min-height here - min-height is a floor, and pinning it to the
  // starting-height guess would stop the iframe ever shrinking below it
  // once a real (possibly smaller, e.g. an expandable reel's collapsed
  // height) size arrives via postMessage below. The height attribute
  // above already prevents a zero-height flash before that first message.
  iframe.style.cssText = `display:block;border:none;transition:height 0.3s ease;`;
  iframe.setAttribute("frameborder", "0");
  wrapper.appendChild(iframe);

  // player.html posts these regardless of reel mode - an expandable reel
  // resizes itself (collapsed banner <-> full controls on hover) and
  // reports its new height every time, exactly like it does for a
  // third-party <iframe> embed (see embedExporter.js's generateIframeEmbed()
  // for the same handshake). Without this listener, an expandable reel in
  // a page would be stuck at whatever height was configured here - either
  // clipped once expanded, or wasting space while collapsed. Even a static
  // reel benefits: player.html always posts one `initial: true` message on
  // load with its real configured height, correcting a wrong guess in the
  // block's own "Height" field without waiting for any user interaction.
  function handleMessage(event) {
    // Self-removing once this iframe's gone (block deleted, or the whole
    // row rebuilt by pageBlocksEditor.js's updatePageBlocksEditor() on the
    // next edit) - renderPlayer() runs again on every such rebuild in the
    // block editor, and without this the old listener would linger on
    // window forever, matched against a detached iframe that can never
    // post anything again.
    if (!document.body.contains(iframe)) {
      window.removeEventListener("message", handleMessage);
      return;
    }
    if (event.source !== iframe.contentWindow || !event.data) return;
    if (event.data.type === "reelplayer:resize") {
      // No animated resize for the first message - it's correcting this
      // block's own initial-height guess, not a user-triggered expand, so
      // it should snap instantly rather than play what looks like an
      // unwanted expand animation on load (mirrors player.html's own
      // reasoning for flagging that first message `initial: true`).
      iframe.style.transition = event.data.initial ? "none" : "height 0.3s ease";
      iframe.style.height = `${event.data.height}px`;
    } else if (event.data.type === "reelplayer:scrollCompensate") {
      window.scrollBy(0, event.data.delta);
    }
  }
  window.addEventListener("message", handleMessage);

  return wrapper;
}

// Shared by both the renderer here and the block editor's own URL-field
// validation (js/modules/pageBlocksEditor.js) - a pasted watch/share URL is
// parsed into an embeddable iframe src exactly once, so the two never drift
// on which URL shapes are recognized. Every accessor below (embed src,
// provider name, thumbnail) routes through matchVideoUrl() so that single
// list stays the only place URL shapes are recognized.
// A non-negative integer from an "advanced embed settings" number field, or
// null for blank/invalid (YouTube/Vimeo silently ignore bad start/end).
function embedTimeSeconds(v) {
  if (v === "" || v == null) return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Applies the block's `embedOptions` (edited via the cog dialog -
// js/modules/embedSettingsDialog.js) to a YouTube embed URL's params. Only
// keys that differ from YouTube's own default do anything; an absent option
// = default. enablejsapi=1 (+ origin) is NOT one of these - it's mandatory
// (the play-state detection and page-level media coordinator both depend on
// it), set unconditionally after this so a stray option can't clobber it.
function applyYouTubeEmbedOptions(params, o) {
  if (!o) return;
  if (o.controls === false) params.set("controls", "0");
  if (o.relChannelOnly) params.set("rel", "0");
  if (o.fullscreenButton === false) params.set("fs", "0");
  if (o.keyboardControls === false) params.set("disablekb", "1");
  if (o.captionsDefault) params.set("cc_load_policy", "1");
  if (o.playsInline) params.set("playsinline", "1");
  const start = embedTimeSeconds(o.startTime);
  const end = embedTimeSeconds(o.endTime);
  if (start != null) params.set("start", String(start));
  if (end != null && (start == null || end > start)) params.set("end", String(end));
}

function youtubeEmbedUrl(id, options) {
  const params = new URLSearchParams();
  applyYouTubeEmbedOptions(params, options);
  params.set("enablejsapi", "1");
  const origin = typeof window !== "undefined" && /^https?:/.test(window.location.origin) ? window.location.origin : "";
  if (origin) params.set("origin", origin);
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}

function vimeoEmbedUrl(id, o) {
  const params = new URLSearchParams();
  if (o) {
    if (o.controls === false) params.set("controls", "0");
    if (o.title === false) params.set("title", "0");
    if (o.byline === false) params.set("byline", "0");
    if (o.portrait === false) params.set("portrait", "0");
    if (o.doNotTrack) params.set("dnt", "1");
    if (o.accentColor) params.set("color", String(o.accentColor).replace(/^#/, ""));
  }
  const qs = params.toString();
  let url = `https://player.vimeo.com/video/${id}${qs ? `?${qs}` : ""}`;
  // Vimeo takes a start time as a #t= hash, not a query param.
  const start = o && embedTimeSeconds(o.startTime);
  if (start != null) url += `#t=${start}s`;
  return url;
}

const youtubeThumb = (id) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

const VIDEO_URL_PATTERNS = [
  { provider: "youtube", host: /(^|\.)youtube\.com$/, extract: (u) => u.searchParams.get("v"), embed: youtubeEmbedUrl, thumb: youtubeThumb },
  { provider: "youtube", host: /(^|\.)youtu\.be$/, extract: (u) => u.pathname.slice(1), embed: youtubeEmbedUrl, thumb: youtubeThumb },
  // Vimeo has no static thumbnail URL (it needs an oEmbed API call), so
  // thumb() returns null - the editor only offers "use video thumbnail" for
  // YouTube and forces a custom image for Vimeo.
  { provider: "vimeo", host: /(^|\.)vimeo\.com$/, extract: (u) => u.pathname.split("/").filter(Boolean).pop(), embed: vimeoEmbedUrl, thumb: () => null },
];

/** @param {string} videoUrl @returns {{pattern: object, id: string}|null} */
function matchVideoUrl(videoUrl) {
  if (!videoUrl) return null;
  let parsed;
  try {
    parsed = new URL(videoUrl);
  } catch {
    return null;
  }
  for (const pattern of VIDEO_URL_PATTERNS) {
    if (pattern.host.test(parsed.hostname)) {
      const id = pattern.extract(parsed);
      return id ? { pattern, id } : null;
    }
  }
  return null;
}

/** @param {string} videoUrl @param {Object} [options] block.embedOptions @returns {string|null} an embeddable iframe src, or null if unrecognized */
export function parseVideoEmbedUrl(videoUrl, options) {
  const match = matchVideoUrl(videoUrl);
  return match ? match.pattern.embed(match.id, options) : null;
}

/** @param {string} videoUrl @returns {"youtube"|"vimeo"|null} */
export function parseVideoProvider(videoUrl) {
  const match = matchVideoUrl(videoUrl);
  return match ? match.pattern.provider : null;
}

/** @param {string} videoUrl @returns {string|null} a static thumbnail image URL (YouTube only) */
export function parseVideoThumbnailUrl(videoUrl) {
  const match = matchVideoUrl(videoUrl);
  return match ? match.pattern.thumb(match.id) : null;
}

const ASPECT_RATIOS = { "16:9": "16 / 9", "4:3": "4 / 3", "1:1": "1 / 1", "9:16": "9 / 16" };

function renderEmbeddedVideo(block, page) {
  const wrapper = document.createElement("div");
  wrapper.className = "page-block page-block-embedded-video";

  const embedSrc = parseVideoEmbedUrl(block.videoUrl, block.embedOptions);
  if (!embedSrc) {
    wrapper.textContent = "No video URL set";
    wrapper.classList.add("page-block-empty");
    return wrapper;
  }

  wrapper.style.aspectRatio = ASPECT_RATIOS[block.aspectRatio] || ASPECT_RATIOS["16:9"];
  const iframe = document.createElement("iframe");
  iframe.src = embedSrc;
  iframe.style.cssText = "width:100%;height:100%;display:block;border:none;";
  iframe.setAttribute("frameborder", "0");
  iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
  iframe.setAttribute("allowfullscreen", "");
  wrapper.appendChild(iframe);

  // Play-state detection runs for every video block (not just expandable
  // ones): it feeds both the expandable collapse-lock AND the page-level
  // cross-media coordinator (js/modules/pageMediaCoordinator.js), which
  // needs to know a plain embedded video started so it can pause the reel
  // players.
  wireVideoPlaybackDetection(wrapper, iframe, block);

  // Everything above is the original non-expandable rendering plus the
  // (invisible) play-state wiring. Expandable mode only ever *adds* layers
  // and behaviour on top of it.
  if (block.expandable) {
    decorateExpandableVideo(wrapper, iframe, block, page);
  }

  return wrapper;
}

const EXPANDABLE_VIDEO_DEFAULTS = { collapsedHeight: 120, closedBgBlur: 8 };
// Matches the reel player's .project-title-overlay intro (see
// validateProjectTitleImage() in js/player.js) - keep in sync with the
// keyframe/animation duration in css/page.css.
const EXPANDABLE_OVERLAY_INTRO_MS = 800;
// Desktop-only: an incidental mouseleave (cursor clipping the block edge
// while scrolling past) shouldn't collapse instantly - same reasoning as
// the reel player's pre-collapsing dead-time.
const EXPANDABLE_COLLAPSE_DELAY_MS = 1200;

/**
 * Adds the collapsed-state layers (blurred background fill + optional
 * contained overlay) and the desktop hover expand/collapse state machine to
 * an already-built .page-block-embedded-video wrapper. Mobile (touch) is
 * wired separately - see VIDEO_BLOCK_COLLAPSIBLE_SPEC.md section 5.
 */
function decorateExpandableVideo(wrapper, iframe, block, page) {
  wrapper.dataset.expandable = "";
  // Expandable mode drives height in explicit pixels (collapsed <-> a
  // width x aspect-ratio target), the same way the reel player's expandable
  // mode does - transitioning `height` while `aspect-ratio` is also set is
  // janky (the browser recomputes the ratio mid-transition). The base
  // renderer set an inline aspect-ratio; clear it so only pixel heights are
  // ever in play here.
  wrapper.style.aspectRatio = "";
  const collapsedHeight = Number(block.collapsedHeight) || EXPANDABLE_VIDEO_DEFAULTS.collapsedHeight;
  const blur = Number(block.closedBgBlur ?? EXPANDABLE_VIDEO_DEFAULTS.closedBgBlur);
  wrapper.style.setProperty("--ev-collapsed-height", `${collapsedHeight}px`);
  wrapper.style.setProperty("--ev-blur", `${blur}px`);

  // Layer 2: blurred background fill (cover). YouTube thumbnail, a
  // media-library image, or nothing ("none" - the collapsed box just shows
  // the top slice of the video's own poster). onerror drops the layer,
  // mirroring the reel player's own project-title-image validation.
  let bgSrc = "";
  if (block.closedBgMode === "custom") {
    bgSrc = block.closedBgImage || "";
  } else if (block.closedBgMode !== "none") {
    bgSrc = parseVideoThumbnailUrl(block.videoUrl) || "";
  }
  if (bgSrc) {
    const bg = document.createElement("img");
    bg.className = "ev-closed-bg";
    bg.src = bgSrc;
    bg.alt = "";
    bg.setAttribute("aria-hidden", "true");
    bg.addEventListener("error", () => bg.remove());
    wrapper.appendChild(bg);
  }

  // Layer 2b: flat colour tint over the background fill (colour + alpha),
  // gated by its own enable toggle.
  if (block.closedOverlayColorEnabled && block.closedOverlayColor) {
    const tint = document.createElement("div");
    tint.className = "ev-overlay-tint";
    tint.style.background = block.closedOverlayColor;
    wrapper.appendChild(tint);
  }

  // Layer 3: contained foreground overlay - image OR text, mutually
  // exclusive.
  if (block.overlayMode === "image" && block.overlayImage) {
    const overlay = document.createElement("div");
    overlay.className = "ev-overlay ev-overlay-image needs-intro";
    overlay.style.backgroundImage = `url('${block.overlayImage}')`;
    wrapper.appendChild(overlay);
    // Trigger the intro scale-in only once the image actually loads (same
    // pattern as validateProjectTitleImage()); drop the layer if it 404s.
    const probe = new Image();
    probe.onload = () => {
      overlay.classList.add("intro-animation");
      setTimeout(() => overlay.classList.remove("intro-animation", "needs-intro"), EXPANDABLE_OVERLAY_INTRO_MS);
    };
    probe.onerror = () => overlay.remove();
    probe.src = block.overlayImage;
  } else if (block.overlayMode === "text" && (block.overlayTextBlock?.bodyHtml || block.overlayText)) {
    const overlay = document.createElement("div");
    overlay.className = "ev-overlay ev-overlay-text";
    if (block.overlayTextBlock?.bodyHtml) {
      // Rich WYSIWYG content, authored via the shared text-block editor.
      // sanitizeHtml() is the real security boundary (same as renderText()).
      // Carries the real .page-block-text class so it uses the EXACT same
      // p/h1/h2/h3/strong/em/u typography rules - and the same inherited
      // --page-text-{role}-* custom properties (set page-wide on an ancestor
      // by applyTextStyles) - as the editor and normal text blocks. css/
      // page.css then overrides only what the overlay needs different
      // (white+shadow, no padding, field-driven line spacing). Anything less
      // than a shared rule set drifts the moment more than one font/size/
      // weight is in play.
      const body = document.createElement("div");
      body.className = "ev-overlay-text-body page-block-text";
      const align = block.overlayTextBlock.alignment;
      body.style.textAlign = align === "center" ? "center" : align === "right" ? "right" : "left";
      if (block.overlayTextBlock.lineHeight != null) body.style.lineHeight = String(block.overlayTextBlock.lineHeight);
      body.innerHTML = sanitizeHtml(block.overlayTextBlock.bodyHtml);
      // Load any Google Font picked per-run via the toolbar Font dropdown
      // (an inline <span style="font-family:...">, not a page role) - the
      // page-wide applyTextStyles only fetches role fonts.
      body.querySelectorAll("span[style*='font-family']").forEach((s) => {
        const ff = (s.style.fontFamily || "").replace(/['"]/g, "").trim();
        const match = TEXT_FONT_OPTIONS.find((f) => f.stack.replace(/['"]/g, "").trim() === ff);
        if (match) ensureInlineGoogleFont(match.value);
      });
      overlay.appendChild(body);
      // [overlay-debug] - keep until the overlay text is confirmed correct.
      // Deferred so `body` is attached (caller appends the wrapper into the
      // row preview / page synchronously right after this returns).
      setTimeout(() => {
        if (!body.isConnected) { console.log("[overlay-debug] RENDERED overlay - body never attached"); return; }
        const dbgP = body.querySelector("p, h1, h2, h3") || body;
        const csBody = getComputedStyle(body);
        const csP = getComputedStyle(dbgP);
        console.log(`[overlay-debug] RENDERED overlay lhField=${block.overlayTextBlock.lineHeight}
  container: lh=${csBody.lineHeight} size=${csBody.fontSize} weight=${csBody.fontWeight} family=${csBody.fontFamily}
  ${dbgP.tagName}:   lh=${csP.lineHeight} size=${csP.fontSize} weight=${csP.fontWeight} family=${csP.fontFamily}
  html: ${body.innerHTML}`);
      }, 0);
    } else {
      // Legacy single styled line (block.overlayText + overlay* style fields).
      const span = document.createElement("span");
      span.textContent = block.overlayText;
      applyExpandableOverlayTextStyle(span, block);
      overlay.appendChild(span);
    }
    wrapper.appendChild(overlay);
  }

  // Mobile-only tap target (CSS hides it on hover devices and while
  // expanded). Appended last so it sits above every other layer and the
  // iframe - pointer-events:auto on it, none on the layers below.
  const tapBar = document.createElement("div");
  tapBar.className = "ev-tap-bar";
  tapBar.setAttribute("role", "button");
  tapBar.setAttribute("aria-label", "Expand video");
  wrapper.appendChild(tapBar);

  const ec = createEvExpandCollapse(wrapper, iframe, block);
  if (isTouchExpandableDevice()) {
    wireExpandableVideoTouch(wrapper, block, ec);
  } else {
    wireExpandableVideoDesktop(wrapper, block, ec);
  }
}

// Wires YouTube/Vimeo play-state detection for one embedded-video block.
// Reflects it on `wrapper.dataset.evPlaying` ("true" / absent) and fires
// bubbling `ev:play` / `ev:pause` CustomEvents, consumed by:
//   - the expandable collapse-lock (decorateExpandableVideo's wirings), and
//   - the page-level cross-media coordinator (js/modules/
//     pageMediaCoordinator.js), which listens on an ancestor.
// Also accepts an `ev:command:pause` CustomEvent back on the wrapper (the
// coordinator's "stop, something else started" signal) and forwards it to
// the embed as a real pause command. Runs for EVERY video block, expandable
// or not. YouTube needs enablejsapi=1 on the src (see youtubeEmbedUrl);
// Vimeo's postMessage API is always on.
function wireVideoPlaybackDetection(wrapper, iframe, block) {
  const provider = parseVideoProvider(block.videoUrl);
  if (!provider) return;

  // Scrubbing (the progress bar, arrow-key seek, chapter skip) makes the
  // embed report a brief not-playing blip - buffering, sometimes a flash of
  // "paused" - before it resumes. Clearing evPlaying on that would unlock
  // the collapse guard mid-navigation. So the *rising* edge is immediate,
  // but the *falling* edge waits out a short grace: a real pause still
  // lands (~half a second later - imperceptible, and collapse has its own
  // 1.2s delay after that), while a seek's blip is cancelled by the
  // playing state coming straight back.
  const PAUSE_GRACE_MS = 600;
  let pausePending = null;

  function setPlaying(on) {
    if (on) {
      clearTimeout(pausePending);
      pausePending = null;
      if (wrapper.dataset.evPlaying !== "true") {
        wrapper.dataset.evPlaying = "true";
        wrapper.dispatchEvent(new CustomEvent("ev:play", { bubbles: true }));
      }
      return;
    }
    if (wrapper.dataset.evPlaying !== "true" || pausePending) return;
    pausePending = setTimeout(() => {
      pausePending = null;
      delete wrapper.dataset.evPlaying;
      wrapper.dispatchEvent(new CustomEvent("ev:pause", { bubbles: true }));
    }, PAUSE_GRACE_MS);
  }

  function onMessage(e) {
    // Self-remove once this iframe is gone (builder re-render deletes the
    // old row) - matches renderPlayer()'s own message-listener guard.
    if (!iframe.isConnected) {
      window.removeEventListener("message", onMessage);
      return;
    }
    if (!iframe.contentWindow || e.source !== iframe.contentWindow) return;
    let data = e.data;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch { return; }
    }
    if (!data || typeof data !== "object") return;

    if (provider === "youtube") {
      // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
      let state;
      if (data.event === "onStateChange") state = data.info;
      else if (data.event === "infoDelivery" && data.info && typeof data.info.playerState === "number") state = data.info.playerState;
      if (state === undefined) return;
      // Buffering is "trying to play" - never treat it as a stop (the grace
      // timer below would catch it anyway, but this avoids even starting it).
      if (state === 3) return;
      setPlaying(state === 1);
    } else if (provider === "vimeo") {
      if (data.event === "play") setPlaying(true);
      else if (data.event === "pause" || data.event === "ended") setPlaying(false);
    }
  }
  window.addEventListener("message", onMessage);

  function subscribe() {
    const w = iframe.contentWindow;
    if (!w) return;
    if (provider === "youtube") {
      w.postMessage(JSON.stringify({ event: "listening", id: block.blockId, channel: "widget" }), "*");
      w.postMessage(JSON.stringify({ event: "command", func: "addEventListener", args: ["onStateChange"], id: block.blockId, channel: "widget" }), "*");
    } else {
      ["play", "pause", "ended"].forEach((ev) => {
        w.postMessage(JSON.stringify({ method: "addEventListener", value: ev }), "*");
      });
    }
  }
  // YouTube in particular sometimes needs the handshake repeated until its
  // player script is ready to answer; a couple of cheap retries covers it.
  iframe.addEventListener("load", () => {
    subscribe();
    setTimeout(subscribe, 300);
    setTimeout(subscribe, 900);
  });

  // The coordinator's "pause yourself" signal -> a real embed pause command.
  wrapper.addEventListener("ev:command:pause", () => {
    const w = iframe.contentWindow;
    if (!w) return;
    if (provider === "youtube") {
      w.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", id: block.blockId, channel: "widget" }), "*");
    } else {
      w.postMessage(JSON.stringify({ method: "pause" }), "*");
    }
  });
}

// Same role-or-custom resolution as renderButtonBlock() above: an assigned
// text role drives font/size/weight/colour together via page.css's
// [data-text-role] rules; "Custom" (no role) sets each field inline.
function applyExpandableOverlayTextStyle(el, block) {
  if (block.overlayTextStyleRole && ASSIGNABLE_TEXT_ROLES.includes(block.overlayTextStyleRole)) {
    el.dataset.textRole = block.overlayTextStyleRole;
    return;
  }
  if (block.overlayTextColor) el.style.color = block.overlayTextColor;
  const font = TEXT_FONT_OPTIONS.find((f) => f.value === block.overlayFontFamily);
  if (font) {
    el.style.fontFamily = font.stack;
    ensureInlineGoogleFont(font.value);
  }
  if (block.overlayFontSize) el.style.fontSize = `${block.overlayFontSize}px`;
  if (block.overlayFontWeight) el.style.fontWeight = block.overlayFontWeight;
}

function expandableVideoExpandedHeight(wrapper, block) {
  const ratio = ASPECT_RATIOS[block.aspectRatio] || ASPECT_RATIOS["16:9"];
  const [w, h] = ratio.split("/").map((n) => parseFloat(n));
  return wrapper.clientWidth * (h / w);
}

function isTouchExpandableDevice() {
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

/**
 * The shared expand/collapse *mechanics* - class toggle, the FLIP pixel
 * height animation, resize-tracking of the expanded height, and the
 * never-collapse-mid-playback guard. Both the desktop (hover) and touch
 * (scroll/tap) wirings drive this same object so the animation can't drift
 * between them; each adds only its own triggers.
 */
function createEvExpandCollapse(wrapper, iframe, block) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let expanded = false;
  let endHandler = null;

  const collapsedPx = () => Number(block.collapsedHeight) || EXPANDABLE_VIDEO_DEFAULTS.collapsedHeight;

  // While collapsed the embed sits full-size behind the cover layers (which
  // are pointer-events:none), so without this a click or Tab lands straight
  // on the iframe - it takes focus and hijacks the spacebar, and can even
  // start playback under the cover. `inert` pulls it out of the tab order
  // and blocks pointer/keyboard entirely until the block expands.
  function setInert(on) {
    if (on) iframe.setAttribute("inert", "");
    else iframe.removeAttribute("inert");
  }
  setInert(true);

  function clearEndHandler() {
    if (endHandler) {
      wrapper.removeEventListener("transitionend", endHandler);
      endHandler = null;
    }
  }

  // The expanded box is an explicit pixel height (width x aspect-ratio) -
  // no aspect-ratio fallback keeps it right as the viewport width changes,
  // so re-derive it on resize while expanded.
  function onResize() {
    if (expanded && !reduceMotion) {
      wrapper.style.height = `${expandableVideoExpandedHeight(wrapper, block)}px`;
    }
  }

  function expand() {
    if (expanded) return;
    expanded = true;
    setInert(false);
    clearEndHandler();
    window.addEventListener("resize", onResize, { passive: true });

    // .ev-expanded first (drives the overlay/blur fade); it removes the CSS
    // collapsed-height rule, so we must immediately re-assert an explicit
    // start height and flush *before* setting the target - otherwise the
    // wrapper resolves to `auto` (~0, the iframe's collapsed content height)
    // for a frame and the growth animates from nothing.
    wrapper.classList.add("ev-expanded");
    const target = expandableVideoExpandedHeight(wrapper, block);
    if (reduceMotion) {
      wrapper.style.height = `${target}px`;
      return;
    }
    wrapper.style.height = `${collapsedPx()}px`;
    void wrapper.offsetHeight;
    wrapper.style.height = `${target}px`;
  }

  function collapse({ animate = true } = {}) {
    if (!expanded) return false;
    if (wrapper.dataset.evPlaying === "true") return false;
    expanded = false;
    setInert(true);
    window.removeEventListener("resize", onResize);
    clearEndHandler();
    if (reduceMotion || !animate) {
      wrapper.classList.remove("ev-expanded");
      wrapper.style.height = "";
      return true;
    }
    // Pin the current expanded height as an explicit start, flush, then drop
    // to the collapsed height. Hand back to the CSS rule once it settles.
    wrapper.style.height = `${wrapper.getBoundingClientRect().height}px`;
    void wrapper.offsetHeight;
    wrapper.classList.remove("ev-expanded");
    wrapper.style.height = `${collapsedPx()}px`;
    endHandler = (e) => {
      if (e.target !== wrapper || e.propertyName !== "height") return;
      clearEndHandler();
      if (!expanded) wrapper.style.height = "";
    };
    wrapper.addEventListener("transitionend", endHandler);
    return true;
  }

  return {
    expand,
    collapse,
    reduceMotion,
    get expanded() { return expanded; },
  };
}

function wireExpandableVideoDesktop(wrapper, block, ec) {
  let collapseTimer = null;
  // Default true: expansion happens on hover, so the pointer starts over the
  // block. Only a real outside pointermove flips it false. Consulted when
  // playback stops to decide whether to honour a deferred collapse.
  let pointerInside = true;

  function cancelCollapse() {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }

  function scheduleCollapse() {
    if (!collapseTimer) {
      collapseTimer = setTimeout(() => {
        collapseTimer = null;
        if (!ec.collapse()) return; // bailed (playing) - a later ev:pause retries
        unbindTracking();
      }, EXPANDABLE_COLLAPSE_DELAY_MS);
    }
  }

  // Collapse can't be driven off the wrapper's own pointerleave: the embed
  // is a cross-origin iframe, so as soon as the cursor crosses onto the
  // video the parent frame stops getting pointer events (and fires a
  // spurious pointerleave on the wrapper). Instead, track the pointer at the
  // window level and collapse only when it's genuinely outside the wrapper's
  // box. While the cursor sits over the iframe we get no events at all -
  // which is the behaviour we want: it stays expanded.
  function onWindowPointerMove(e) {
    if (!ec.expanded) return;
    const r = wrapper.getBoundingClientRect();
    pointerInside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (pointerInside) cancelCollapse();
    else scheduleCollapse();
  }

  function onDocumentPointerLeave() {
    if (ec.expanded) scheduleCollapse();
  }

  function bindTracking() {
    window.addEventListener("pointermove", onWindowPointerMove, { passive: true });
    document.addEventListener("pointerleave", onDocumentPointerLeave);
  }

  function unbindTracking() {
    window.removeEventListener("pointermove", onWindowPointerMove);
    document.removeEventListener("pointerleave", onDocumentPointerLeave);
  }

  wrapper.addEventListener("pointerenter", (e) => {
    if (e.pointerType === "touch") return;
    pointerInside = true;
    cancelCollapse();
    if (!ec.expanded) {
      ec.expand();
      bindTracking();
    }
  });

  // ec.collapse() bails while dataset.evPlaying is "true". When playback
  // stops, honour a collapse the pointer has already earned by moving away;
  // if it starts playing, drop any pending collapse outright.
  wrapper.addEventListener("ev:play", cancelCollapse);
  wrapper.addEventListener("ev:pause", () => {
    if (ec.expanded && !pointerInside) scheduleCollapse();
  });
}

// Mobile (no hover): expansion follows scroll position - the block expands
// while it overlaps the viewport's middle third and collapses once it has
// fully left that band - plus a dedicated tap bar (mobile-only, collapsed
// state only) as an explicit expand tap. Mirrors
// setupExpandableModeTouchInteractions() in js/player.js.
function wireExpandableVideoTouch(wrapper, block, ec) {
  // Flat time cooldown after a manual tap: the IntersectionObservers also
  // fire *during* the expand/collapse animation as the box geometry
  // changes, and a tap could hit a transient frame that re-triggers the
  // opposite action. Every observer firing within this window is ignored.
  const evTransitionMs = (parseFloat(getComputedStyle(wrapper).getPropertyValue("--ev-transition")) || 0.35) * 1000;
  const TAP_COOLDOWN_MS = evTransitionMs + 150;
  let overrideUntil = 0;
  let inBand = false;
  let inTopHalf = true;

  // Second observer, read only as a boolean (its rect numbers are unsafe
  // cross-frame, per js/player.js) - did the block exit off the TOP? Only
  // then is there visible space below worth anchoring during the shrink.
  const topHalfObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) inTopHalf = entry.isIntersecting;
  }, { threshold: 0, rootMargin: "0px 0px -50% 0px" });
  topHalfObserver.observe(wrapper);

  function collapseFromScroll() {
    if (wrapper.dataset.evPlaying === "true") return; // §5.6 playback lock
    if (!ec.expanded) return;
    if (!inTopHalf || ec.reduceMotion) {
      ec.collapse();
      return;
    }
    // Exited off the top: keep the content below visually anchored by
    // scrolling up in step with the actual rendered shrink (ResizeObserver,
    // not an assumed easing curve - same reasoning as js/player.js's
    // compensateScrollDuringCollapse()).
    let last = wrapper.getBoundingClientRect().height;
    const ro = new ResizeObserver(() => {
      const h = wrapper.getBoundingClientRect().height;
      const delta = h - last;
      if (delta < 0) window.scrollBy(0, delta);
      last = h;
    });
    ro.observe(wrapper);
    ec.collapse();
    setTimeout(() => ro.disconnect(), evTransitionMs + 250);
  }

  const bandObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      inBand = entry.isIntersecting;
      if (performance.now() < overrideUntil) continue;
      if (inBand) ec.expand();
      else collapseFromScroll();
    }
  }, { threshold: 0, rootMargin: "-33% 0px -33% 0px" });
  bandObserver.observe(wrapper);

  // Tap bar - only present/visible while collapsed (CSS), so it's purely an
  // "expand" affordance; scrolling it out of the band is what collapses it.
  const tapBar = wrapper.querySelector(".ev-tap-bar");
  if (tapBar) {
    tapBar.addEventListener("click", () => {
      overrideUntil = performance.now() + TAP_COOLDOWN_MS;
      ec.expand();
    });
  }

  // If playback stops after the block has already scrolled out of the band,
  // the collapse that was suppressed can now happen.
  wrapper.addEventListener("ev:pause", () => {
    if (ec.expanded && !inBand && performance.now() >= overrideUntil) collapseFromScroll();
  });
}

// A styled <a>, not a <button> - it's always a navigation to block.url, and
// an anchor is the correct semantic element for that (also means it works
// with no JS at all on the public page, unlike a <button onclick>).
// target="_blank"/rel="noopener noreferrer" unconditionally, same as
// makeLink() above for a plain http(s) URL - per the spec for this block,
// it always opens in a new tab, no per-block toggle for it.
function renderButtonBlock(block) {
  const wrapper = document.createElement("div");
  wrapper.className = "page-block page-block-button";
  wrapper.style.textAlign = block.alignment || "center";

  if (!block.url || !block.label) {
    wrapper.textContent = "Button not configured";
    wrapper.classList.add("page-block-empty");
    return wrapper;
  }

  const a = document.createElement("a");
  a.className = "page-block-button-link";
  a.href = block.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = block.label;
  a.style.backgroundColor = block.backgroundColor || "#4a90e2";
  // A Text Style role (js/modules/pageBlocksEditor.js's createButtonConfig())
  // drives font-family/-size/-weight/color together via the
  // [data-text-role="..."] rules in page.css, which read the exact same
  // --page-text-{role}-* custom properties as .page-block-text's own
  // h1/h2/h3/p/a - so the button tracks page-wide Customize Styles edits
  // to that role. Set as a data attribute (a CSS class rule), not inline
  // styles, specifically so it CAN be overridden by an inline style - the
  // "Custom" (no role) case below sets color inline, which needs to win.
  if (block.textStyleRole && ASSIGNABLE_TEXT_ROLES.includes(block.textStyleRole)) {
    a.dataset.textRole = block.textStyleRole;
  } else {
    // "Custom" - the button's own private font/size/weight/color, set
    // individually (only when actually chosen) rather than as a group,
    // so a button saved before this feature (none of these fields exist)
    // renders exactly as it always has: page.css's own
    // .page-block-button-link base font-weight:600 and ambient inherited
    // font-family/-size.
    a.style.color = block.textColor || "#ffffff";
    const font = TEXT_FONT_OPTIONS.find((f) => f.value === block.fontFamily);
    if (font) {
      a.style.fontFamily = font.stack;
      ensureInlineGoogleFont(font.value);
    }
    if (block.fontSize) a.style.fontSize = `${block.fontSize}px`;
    if (block.fontWeight) a.style.fontWeight = block.fontWeight;
  }
  wrapper.appendChild(a);
  return wrapper;
}

const RENDERERS = {
  "banner-image": renderBannerImage,
  text: renderText,
  image: renderImage,
  player: renderPlayer,
  "embedded-video": renderEmbeddedVideo,
  button: renderButtonBlock,
};

/** @param {Object} block @returns {HTMLElement} */
/** @param {Object} block @param {Object} [page] - only renderPlayer() actually uses this (forwarding page.textStyleDefs into the embedded reel's iframe src - see renderPlayer() above); passed uniformly to every renderer rather than special-cased so callers don't need to know which block types care about it. */
export function renderBlock(block, page) {
  const renderer = RENDERERS[block.type];
  if (!renderer) {
    const el = document.createElement("div");
    el.className = "page-block page-block-empty";
    el.textContent = `Unknown block type: ${block.type}`;
    return el;
  }
  return renderer(block, page);
}
