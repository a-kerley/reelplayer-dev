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

export function renderSidebar(reels, currentId, onSelect, onNew, onDelete) {
  renderSidebarList(
    {
      listElId: 'reelList',
      newBtnId: 'newReelBtn',
      newBtnLabel: 'New Player',
      emptyTitlePlaceholder: '(untitled reel)',
      deleteConfirmMessage: 'Delete this reel?',
    },
    reels, currentId, onSelect, onNew, onDelete
  );
}
