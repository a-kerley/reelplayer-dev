// cardPublish.js - generateCardId()/publishCard(), the Project Cards
// counterpart of js/modules/embedExporter.js's generateReelId()/
// postReelToWorker(). Modeled on the reel side (content-hash id, no slug/
// rename machinery), not js/modules/pagePublish.js - see
// docs/project-cards/PLAN.md §1/§4.
import { PUBLIC_APP_ORIGIN } from "../config.js";
import { apiFetch } from "./builderAuth.js";
import { hashContent } from "./contentHash.js";

// Card-only fields (docs/project-cards/PLAN.md §3) - everything but the
// bookkeeping fields (id/publishedEmbedId/publishedAt/createdAt/_stub) that
// cardDraftStore.js/cardsController.js own.
const CARD_CONTENT_FIELDS = [
  "title", "order", "reelId", "logo", "logoAlt", "listenImage", "partnerLogos",
  "composers", "description", "stats", "links", "cardOverrides", "analyticsEnabled",
];

function contentFor(card) {
  return Object.fromEntries(CARD_CONTENT_FIELDS.map((k) => [k, card[k]]));
}

export function generateCardId(card) {
  return hashContent(contentFor(card));
}

/**
 * @param {Object} card - a card draft (see js/modules/cardDraftStore.js)
 * @returns {Promise<{cardId: string, cardData: Object}>}
 * @throws if the Worker request fails (or the sign-in has expired).
 */
export async function publishCard(card) {
  const cardId = generateCardId(card);
  const cardData = {
    ...contentFor(card),
    id: cardId,
    // Stable draft id - the Worker files this card's stat events under it
    // rather than the per-publish content-hash id above.
    sourceCardId: card.id,
    title: card.title || "",
    reelId: card.reelId || null,
    analyticsEnabled: card.analyticsEnabled === true,
    created: new Date().toISOString(),
  };

  const response = await apiFetch(`/cards/${cardId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cardData),
  });

  if (!response.ok) {
    throw new Error(`Failed to publish card (server responded with status ${response.status}).`);
  }

  return { cardId, cardData };
}

// Extensionless "player" (not "player.html") - matches embedExporter.js's
// own iframe src convention, so a card embed never takes the .html ->
// extensionless redirect hop. &type=card is required: without it
// player.html treats the id as a reel's and fails to load it.
export function publicCardPlayerUrl(cardId) {
  return `${PUBLIC_APP_ORIGIN}/player?id=${cardId}&type=card`;
}
