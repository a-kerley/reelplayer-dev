// cardDraftStore.js - Server-backed persistence for in-progress builder
// Project Cards ("card drafts"), the Project Cards-tab equivalent of
// js/modules/pageDraftStore.js. Backed by the Worker's /drafts/cards*
// routes (see worker/CLAUDE.md), sharing the same debounced-save/status-
// pub-sub/auth machinery via draftStoreFactory.js rather than a third
// hand-copy of it.
import { createDraftStore } from "./draftStoreFactory.js";

// Fills in fields that didn't exist when a card draft was first saved under
// an older schema - mirrors pageDraftStore.js's normalizePage(). rawJson is
// the v1-shortcut free-form textarea (description/stats/links/
// cardOverrides/etc. - see docs/project-cards/PLAN.md §3) that
// js/modules/cardPublish.js merges into the published card body; it's
// replaced by real per-field form controls once the spine (§7) is proven.
function normalizeCard(card) {
  if (card.reelId === undefined) card.reelId = null;
  if (card.rawJson === undefined) card.rawJson = "{}";
  if (card.analyticsEnabled === undefined) card.analyticsEnabled = false;
  if (card.publishedEmbedId === undefined) card.publishedEmbedId = null;
  if (card.publishedAt === undefined) card.publishedAt = null;
  return card;
}

const store = createDraftStore({ prefix: "/drafts/cards", normalize: normalizeCard });

/** GET /drafts/cards - lightweight {id,title,createdAt,updatedAt,...} for every card draft. */
export const listCardDrafts = store.listDrafts;
/** GET /drafts/cards/:id - full card object, or null on 404. */
export const loadCardDraft = store.loadDraft;
/** Debounces a POST of the given full card object. */
export const scheduleCardDraftSave = store.scheduleDraftSave;
/** Cancels any pending debounce for this card and saves immediately. Returns the save promise. */
export const flushCardDraftSave = store.flushDraftSave;
/** DELETE /drafts/cards/:id - cancels any pending save timer first. */
export const deleteCardDraft = store.deleteDraft;
export const onCardSaveStatusChange = store.onSaveStatusChange;
export const getCardSaveStatus = store.getSaveStatus;
