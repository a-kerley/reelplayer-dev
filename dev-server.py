#!/usr/bin/env python3
"""Local static server for ReelPlayer dev/testing.

`python3 -m http.server` serves files by exact path, so the extensionless
routes the app relies on in production - `player?id=X`, `page?slug=Y` (see
js/modules/pageBlockRenderer.js's renderPlayer(), page.html) - 404 locally.
Cloudflare Pages resolves those to `player.html` / `page.html` automatically
("clean URLs"); this reproduces just that one behaviour so the Pages tab's
reel-player blocks and Preview Page work when serving the repo locally.

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
