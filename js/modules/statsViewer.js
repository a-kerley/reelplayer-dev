// statsViewer.js - "View Stats" modal: fetches the raw view/play events a
// reel or page has collected (see js/modules/statsBeacon.js for how they're
// recorded) and summarizes them client-side, matching js/modules/
// embedManager.js's/pageManager.js's fetch -> render HTML string ->
// dialog.createDialog pattern. The Worker deliberately does no aggregation
// (see worker/CLAUDE.md) - expected volume is low enough that summarizing
// here on every open is trivial, and keeps the Worker dumb.
import { WORKER_BASE_URL } from "../config.js";
import { dialog } from "./dialogSystem.js";
import { getBuilderPassword, clearBuilderPassword } from "./builderAuth.js";

async function fetchStats(targetType, targetId, password) {
  const response = await fetch(`${WORKER_BASE_URL}/stats/${targetType}/${targetId}`, {
    headers: { "Authorization": `Bearer ${password}` }
  });

  if (response.status === 401) {
    clearBuilderPassword();
    throw new Error("Incorrect password.");
  }
  if (!response.ok) {
    throw new Error(`Failed to load stats (status ${response.status}).`);
  }
  return response.json();
}

function formatDuration(totalSeconds) {
  const seconds = Math.round(totalSeconds || 0);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

// Pure - groups the raw event list into what the modal renders. Exported
// separately from fetchStats so it's easy to reason about/test in
// isolation from the network call.
export function summarizeStats(events) {
  const views = events.filter((e) => e.event === "view");
  const plays = events.filter((e) => e.event === "play");

  const totalListenSeconds = plays.reduce((sum, p) => sum + (p.listenSeconds || 0), 0);

  const perTrackMap = new Map();
  plays.forEach((p) => {
    if (typeof p.trackIndex !== "number") return;
    const existing = perTrackMap.get(p.trackIndex) || { trackTitle: p.trackTitle || `Track ${p.trackIndex + 1}`, count: 0, totalListenSeconds: 0 };
    existing.count += 1;
    existing.totalListenSeconds += p.listenSeconds || 0;
    perTrackMap.set(p.trackIndex, existing);
  });
  const perTrack = [...perTrackMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([trackIndex, data]) => ({ trackIndex, ...data }));

  const sessionMap = new Map();
  events.forEach((e) => {
    const existing = sessionMap.get(e.sessionId) || {
      sessionId: e.sessionId, ts: e.ts, country: e.country, city: e.city,
      hasView: false, plays: [], totalListenSeconds: 0,
    };
    if (e.event === "view") {
      existing.hasView = true;
      existing.ts = e.ts; // the view event's ts is the session's canonical open time
      existing.country = e.country;
      existing.city = e.city;
    } else {
      existing.plays.push(e);
      existing.totalListenSeconds += e.listenSeconds || 0;
    }
    sessionMap.set(e.sessionId, existing);
  });
  const sessions = [...sessionMap.values()]
    .sort((a, b) => (a.ts < b.ts ? 1 : -1))
    .slice(0, 100);

  return { totalViews: views.length, totalPlays: plays.length, totalListenSeconds, perTrack, sessions };
}

function formatLocation(entry) {
  if (!entry.city && !entry.country) return "Unknown location";
  return [entry.city, entry.country].filter(Boolean).join(", ");
}

function renderStatsHTML(summary) {
  if (summary.totalViews === 0 && summary.totalPlays === 0) {
    return '<p class="builder-empty-state">No activity recorded yet.</p>';
  }

  const summaryLine = `
    <p style="margin-bottom:1rem;">
      <strong>${summary.totalViews}</strong> open${summary.totalViews === 1 ? "" : "s"}
      &middot; <strong>${summary.totalPlays}</strong> play${summary.totalPlays === 1 ? "" : "s"}
      &middot; <strong>${formatDuration(summary.totalListenSeconds)}</strong> total listen time
    </p>
  `;

  const perTrackTable = summary.perTrack.length ? `
    <div style="margin-bottom:1.2rem;">
      <div style="font-weight:600;margin-bottom:0.4rem;">Plays per track</div>
      <div style="max-height:160px;overflow-y:auto;">
        ${summary.perTrack.map((t) => `
          <div style="display:flex;justify-content:space-between;gap:0.5rem;padding:0.3rem 0;border-bottom:1px solid #444;font-size:0.85rem;">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.trackTitle}</span>
            <span style="flex-shrink:0;color:#888;">${t.count} play${t.count === 1 ? "" : "s"} &middot; ${formatDuration(t.totalListenSeconds)}</span>
          </div>
        `).join("")}
      </div>
    </div>
  ` : "";

  const sessionsTable = `
    <div>
      <div style="font-weight:600;margin-bottom:0.4rem;">Recent sessions</div>
      <div style="max-height:240px;overflow-y:auto;">
        ${summary.sessions.map((s) => `
          <div style="padding:0.4rem 0;border-bottom:1px solid #444;font-size:0.85rem;">
            <div style="display:flex;justify-content:space-between;gap:0.5rem;">
              <span>${s.ts ? new Date(s.ts).toLocaleString() : "Unknown time"}</span>
              <span style="color:#888;">${formatLocation(s)}</span>
            </div>
            ${s.plays.length ? `<div style="color:#888;margin-top:0.15rem;">${s.plays.length} play${s.plays.length === 1 ? "" : "s"} &middot; ${formatDuration(s.totalListenSeconds)}</div>` : ""}
          </div>
        `).join("")}
      </div>
    </div>
  `;

  return summaryLine + perTrackTable + sessionsTable;
}

/** @param {'reel'|'page'} targetType
 *  @param {string} targetId - reel's publishedEmbedId, or page's publishedSlug
 *  @param {string} label - display name shown in the modal title */
export async function openStatsModal(targetType, targetId, label) {
  const password = await getBuilderPassword();
  if (!password) return;

  let events;
  try {
    events = await fetchStats(targetType, targetId, password);
  } catch (error) {
    dialog.alert(error.message);
    return;
  }

  const summary = summarizeStats(events);

  dialog.createDialog({
    type: "custom",
    message: `Stats — ${label || "(untitled)"}`,
    content: renderStatsHTML(summary),
    maxWidth: "500px",
    buttons: [
      { text: "Close", type: "secondary", onClick: () => dialog.closeDialog() }
    ]
  });
}
