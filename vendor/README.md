# Vendored third-party libraries

Served from our own origin at an exact, pinned version - never a public CDN
and never a floating tag like `@7` or `@latest`:

- **Privacy:** a CDN request sends every visitor's IP to that CDN; the player
  runs on third-party sites, so this matters (same reasoning as the
  self-hosted fonts in `assets/fonts/`).
- **Stability/supply chain:** a floating tag silently upgrades under you. That
  already happened once - Pickr's `default` option broke and every colour
  swatch rendered black (see the `setColor()` workaround in
  `js/modules/colorPicker.js`) - and a compromised release would have run
  inside every embed.

| Library | Version | Used by | Licence |
|---|---|---|---|
| wavesurfer.js | 7.12.12 | `player.html`, `index.html` | BSD-3-Clause |
| @simonwep/pickr | 1.10.2 | `index.html` (builder only) | MIT |

To upgrade: download the new `dist/` files into a new `<name>-<version>/`
folder (plus its `LICENSE`) - a hyphen, not `@`, which Cloudflare 307-redirects to `%40` - update the `<script>`/`<link>` paths, test, then
delete the old folder. The folder name carries the version so a stale browser
cache can never mix versions.
