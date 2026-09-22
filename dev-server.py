#!/usr/bin/env python3
"""Local static server for ReelPlayer dev/testing.

`python3 -m http.server` serves files by exact path, so the extensionless
`player?id=X` route (see js/modules/pageBlockRenderer.js's renderPlayer())
404s locally - Cloudflare resolves it to player.html automatically ("clean
URLs"); this reproduces just that one behaviour. A published page's own
`/p/<slug>` URL (see js/modules/pagePublish.js's publicPageUrl(),
src/index.js's PAGE_PATH_PATTERN rewrite) is handled separately below,
since it's an exact reserved prefix rather than a clean-URL sibling match.

Reel and page *data* is unaffected - it's fetched from the live Worker at
config.js's WORKER_BASE_URL, which is CORS-open, so no local API is needed.

    python3 dev-server.py [port]        # default port 8777
"""
import http.server
import os
import re
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
ROOT = os.path.dirname(os.path.abspath(__file__))
PAGE_PATH_PATTERN = re.compile(r"^/p/[a-zA-Z0-9_-]+$")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path):
        # Mirrors src/index.js's PAGE_PATH_PATTERN rewrite - an exact
        # reserved prefix, checked first and unconditionally, the same way
        # (see that file's own comment for why "check if a real asset
        # exists at this bare path first" doesn't hold up in production).
        request_path = path.split("?", 1)[0]
        if PAGE_PATH_PATTERN.match(request_path):
            return os.path.join(ROOT, "page.html")

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
