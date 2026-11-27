"""Development-only clean-URL static server. The deployed application remains static."""
import http.server
import pathlib
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[1] / "dist"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_HEAD(self):
        self.do_GET(head=True)

    def do_GET(self, head=False):
        url = urllib.parse.urlsplit(self.path)
        path = urllib.parse.unquote(url.path)
        if path.endswith(".html"):
            clean = "/" if path == "/index.html" else path[:-5]
            self.send_response(308)
            self.send_header("Location", clean + ("?" + url.query if url.query else ""))
            self.end_headers()
            return
        # Old query links redirect to crawlable endpoint URLs.
        params = urllib.parse.parse_qs(url.query)
        if path in ("/docs", "/playground") and params.get("endpoint"):
            endpoint = params.pop("endpoint")[0]
            slug = "/".join(urllib.parse.quote(part.lstrip(":"), safe="") for part in endpoint.split("/") if part)
            suffix = urllib.parse.urlencode(params, doseq=True)
            self.send_response(308)
            self.send_header("Location", path + "/" + slug + ("?" + suffix if suffix else ""))
            self.end_headers()
            return
        if path != "/" and not pathlib.Path(self.translate_path(url.path)).is_file():
            candidate = pathlib.Path(self.translate_path(url.path + ".html"))
            if candidate.is_file():
                self.path = url.path + ".html" + ("?" + url.query if url.query else "")
            else:
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                if not head: self.wfile.write((ROOT / "404.html").read_bytes())
                return
        super().do_HEAD() if head else super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404)
        return None


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("0.0.0.0", 5000), Handler).serve_forever()
