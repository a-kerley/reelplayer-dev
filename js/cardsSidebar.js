// cardsSidebar.js - Renders the builder's Project Cards list sidebar, the
// Project Cards-tab counterpart of js/sidebar.js and js/pagesSidebar.js.
// Storage lives in js/modules/cardDraftStore.js.
import { renderSidebarList } from "./modules/sidebarList.js";

export function renderCardsSidebar(cards, currentId, onSelect, onNew, onDelete, onMoveToFolder, onRenameFolder) {
  renderSidebarList(
    {
      listElId: "cardList",
      newBtnId: "newCardBtn",
      newBtnLabel: "+ New Card",
      emptyTitlePlaceholder: "(untitled card)",
      deleteConfirmMessage: "Delete this card?",
      folderMetaType: 'card',
      onMoveToFolder,
      onRenameFolder,
    },
    cards, currentId, onSelect, onNew, onDelete,
    (card) => (card.reelId ? `reel: ${card.reelId}` : "no reel picked")
  );
}
