"""Local server for Rimoboy: serves this folder on http://127.0.0.1:8080 with caching off,
so the browser always loads the newest files. Run: python serve.py [port]"""
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    # PORT (set by the preview tool when 8080 is busy) wins over the argument
    port = int(os.environ.get("PORT") or (sys.argv[1] if len(sys.argv) > 1 else 8080))
    print(f"Rimoboy: http://127.0.0.1:{port}/  (Ctrl+C to stop)")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
