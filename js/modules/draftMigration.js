// draftMigration.js - One-time upload of reels sitting in this browser's
// localStorage (from before drafts synced to the server) to the Worker.
// localStorage['reelList']/['currentReelId'] are never deleted by this -
// left in place as an inert backup; only 'draftsMigrated' gates re-prompting.
import { dialog } from "./dialogSystem.js";
import { flushDraftSave } from "./draftStore.js";

const MIGRATED_FLAG = "draftsMigrated";

function loadLocalReels() {
  try {
    const json = localStorage.getItem("reelList");
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

/**
 * Uploads any reels found in this browser's old localStorage store to the
 * server, if not already done (or dismissed) in this browser.
 * @param {Array} reels - the live in-memory drafts array; mutated in place
 *   to merge in successfully-uploaded reels.
 */
export async function maybeRunMigration(reels) {
  if (localStorage.getItem(MIGRATED_FLAG) === "true") return;

  const localReels = loadLocalReels();
  if (!localReels.length) return;

  const existingIds = new Set(reels.map((r) => r.id));

  return new Promise((resolve) => {
    dialog.createDialog({
      type: "custom",
      message: "Reels found in this browser",
      content: `
        <p style="margin:0 0 1rem 0;color:#ccc;">
          Found ${localReels.length} reel${localReels.length === 1 ? "" : "s"} saved in
          this browser from before drafts synced automatically. Upload
          ${localReels.length === 1 ? "it" : "them"} so ${localReels.length === 1 ? "it's" : "they're"}
          available from any device?
        </p>
      `,
      buttons: [
        {
          text: "Don't Ask Again",
          type: "secondary",
          onClick: () => {
            localStorage.setItem(MIGRATED_FLAG, "true");
            dialog.closeDialog();
            resolve();
          },
        },
        {
          text: "Remind Me Later",
          type: "secondary",
          onClick: () => {
            dialog.closeDialog();
            resolve();
          },
        },
        {
          text: "Upload Now",
          type: "primary",
          onClick: async () => {
            dialog.closeDialog();

            const results = await Promise.all(
              localReels.map(async (reel) => {
                try {
                  await flushDraftSave(reel);
                  return { reel, ok: true };
                } catch (err) {
                  return { reel, ok: false, error: err };
                }
              })
            );

            const succeeded = results.filter((r) => r.ok);
            const failed = results.filter((r) => !r.ok);

            // Merge successes into the live list, deduping by id in case a
            // previous partial migration already left some present.
            succeeded.forEach(({ reel }) => {
              if (!existingIds.has(reel.id)) {
                reels.push(reel);
                existingIds.add(reel.id);
              }
            });

            if (failed.length === 0) {
              localStorage.setItem(MIGRATED_FLAG, "true");
              setTimeout(() => {
                dialog.alert(`${succeeded.length} reel${succeeded.length === 1 ? "" : "s"} uploaded.`);
              }, 200);
            } else {
              // Leave the flag unset so it retries next load.
              const failedTitles = failed.map(({ reel }) => reel.title || "(untitled reel)").join(", ");
              setTimeout(() => {
                dialog.alert(
                  `Uploaded ${succeeded.length} of ${localReels.length}. Failed: ${failedTitles}. Will ask again next time.`
                );
              }, 200);
            }

            resolve();
          },
        },
      ],
    });
  });
}
