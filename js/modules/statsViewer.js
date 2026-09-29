// statsViewer.js - "View Stats" modal: fetches the raw view/play events a
// reel, page or card has collected (see js/modules/statsBeacon.js for how they're
// recorded) and summarizes them client-side, matching js/modules/
// embedManager.js's/pageManager.js's fetch -> render HTML string ->
// dialog.createDialog pattern. The Worker deliberately does no aggregation
// (see worker/CLAUDE.md) - expected volume is low enough that summarizing
// here on every open is trivial, and keeps the Worker dumb.
import { WORKER_BASE_URL } from "../config.js";
import { dialog } from "./dialogSystem.js";
import { getBuilderPassword, clearBuilderPassword } from "./builderAuth.js";
import { escapeHtml } from "./domUtils.js";

async function fetchStats(targetType, targetId, aliases, password) {
  const query = aliases.filter(Boolean).map((a) => `alias=${encodeURIComponent(a)}`).join("&");
  const response = await fetch(`${WORKER_BASE_URL}/stats/${targetType}/${targetId}${query ? `?${query}` : ""}`, {
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
  return escapeHtml([entry.city, entry.country].filter(Boolean).join(", "));
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
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(t.trackTitle)}</span>
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

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time (up to 13 months)" },
];

function filterByRange(events, range) {
  if (range === "all") return events;
  const cutoff = Date.now() - Number(range) * 24 * 60 * 60 * 1000;
  return events.filter((e) => e.ts && Date.parse(e.ts) >= cutoff);
}

/** @param {'reel'|'page'|'card'} targetType
 *  @param {string} targetId - the item's stable draft id (reel.id/page.id/
 *    card.id) - the Worker files every event under it
 *  @param {string} label - display name shown in the modal title
 *  @param {string[]} [aliases] - older ids the item was published under
 *    (e.g. its current publishedEmbedId/publishedSlug) whose pre-existing
 *    events should be merged in */
export async function openStatsModal(targetType, targetId, label, aliases = []) {
  const password = await getBuilderPassword();
  if (!password) return;

  let events;
  try {
    events = await fetchStats(targetType, targetId, aliases, password);
  } catch (error) {
    dialog.alert(error.message);
    return;
  }

  const rangeSelect = `
    <select id="statsRangeSelect" title="Only count activity from this period" aria-label="Date range" style="margin-bottom:1rem;">
      ${RANGES.map((r) => `<option value="${r.value}"${r.value === "30" ? " selected" : ""}>${r.label}</option>`).join("")}
    </select>`;

  dialog.createDialog({
    type: "custom",
    message: `Stats — ${label || "(untitled)"}`,
    content: `${rangeSelect}<div id="statsModalBody">${renderStatsHTML(summarizeStats(filterByRange(events, "30")))}</div>`,
    maxWidth: "500px",
    buttons: [
      { text: "Close", type: "secondary", onClick: () => dialog.closeDialog() }
    ]
  });

  setTimeout(() => {
    const select = document.getElementById("statsRangeSelect");
    const body = document.getElementById("statsModalBody");
    if (!select || !body) return;
    select.addEventListener("change", () => {
      body.innerHTML = renderStatsHTML(summarizeStats(filterByRange(events, select.value)));
    });
  }, 0);
}
