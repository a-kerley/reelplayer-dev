// cardPublish.js - generateCardId()/publishCard(), the Project Cards
// counterpart of js/modules/embedExporter.js's generateReelId()/
// postReelToWorker(). Modeled on the reel side (content-hash id, no slug/
// rename machinery), not js/modules/pagePublish.js - see
// docs/project-cards/PLAN.md §1/§4.
import { WORKER_BASE_URL } from "../config.js";
import { getBuilderPassword, clearBuilderPassword } from "./builderAuth.js";
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
 * @throws if no password is set or the Worker request fails.
 */
export async function publishCard(card) {
  const cardId = generateCardId(card);
  const cardData = {
    ...contentFor(card),
    id: cardId,
    title: card.title || "",
    reelId: card.reelId || null,
    analyticsEnabled: card.analyticsEnabled === true,
    created: new Date().toISOString(),
  };

  const password = await getBuilderPassword();
  if (!password) {
    throw new Error("A password is required to publish this card.");
  }

  const response = await fetch(`${WORKER_BASE_URL}/cards/${cardId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${password}` },
    body: JSON.stringify(cardData),
  });

  if (response.status === 401) {
    clearBuilderPassword();
    throw new Error("Incorrect password. Please try publishing again.");
  }
  if (!response.ok) {
    throw new Error(`Failed to publish card (server responded with status ${response.status}).`);
  }

  return { cardId, cardData };
}

// Extensionless "player" (not "player.html") - matches embedExporter.js's
// own iframe src convention, so a card embed never takes the .html ->
// extensionless redirect hop. mode:"card" rendering doesn't exist in
// player.html yet (PLAN.md §5, not built as part of this spine step) - this
// URL is for testing the publish round-trip against GET /cards/:id, not a
// working embed yet.
export function publicCardPlayerUrl(cardId) {
  return `${window.location.origin}${window.location.pathname.replace("index.html", "")}player?id=${cardId}`;
}
