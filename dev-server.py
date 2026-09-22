#!/usr/bin/env python3
"""Local static server for ReelPlayer dev/testing.

`python3 -m http.server` serves files by exact path, so the extensionless
routes the app relies on in production - `player?id=X` (see
js/modules/pageBlockRenderer.js's renderPlayer()), and a published page's
own bare `/<slug>` URL (see js/modules/pagePublish.js's publicPageUrl(),
src/index.js's SLUG_PATH_PATTERN rewrite) - 404 locally. This reproduces
both: a `.html` sibling always wins first (`player` -> `player.html`,
`page` -> `page.html`), and a bare single-segment path with no matching
file/sibling at all falls back to `page.html`, mirroring src/index.js's
own production fallback for a page slug.

Reel and page *data* is unaffected - it's fetched from the live Worker at
config.js's WORKER_BASE_URL, which is CORS-open, so no local API is needed.

    python3 dev-server.py [port]        # default port 8777
"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path):
        local = super().translate_path(path)
        # Directories and existing files: serve as-is.
        if os.path.isdir(local) or os.path.exists(local):
            return local
        # Extensionless request whose `.html` sibling exists -> serve that
        # (the Cloudflare Pages clean-URL behaviour this app depends on).
        if not os.path.splitext(local)[1] and os.path.exists(local + ".html"):
            return local + ".html"
        # A bare single-path-segment request that matched neither a real
        # file nor an existing `.html` sibling above (so it's not `/player`
        # or `/page` themselves, both already handled by the sibling check)
        # - treat it as a published page's slug and serve page.html,
        # mirroring src/index.js's SLUG_PATH_PATTERN fallback in production.
        segment = os.path.relpath(local, ROOT)
        if "." not in segment and os.sep not in segment:
            return os.path.join(ROOT, "page.html")
        return local

    def end_headers(self):
        # No-cache so a hard reload always picks up edited JS/CSS modules.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(ROOT)
    with http.server.ThreadingHTTPServer(("", PORT), Handler) as httpd:
        print(f"ReelPlayer dev server: http://localhost:{PORT}/  (Ctrl+C to stop)")
        httpd.serve_forever()
