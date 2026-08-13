// sidebar.js - Renders the builder's reel list sidebar.
// Storage (load/save) now lives in js/modules/draftStore.js, backed by the
// Worker/KV so drafts are available from any browser - see its header
// comment and worker/README.md's "Drafts" section. renderSidebar() only
// ever reads reel.id/reel.title/reel.createdAt, so it works unchanged
// whether a reel entry is a full body or a lightweight stub (see js/main.js).
//
// The actual list-rendering logic is generic (see js/modules/sidebarList.js,
// shared with js/pagesSidebar.js) - this file just supplies the Reels-tab-
// specific labels/ids, keeping this exported function's signature unchanged
// for existing js/main.js call sites.
import { renderSidebarList } from './modules/sidebarList.js';

export function renderSidebar(reels, currentId, onSelect, onNew, onDelete, onToggleLock) {
  renderSidebarList(
    {
      listElId: 'reelList',
      newBtnId: 'newReelBtn',
      newBtnLabel: '+ New Reel',
      emptyTitlePlaceholder: '(untitled reel)',
      deleteConfirmMessage: 'Delete this reel?',
    },
    reels, currentId, onSelect, onNew, onDelete,
    // Mirrors js/pagesSidebar.js's own publish-status subtitle - keyed on
    // reel.publishedEmbedId, the reel-side equivalent of page.publishedSlug
    // (see updateReelPublishStatus() in js/main.js). Requires the list
    // payload (GET /drafts) to actually include this field - see
    // worker/src/index.js.
    (reel) => reel.publishedEmbedId ? 'Published' : 'not yet published',
    onToggleLock
  );
}
