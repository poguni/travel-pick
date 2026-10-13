"""개발용 정적 서버: python -m http.server 와 같지만 캐시를 끈다(고친 CSS·JS가 바로 보이게).

사용: npm run serve  (또는 python dev/serve.py [포트])
"""
import functools
import http.server
import pathlib
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    root = pathlib.Path(__file__).resolve().parent.parent
    handler = functools.partial(NoCacheHandler, directory=str(root))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Travel Pick: http://localhost:{port}  (Ctrl+C로 종료)")
        httpd.serve_forever()
