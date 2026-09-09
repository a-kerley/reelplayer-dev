# boxed-ape-site source snapshot (reference only)

Read-only copy of the current project-card implementation from the sister repo,
so the Project Cards feature can be built entirely from inside reelplayer-dev
without switching repos.

- **Source:** `github.com/a-kerley/boxed-ape-site`
- **Commit:** `244d1f7edb3274a224d880f14cfbc3e4317a576d` (2026-01-11)
- **Nothing here is wired into reelplayer.** It is not imported, not served,
  not deployed. Delete this folder once the feature lands.

## What each file is

| File | Role in boxed-ape today | Relevance here |
|---|---|---|
| `project-card.js` | `ProjectCard` class — renders a card from a data object, Info/Listen tabs, hover video, expand/collapse | **Port the `template()` / `renderExtraContent()` / `renderStats()` / `renderLinks()` markup** into the `mode:"card"` render branch. Behaviour (expand/collapse) is already covered by reelplayer's expandable mode. |
| `project-card.css` | all card styling | Port wholesale into a new `css/card.css`, loaded by `player.html`. Uses `--card-*` CSS vars set from `themeColors` (see `applyThemeColors()`). |
| `AudioPlayer.js` / `audio-player.css` | the Listen-tab waveform player | **This is a hand-copied fork of reelplayer's `js/player.js` + `css/player.css`** — same `PLAYER_DESIGN_SPEC.md` (byte-identical, also copied here). Do NOT port it; the card's Listen tab wraps the real reelplayer player instead. Kept here only to diff against for any behaviour boxed-ape added that reelplayer lacks. |
| `projects-data.js` | the hand-edited data store, one object per project | The **card schema reference** — every field a card needs: `video`, `image`, `listenImage`, `logo`, `logoAlt`, `partnerLogos[]`, `composers`, `description[]`, `stats[]` (`{label?,value}`), `links[]` (`{url,icon,alt}`), `audioTracks[]` (`{title,file,backgroundImage?}`), `audioPlayerColors{}`, `themeColors{}`, `enableListenTab`, `order`. |
| `masonry-layout.js` | custom masonry grid + expansion reflow | Stays on the boxed-ape side. Repoint its reflow trigger from card DOM class changes to `message` events (`reelplayer:resize`). Copied for reference when doing that. |
| `index.html` / `script.js` | how cards are placed today: `script.js` builds `.project-card-wrapper` divs from `projectsData` sorted by `order`, then `new MasonryLayout(...)` | Reference for the replacement injector (list of `{cardId}` → one `<iframe loading="lazy">` per card). |
| `assets/icons/`, `assets/link_icons/` | tab icons + streaming-service link icons referenced by the card templates | Need to move into reelplayer and be served from the player origin (or R2). Listed in the plan under "Asset migration". |
