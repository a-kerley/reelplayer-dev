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

  const locationCounts = new Map();
  [...sessionMap.values()].forEach((sess) => {
    const place = [sess.city, sess.country].filter(Boolean).join(", ") || "Unknown";
    locationCounts.set(place, (locationCounts.get(place) || 0) + 1);
  });
  const topLocations = [...locationCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([place, count]) => ({ place, count }));

  return { totalViews: views.length, totalPlays: plays.length, totalListenSeconds, perTrack, sessions, topLocations };
}

function formatLocation(entry) {
  if (!entry.city && !entry.country) return "Unknown location";
  return escapeHtml([entry.city, entry.country].filter(Boolean).join(", "));
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function statTile(value, label) {
  return `<div class="stats-tile"><div class="stats-tile-value">${value}</div><div class="stats-tile-label">${label}</div></div>`;
}

// Rows with a proportional bar (widest = 100%) - shared by per-track plays
// and top locations.
function barRows(rows) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return rows.map((r) => `
    <div class="stats-bar-row">
      <div class="stats-bar-row-text">
        <span class="stats-bar-row-label" title="${escapeHtml(r.label)}">${escapeHtml(r.label)}</span>
        <span class="stats-bar-row-meta">${r.meta}</span>
      </div>
      <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${(r.value / max) * 100}%"></div></div>
    </div>`).join("");
}

function section(title, body) {
  return `<div class="stats-section"><div class="stats-section-title">${title}</div>${body}</div>`;
}

// Pages never play anything themselves (a page's Player blocks are counted
// under their own reel's stats) - so a page's view is opens-only.
function renderStatsHTML(summary, { opensOnly, hasAnyEvents, analyticsEnabled }) {
  if (summary.totalViews === 0 && summary.totalPlays === 0) {
    const message = !hasAnyEvents
      ? (analyticsEnabled === false
        ? "Analytics is off for this item - turn on Track Analytics to start collecting."
        : "No activity recorded yet.")
      : "No activity in this period.";
    return `<p class="builder-empty-state builder-empty-state--block">${message}</p>`;
  }

  const avgListen = summary.totalPlays ? summary.totalListenSeconds / summary.totalPlays : 0;
  const tiles = opensOnly
    ? statTile(summary.totalViews, "Opens")
    : statTile(summary.totalViews, "Opens") +
      statTile(summary.totalPlays, "Plays") +
      statTile(formatDuration(summary.totalListenSeconds), "Listen time") +
      statTile(formatDuration(avgListen), "Avg per play");

  const perTrack = !opensOnly && summary.perTrack.length
    ? section("Plays per track", `<div class="stats-scroll">${barRows(summary.perTrack.map((t) => ({
        label: t.trackTitle,
        value: t.count,
        meta: `${plural(t.count, "play")} &middot; ${formatDuration(t.totalListenSeconds)}`,
      })))}</div>`)
    : "";

  const locations = summary.topLocations.length
    ? section("Top locations", barRows(summary.topLocations.map((l) => ({
        label: l.place, value: l.count, meta: plural(l.count, "visit"),
      }))))
    : "";

  const sessions = section("Recent visits", `<div class="stats-scroll stats-scroll--tall">${summary.sessions.map((s) => `
    <div class="stats-session">
      <span>${s.ts ? new Date(s.ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Unknown time"}</span>
      <span class="stats-session-meta">${formatLocation(s)}${!opensOnly && s.plays.length ? ` &middot; ${plural(s.plays.length, "play")}, ${formatDuration(s.totalListenSeconds)}` : ""}</span>
    </div>`).join("")}</div>`);

  return `<div class="stats-tiles${opensOnly ? " stats-tiles--single" : ""}">${tiles}</div>${perTrack}${locations}${sessions}`;
}

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time (13 months)" },
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
 *    events should be merged in
 *  @param {{analyticsEnabled?: boolean}} [options] - lets the empty state
 *    say *why* there's nothing (tracking off vs. just no visitors yet) */
export async function openStatsModal(targetType, targetId, label, aliases = [], { analyticsEnabled } = {}) {
  const password = await getBuilderPassword();
  if (!password) return;

  let events;
  try {
    events = await fetchStats(targetType, targetId, aliases, password);
  } catch (error) {
    dialog.alert(error.message);
    return;
  }

  const renderOptions = { opensOnly: targetType === "page", hasAnyEvents: events.length > 0, analyticsEnabled };
  const render = (range) => renderStatsHTML(summarizeStats(filterByRange(events, range)), renderOptions);

  const rangeSelect = `
    <div class="stats-toolbar">
      <select id="statsRangeSelect" class="stats-range-select" title="Only count activity from this period" aria-label="Date range">
        ${RANGES.map((r) => `<option value="${r.value}"${r.value === "30" ? " selected" : ""}>${r.label}</option>`).join("")}
      </select>
    </div>`;

  dialog.createDialog({
    type: "custom",
    message: `Stats — ${label || "(untitled)"}`,
    content: `${rangeSelect}<div id="statsModalBody">${render("30")}</div>`,
    maxWidth: "560px",
    buttons: [
      { text: "Close", type: "secondary", onClick: () => dialog.closeDialog() }
    ]
  });

  setTimeout(() => {
    const select = document.getElementById("statsRangeSelect");
    const body = document.getElementById("statsModalBody");
    if (!select || !body) return;
    select.addEventListener("change", () => {
      body.innerHTML = render(select.value);
    });
  }, 0);
}
