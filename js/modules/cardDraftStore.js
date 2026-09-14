// cardDraftStore.js - Server-backed persistence for in-progress builder
// Project Cards ("card drafts"), the Project Cards-tab equivalent of
// js/modules/pageDraftStore.js. Backed by the Worker's /drafts/cards*
// routes (see worker/CLAUDE.md), sharing the same debounced-save/status-
// pub-sub/auth machinery via draftStoreFactory.js rather than a third
// hand-copy of it.
import { createDraftStore } from "./draftStoreFactory.js";

// Fills in fields that didn't exist when a card draft was first saved under
// an older schema - mirrors pageDraftStore.js's normalizePage(). Field list
// per docs/project-cards/PLAN.md §3 (the real repeater-based form, §7.6 -
// the earlier v1 raw-JSON-textarea shortcut is retired).
function normalizeCard(card) {
  if (card.order === undefined) card.order = 0;
  if (card.reelId === undefined) card.reelId = null;
  if (card.logo === undefined) card.logo = "";
  if (card.logoAlt === undefined) card.logoAlt = "";
  if (card.listenImage === undefined) card.listenImage = "";
  if (card.partnerLogos === undefined) card.partnerLogos = [];
  if (card.composers === undefined) card.composers = "";
  if (card.description === undefined) card.description = [];
  if (card.stats === undefined) card.stats = [];
  if (card.links === undefined) card.links = [];
  if (card.cardOverrides === undefined) card.cardOverrides = {};
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
