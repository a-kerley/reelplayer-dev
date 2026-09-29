// A track's background is either an image or a video (per-track toggle in the
// Reels tab's Per-Track Backgrounds list). Every reader of a track's background
// goes through these so the inactive field is ignored consistently in the
// builder preview, embeds and cards alike. Tracks saved before the toggle
// existed have no backgroundType: a set video wins, matching the old behaviour.
export function trackBackgroundType(track) {
  if (track?.backgroundType === "image" || track?.backgroundType === "video") return track.backgroundType;
  return track?.backgroundVideo?.trim() ? "video" : "image";
}

export function trackBackgroundImage(track) {
  return trackBackgroundType(track) === "image" ? (track?.backgroundImage || "") : "";
}

export function trackBackgroundVideo(track) {
  return trackBackgroundType(track) === "video" ? (track?.backgroundVideo || "") : "";
}
