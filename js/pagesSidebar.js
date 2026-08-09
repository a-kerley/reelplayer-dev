// pagesSidebar.js - Renders the builder's Pages list sidebar, the Pages-tab
// counterpart of js/sidebar.js. Storage lives in js/modules/pageDraftStore.js.
// Shows each page's current publish state (live slug, or "not yet
// published") as a subtitle line under the title - the one thing this list
// shows that the Reels list doesn't, since reels have no renameable public
// identifier to surface here.
import { renderSidebarList } from './modules/sidebarList.js';

export function renderPagesSidebar(pages, currentId, onSelect, onNew, onDelete) {
  renderSidebarList(
    {
      listElId: 'pageList',
      newBtnId: 'newPageBtn',
      newBtnLabel: '+ New Page',
      emptyTitlePlaceholder: '(untitled page)',
      deleteConfirmMessage: 'Delete this page?',
    },
    pages, currentId, onSelect, onNew, onDelete,
    (page) => page.publishedSlug ? `/page?slug=${page.publishedSlug}` : 'not yet published'
  );
}
