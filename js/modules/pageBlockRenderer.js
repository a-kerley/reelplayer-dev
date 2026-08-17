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
// on which URL shapes are recognized.
const VIDEO_URL_PATTERNS = [
  { host: /(^|\.)youtube\.com$/, extract: (u) => u.searchParams.get("v"), embed: (id) => `https://www.youtube-nocookie.com/embed/${id}` },
  { host: /(^|\.)youtu\.be$/, extract: (u) => u.pathname.slice(1), embed: (id) => `https://www.youtube-nocookie.com/embed/${id}` },
  { host: /(^|\.)vimeo\.com$/, extract: (u) => u.pathname.split("/").filter(Boolean).pop(), embed: (id) => `https://player.vimeo.com/video/${id}` },
];

/** @param {string} videoUrl @returns {string|null} an embeddable iframe src, or null if unrecognized */
export function parseVideoEmbedUrl(videoUrl) {
  if (!videoUrl) return null;
  let parsed;
  try {
    parsed = new URL(videoUrl);
  } catch {
    return null;
  }
  for (const { host, extract, embed } of VIDEO_URL_PATTERNS) {
    if (host.test(parsed.hostname)) {
      const id = extract(parsed);
      return id ? embed(id) : null;
    }
  }
  return null;
}

const ASPECT_RATIOS = { "16:9": "16 / 9", "4:3": "4 / 3", "1:1": "1 / 1", "9:16": "9 / 16" };

function renderEmbeddedVideo(block) {
  const wrapper = document.createElement("div");
  wrapper.className = "page-block page-block-embedded-video";

  const embedSrc = parseVideoEmbedUrl(block.videoUrl);
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

  return wrapper;
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
