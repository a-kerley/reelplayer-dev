// main.js
import { playerApp } from "./player.js";
import {
  loadPlaylistFromFile,
  convertDropboxLinkToDirect,
} from "./playlist.js";
import { renderSidebar } from "./sidebar.js";
import { renderBuilder, createEmptyReel } from "./builder.js";
import { PreviewManager } from "./modules/previewManager.js";
import { dialog } from "./modules/dialogSystem.js";
import { showToast } from "./modules/toast.js";
import { embedExporter } from "./modules/embedExporter.js";
import { setupEmbedManagerButton } from "./modules/embedManager.js";
import { createToggleSwitch } from "./modules/domUtils.js";
import { markAsOperatorBrowser } from "./modules/statsBeacon.js";
import { renderMediaLibraryTab } from "./modules/mediaLibrary.js";
import { createTabController } from "./modules/tabController.js";
import { initSidebarResize } from "./modules/sidebarResize.js";
import { initPagePreviewResize } from "./modules/pagePreviewResize.js";
import { initPagesController } from "./pagesController.js";
import {
  listDrafts,
  loadDraft,
  saveReels,
  flushDraftSave,
  deleteDraft,
  onSaveStatusChange,
} from "./modules/draftStore.js";
import { maybeRunMigration } from "./modules/draftMigration.js";
import { getBuilderPassword } from "./modules/builderAuth.js";
import { extractFileName } from "./modules/urlUtils.js";

document.addEventListener("DOMContentLoaded", async () => {
  // If the builder UI exists, use builder mode. Otherwise, use classic playlist.txt mode.
  const builderRoot = document.querySelector(".builder-app");
  if (builderRoot) {
    // Any browser that has loaded the builder is presumed to be an
    // operator's, not a client's - js/modules/statsBeacon.js checks this
    // flag (shared via same-origin localStorage) before sending any
    // view/play beacon, so testing a reel/page (including via the "Test
    // Embed" button, which opens player.html same-origin) never pollutes a
    // client's real analytics.
    markAsOperatorBrowser();

    // --- Reel Builder SPA mode ---
    // Drafts (the reels shown in the sidebar and being actively edited) are
    // server-backed via js/modules/draftStore.js, so they auto-save and are
    // available from any browser reaching this (password-gated) page - see
    // CLAUDE.md and worker/README.md's "Drafts" section for the design.
    //
    // Data model: `reels` holds one entry per draft, but only the currently
    // open one is ever a full object - every other entry is a lightweight
    // stub `{id,title,createdAt,updatedAt,_stub:true}` (all renderSidebar()
    // ever needs). The full body is fetched on demand when selected.
    let reels = [];
    let currentId = null;

    const loadingOverlay = document.getElementById("builderLoadingOverlay");
    const loadingContent = document.getElementById("builderLoadingContent");

    function showBuilderLoading(html = "Loading…") {
      if (!loadingOverlay || !loadingContent) return;
      loadingContent.innerHTML = html;
      loadingOverlay.hidden = false;
    }

    function hideBuilderLoading() {
      if (loadingOverlay) loadingOverlay.hidden = true;
    }

    function showAuthRequiredState() {
      showBuilderLoading(
        `<div>
          <p>A password is required to load your reels.</p>
          <button type="button" id="authRetryBtn">Retry</button>
        </div>`
      );
      const retryBtn = document.getElementById("authRetryBtn");
      if (retryBtn) retryBtn.onclick = () => init();
    }

    function updateSaveStatusIndicator(status) {
      const el = document.getElementById("draftSaveStatus");
      if (!el) return;
      const text = {
        pending: "Unsaved changes…",
        saving: "Saving…",
        saved: "All changes saved",
        error: "⚠ Save failed - will retry",
      }[status] || "";
      el.textContent = text;
      el.dataset.status = status;
    }

    // A reel's embed id is a content hash (embedExporter.generateReelId) -
    // deterministic, so comparing a fresh hash of the current draft against
    // the id actually published last time (reel.publishedEmbedId, set in
    // exportEmbedCode() below) tells us whether the live embed matches the
    // draft, with no separate diffing mechanism needed. This is the Reels
    // equivalent of js/pagesController.js's updatePublishStatus() - Pages
    // already had this distinction (Live / Not yet published / stale);
    // Reels previously had nothing, so "Export Embed Code" gave no sense of
    // whether the click even needed to happen.
    function updateReelPublishStatus(reel) {
      const statusEl = document.getElementById("reelPublishStatus");
      if (!statusEl || !reel) return;

      if (!reel.publishedEmbedId) {
        statusEl.textContent = "Not yet published.";
        statusEl.dataset.status = "unpublished";
        return;
      }

      const currentId = embedExporter.generateReelId(reel);
      if (currentId === reel.publishedEmbedId) {
        const when = reel.publishedAt ? ` (${new Date(reel.publishedAt).toLocaleString()})` : "";
        statusEl.textContent = `Published${when}.`;
        statusEl.dataset.status = "published";
      } else {
        statusEl.textContent = "⚠ Unpublished changes - re-export to update the live embed.";
        statusEl.dataset.status = "stale";
      }
    }

    // Analytics toggle - reuses the same createToggleSwitch component
    // titleAppearance.js already uses for "Display Reel Title in Player".
    // Stats themselves are viewed via a "Stats" button on each row of the
    // "Manage Published Embeds" modal (js/modules/embedManager.js), not a
    // dedicated button here - that works for any published reel, not just
    // whichever one happens to be open in the builder right now.
    function setupAnalyticsControls(reel) {
      const slot = document.getElementById("reelAnalyticsToggleSlot");
      if (slot) {
        slot.innerHTML = "";
        slot.appendChild(createToggleSwitch({
          id: "reelAnalyticsEnabled",
          checked: !!reel.analyticsEnabled,
          onChange: (e) => {
            reel.analyticsEnabled = e.target.checked;
            updateCurrentReel();
          },
        }));
      }
    }

    // Initialize preview manager
    const previewManager = new PreviewManager();
    if (!previewManager.initialize("reelPlayerPreview")) {
      console.error("Failed to initialize preview manager");
      return;
    }

    // Reels/Pages/Media Library sidebar tabs - wired once here (not inside
    // render(), unlike the old per-render setupMediaLibraryTab() call this
    // replaces), since the tab buttons/panels are static DOM that never gets
    // torn down. Reels needs no onActivate: render() already keeps the reel
    // form/preview live in the background, so switching back to it is just
    // an unhide. Pages/Media Library render on demand, the first time each
    // tab is actually opened.
    const pagesController = initPagesController();
    createTabController([
      {
        btn: document.getElementById("tabReelsBtn"),
        panel: document.getElementById("reelsPanel"),
        mainView: document.getElementById("reelBuilderView"),
      },
      {
        btn: document.getElementById("tabPagesBtn"),
        panel: document.getElementById("pagesPanel"),
        mainView: document.getElementById("pageBuilderView"),
        activeClass: "page-editor-active",
        onActivate: () => pagesController.activate(),
      },
      {
        btn: document.getElementById("tabMediaBtn"),
        panel: document.getElementById("mediaPanel"),
        mainView: document.getElementById("mediaLibraryView"),
        activeClass: "media-library-active",
        onActivate: () => renderMediaLibraryTab(),
      },
    ]);

    initSidebarResize();
    initPagePreviewResize();

    async function init() {
      showBuilderLoading();

      const password = await getBuilderPassword();
      if (!password) {
        showAuthRequiredState();
        return;
      }

      let listEntries;
      try {
        listEntries = await listDrafts();
      } catch (e) {
        console.error("Failed to list drafts:", e);
        // Offline/Worker-down: fall back to an empty list so createNew()
        // still works locally - its save naturally retries via the
        // debounce once connectivity returns. Don't block the UI.
        listEntries = [];
      }

      reels = listEntries.map((e) => ({ ...e, _stub: true }));

      await maybeRunMigration(reels);

      const savedId = localStorage.getItem("currentReelId");
      if (savedId && reels.some((r) => r.id === savedId)) {
        currentId = savedId;
      } else if (reels.length) {
        currentId = reels[0].id;
      }

      if (!reels.length) {
        const first = createEmptyReel();
        reels.push(first);
        currentId = first.id;
        flushDraftSave(first);
      }

      window.reels = reels;
      window.saveReels = saveReels;
      // Escape hatch for modules that only receive `onChange` (which also
      // persists) but want a save-free live preview update - currently
      // just colorPicker.js's Pickr drag handler. Function declaration
      // below is hoisted, so this assignment can come before its
      // definition. Mirrors window.saveReels's own existing shim pattern
      // (see js/modules/draftStore.js's header comment on that one).
      window.schedulePreviewRefresh = schedulePreviewRefresh;

      onSaveStatusChange((id, status) => {
        if (id === currentId) updateSaveStatusIndicator(status);
      });

      await render();
    }

    async function setCurrent(id) {
      currentId = id;
      localStorage.setItem('currentReelId', currentId);
      await render();
    }

    // Toggling lock has to persist even for a reel that's only ever been a
    // lightweight stub (never opened) - saveReels() silently skips stubs
    // (see draftStore.js's own filter), so hydrate the full body first,
    // exactly like render() already does when a stub reel is selected.
    async function toggleReelLock(id) {
      const idx = reels.findIndex((r) => r.id === id);
      if (idx === -1) return;
      let reel = reels[idx];

      if (reel.locked) {
        const confirmed = await dialog.confirm('Unlock this reel for editing?', 'Unlock', 'Cancel');
        if (!confirmed) return;
      }

      if (reel._stub) {
        showBuilderLoading();
        try {
          const full = await loadDraft(id);
          if (!full) {
            reels.splice(idx, 1);
            hideBuilderLoading();
            await render();
            return;
          }
          reels[idx] = full;
          reel = full;
        } catch (e) {
          hideBuilderLoading();
          dialog.alert(`Couldn't load this reel (offline or server error): ${e.message}`);
          return;
        }
        hideBuilderLoading();
      }

      reel.locked = !reel.locked;
      saveReels(reels);
      await render();
    }

    async function createNew() {
      const newReel = createEmptyReel();
      reels.push(newReel);
      currentId = newReel.id;
      flushDraftSave(newReel); // not awaited - one-shot, don't stall the UI
      await render();
    }

    async function handleDelete(id) {
      if (reels.length === 1) {
        dialog.alert("At least one reel must remain.", "OK");
        return;
      }
      const idx = reels.findIndex((r) => r.id === id);
      if (idx === -1) return;

      const [removed] = reels.splice(idx, 1); // optimistic
      const wasCurrent = currentId === id;
      if (wasCurrent) {
        currentId = reels.length ? reels[0].id : null;
      }

      try {
        await deleteDraft(id);
      } catch (e) {
        // Roll back - local/server state must not silently drift.
        reels.splice(idx, 0, removed);
        if (wasCurrent) currentId = id;
        dialog.alert(`Couldn't delete "${removed.title || "(untitled reel)"}" - ${e.message}`);
        await render();
        return;
      }

      await render();
    }

    let previewRefreshTimer = null;

    function schedulePreviewRefresh() {
      clearTimeout(previewRefreshTimer);
      previewRefreshTimer = setTimeout(showPreview, 400);
    }

    function updateCurrentReel() {
      // Backstop beyond the visual pointer-events:none block on #reelForm
      // (see applyReelLockState()) - that alone doesn't stop a keyboard-
      // focused edit from still firing this.
      if (reels.find((r) => r.id === currentId)?.locked) return;

      saveReels(reels);
      window.reels = reels; // Keep global reference updated
      renderSidebar(reels, currentId, setCurrent, createNew, handleDelete, toggleReelLock); // re-render sidebar with updated titles
      updateReelPublishStatus(reels.find((r) => r.id === currentId));
      // Don't re-render builder here - it destroys form elements and causes issues
      // Preview refresh is debounced so rapid field commits (e.g. tabbing
      // through several fields) don't rebuild the player on every blur.
      schedulePreviewRefresh();
    }

    async function render() {
      renderSidebar(reels, currentId, setCurrent, createNew, handleDelete, toggleReelLock);

      const idx = reels.findIndex((r) => r.id === currentId);
      let current = reels[idx];

      if (current && current._stub) {
        showBuilderLoading();
        try {
          const full = await loadDraft(current.id);
          if (full) {
            reels[idx] = full;
            current = full;
          } else {
            // 404 - deleted server-side elsewhere; drop it, pick another.
            reels.splice(idx, 1);
            currentId = reels[0]?.id ?? null;
            hideBuilderLoading();
            return render();
          }
        } catch (e) {
          hideBuilderLoading();
          dialog.alert(`Couldn't load this reel (offline or server error): ${e.message}`);
          return; // never renderBuilder() a stub - missing fields would
                  // throw deep inside builder.js. The previously-rendered
                  // form (if any) just stays on screen.
        }
        hideBuilderLoading();
      }

      renderBuilder(current, updateCurrentReel);
      setupRefreshPreviewButton();
      setupExportEmbedButton();
      setupEmbedManagerButton(() => reels.find((r) => r.id === currentId));
      setupAnalyticsControls(current);
      updateReelPublishStatus(current);
      applyReelLockState(current);
      // showPreview(); // preview is only refreshed via button now
      showPreview();
    }

    // Visual half of the lock (dim + block pointer interaction on the
    // form itself) plus the in-editor lock/unlock button - see
    // .builder-locked-form/.lock-toggle-btn in css/builder.css. The
    // sidebar's own lock icon (js/modules/sidebarList.js) is the other
    // entry point to the exact same toggleReelLock().
    function applyReelLockState(reel) {
      const form = document.getElementById('reelForm');
      const lockBtn = document.getElementById('reelLockBtn');
      if (!form || !lockBtn || !reel) return;

      form.classList.toggle('builder-locked-form', !!reel.locked);
      lockBtn.classList.toggle('locked', !!reel.locked);
      lockBtn.textContent = reel.locked ? '🔒 Locked - click to unlock' : '🔓 Lock this reel';
      lockBtn.onclick = () => toggleReelLock(reel.id);
    }

    function setupRefreshPreviewButton() {
      const btn = document.getElementById('refreshPreviewBtn');
      if (btn) {
        btn.onclick = () => showPreview();
      }
    }

    function setupExportEmbedButton() {
      const btn = document.getElementById('exportEmbedBtn');
      if (btn) {
        btn.onclick = () => exportEmbedCode();
      }
    }

    async function exportEmbedCode() {
      const current = reels.find((r) => r.id === currentId);
      if (!current) {
        dialog.alert("No reel selected for export.");
        return;
      }
      if (current.locked) {
        dialog.alert("This reel is locked. Unlock it to export/publish.");
        return;
      }

      const btn = document.getElementById("exportEmbedBtn");
      const originalLabel = btn ? btn.textContent : "";
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Publishing…";
      }

      let embedOptions;
      try {
        embedOptions = await embedExporter.generateEmbedOptions(current);
      } catch (error) {
        dialog.alert(`Export Error: ${error.message}`);
        return;
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = originalLabel;
        }
      }

      // The click just made a real, live change - the reel is published
      // (or re-published) at this exact id right now. Record that so
      // updateReelPublishStatus() can tell "published and matches this
      // draft" apart from "draft has changed since the last publish".
      current.publishedEmbedId = embedOptions.reelId;
      current.publishedAt = new Date().toISOString();
      saveReels(reels);
      updateReelPublishStatus(current);
      setupAnalyticsControls(current);

      dialog.createDialog({
        type: 'custom',
        maxWidth: '600px',
        message: "Published! Your embed code is ready.",
        content: `
          <div style="margin-bottom: 1.5rem;">
            <h3 style="color: var(--builder-accent); margin: 0 0 1rem 0; font-size: 1.1rem;">🎯 iframe Embed Code</h3>

            <div style="background: #1e1e1e; color: #ccc; padding: 1rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.9rem;">
              <strong style="color:#fff;">Perfect for:</strong> Squarespace, WordPress, Wix, and most website platforms. Ultra-concise 3-line embed code that inherits all your styling automatically.
            </div>

            <textarea id="embedCodeArea" readonly style="width: 100%; height: 150px; font-family: monospace; font-size: 12px; padding: 10px; border: 1px solid #444; border-radius: 4px; resize: vertical; background: #1e1e1e; color: #fff;">${embedOptions.iframe.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
          </div>
        `,
        buttons: [
          {
            text: "Copy to Clipboard",
            type: "primary",
            onClick: () => {
              const textarea = document.getElementById('embedCodeArea');
              navigator.clipboard.writeText(textarea.value).then(() => {
                showToast("Embed code copied to clipboard!");
              }).catch(() => {
                showToast("Failed to copy - please select and copy the code manually.");
              });
            }
          },
          {
            text: "Download HTML",
            type: "secondary",
            onClick: () => {
              try {
                const textarea = document.getElementById('embedCodeArea');
                const currentCode = textarea.value;
                const blob = new Blob([currentCode], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${(current.title || 'reel').replace(/[^a-zA-Z0-9]/g, '_')}_iframe.html`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast("Downloaded.");
              } catch (error) {
                console.error('Download failed:', error);
                showToast("Download failed - please try copying to clipboard instead.");
              }
            }
          },
          {
            // Dev-only convenience - opens the GitHub Pages embed-testing
            // harness (testHTMLpages/embed-test-live.html) and copies the
            // code to the clipboard first, so the flow is just "paste".
            // Update this URL if that test page ever moves.
            text: "Test Embed ↗",
            type: "secondary",
            onClick: () => {
              const textarea = document.getElementById('embedCodeArea');
              const currentCode = textarea.value;
              navigator.clipboard.writeText(currentCode).catch(() => {
                // Clipboard write failing isn't fatal - the code is still
                // visible/selectable in the textarea for a manual copy.
              });
              window.open('https://a-kerley.github.io/reelplayer-dev/testHTMLpages/embed-test-live.html', '_blank');
            }
          },
          {
            text: "Close",
            type: "secondary",
            onClick: () => {
              dialog.closeDialog();
            }
          }
        ]
      });
    }

    function showPreview() {
      const current = reels.find((r) => r.id === currentId);
      previewManager.showPreview(current, playerApp);
    }

    init();
  } else {
    // --- Classic playlist.txt mode ---
    // Load and render playlist
    const playlist = await loadPlaylistFromFile("playlist.txt");
    if (!playlist.length) return;
    playerApp.renderPlaylist(playlist);

    // Highlight first track as active on load
    const items = document.querySelectorAll(".playlist-item");
    if (items.length > 0) items[0].classList.add("active");

    const firstTrack = playlist[0];
    const convertedURL = convertDropboxLinkToDirect(firstTrack.url);
    playerApp.initializePlayer(convertedURL, firstTrack.title, 0);

    // Show track info for the first track on load
    const trackInfo = playerApp.elements.trackInfo;
    const fileName = firstTrack.title || extractFileName(firstTrack.url);
    if (trackInfo) {
      trackInfo.textContent = fileName;
      trackInfo.classList.add("visible");
    }
  }

  // --- Custom events ---
  document.addEventListener("track:change", (e) => {
    const { audioURL, title, index } = e.detail;
    const trackInfo = playerApp.elements.trackInfo;
    const fileName = title || extractFileName(audioURL);
    if (trackInfo) {
      trackInfo.textContent = fileName;
    }
    const items = document.querySelectorAll(".playlist-item");
    items.forEach((el) => el.classList.remove("active"));
    if (typeof index === "number") {
      const activeItem = document.querySelector(
        `.playlist-item[data-index="${index}"]`
      );
      if (activeItem) activeItem.classList.add("active");
    }
  });

  document.addEventListener("volume:mute", () => {
    const volumeToggle = playerApp.elements.volumeToggle;
    const volumeIconMuted = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
        <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM17.78 9.22a.75.75 0 1 0-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 1 0 1.06-1.06L20.56 12l1.72-1.72a.75.75 0 1 0-1.06-1.06l-1.72 1.72-1.72-1.72Z" />
    </svg>
    `;
    if (volumeToggle) volumeToggle.innerHTML = volumeIconMuted;
  });

  document.addEventListener("volume:unmute", () => {
    const volumeToggle = playerApp.elements.volumeToggle;
    const volumeIconLoud = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
        <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
        <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
    </svg>
    `;
    if (volumeToggle) volumeToggle.innerHTML = volumeIconLoud;
  });

  document.addEventListener("playback:play", () => {
    const playPauseBtn = playerApp.elements.playPauseBtn;
    if (playPauseBtn) {
      playPauseBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
          <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM9 8.25a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75h.75a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75H9Zm5.25 0a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75H15a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75h-.75Z" clip-rule="evenodd" />
        </svg>
      `;
    }
    const playheadTime = playerApp.elements.playheadTime;
    if (playheadTime) playheadTime.style.opacity = "1";
  });

  document.addEventListener("playback:pause", () => {
    const playPauseBtn = playerApp.elements.playPauseBtn;
    if (playPauseBtn) {
      playPauseBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="heroicon">
          <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm14.024-.983a1.125 1.125 0 0 1 0 1.966l-5.603 3.113A1.125 1.125 0 0 1 9 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113Z" clip-rule="evenodd" />
        </svg>
      `;
    }
    const playheadTime = playerApp.elements.playheadTime;
    if (playheadTime) playheadTime.style.opacity = "0";
  });
  document.addEventListener("playback:finish", () => {
    const playheadTime = playerApp.elements.playheadTime;
    if (playheadTime) playheadTime.style.opacity = "0";
  });

// Keyboard shortcut for play/pause (space), except when in input/textarea
document.addEventListener("keydown", (e) => {
  const active = document.activeElement;
  const isTyping =
    active && (
      active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.isContentEditable
    );
  if (!isTyping && (e.code === "Space" || e.key === " ")) {
    e.preventDefault();
    // Route through the play/pause button's own click handler rather than
    // calling wavesurfer.playPause() directly - the button handler is the
    // only place that drives the audio fade in/out (see setupPlayPauseUI in
    // player.js). Calling wavesurfer.playPause() here instead skipped fades
    // entirely on every space-bar toggle.
    if (playerApp.wavesurfer && playerApp.isWaveformReady) {
      playerApp.elements.playPauseBtn?.click();
    }
  }
});
});
