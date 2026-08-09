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

const HEIGHT_PRESETS = { small: "200px", medium: "360px", large: "520px" };
const WIDTH_PRESETS = { full: "100%", medium: "70%", small: "40%" };

function renderBannerImage(block) {
  const el = document.createElement("div");
  el.className = "page-block page-block-banner";
  el.style.backgroundImage = block.imageUrl ? `url("${block.imageUrl}")` : "none";
  el.style.height = HEIGHT_PRESETS[block.heightPreset] || HEIGHT_PRESETS.medium;
  if (!block.imageUrl) {
    el.textContent = "Banner image not set";
    el.classList.add("page-block-empty");
  }
  if (block.altText) {
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", block.altText);
  }
  if (block.caption) {
    const caption = document.createElement("div");
    caption.className = "page-block-caption";
    caption.textContent = block.caption;
    el.appendChild(caption);
  }
  return el;
}

function renderText(block) {
  const el = document.createElement("div");
  el.className = "page-block page-block-text";
  el.style.textAlign = block.alignment === "center" ? "center" : "left";
  if (block.heading) {
    const h = document.createElement("h2");
    h.textContent = block.heading;
    el.appendChild(h);
  }
  if (block.body) {
    // Plain text only, never raw HTML - this renders on the public page, so
    // there's no innerHTML/markdown path here for a client-controlled field
    // to inject through. Line breaks become separate <p> elements.
    block.body.split(/\n{2,}/).forEach((paragraph) => {
      const p = document.createElement("p");
      p.textContent = paragraph;
      el.appendChild(p);
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
    img.src = block.imageUrl;
    img.alt = block.altText || "";
    wrapper.appendChild(img);
  } else {
    wrapper.textContent = "Image not set";
    wrapper.classList.add("page-block-empty");
  }
  return wrapper;
}

function renderPlayer(block) {
  const wrapper = document.createElement("div");
  wrapper.className = "page-block page-block-player";
  if (!block.reelId) {
    wrapper.textContent = "No reel selected";
    wrapper.classList.add("page-block-empty");
    return wrapper;
  }
  const height = block.height || 500;
  const iframe = document.createElement("iframe");
  iframe.src = `player?id=${block.reelId}`;
  iframe.width = "100%";
  iframe.height = String(height);
  iframe.style.cssText = `display:block;border:none;min-height:${height}px;`;
  iframe.setAttribute("frameborder", "0");
  wrapper.appendChild(iframe);
  return wrapper;
}

const RENDERERS = {
  "banner-image": renderBannerImage,
  text: renderText,
  image: renderImage,
  player: renderPlayer,
};

/** @param {Object} block @returns {HTMLElement} */
export function renderBlock(block) {
  const renderer = RENDERERS[block.type];
  if (!renderer) {
    const el = document.createElement("div");
    el.className = "page-block page-block-empty";
    el.textContent = `Unknown block type: ${block.type}`;
    return el;
  }
  return renderer(block);
}
