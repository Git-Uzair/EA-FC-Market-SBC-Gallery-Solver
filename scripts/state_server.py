"""Local helper server for the trading engine (binds 127.0.0.1:8765 only).

GET  any repo file: the Playwright loader (scripts/run.js) fetches scripts/*.js and data/market_state.json.
PUT  /data/market_state.json only: run.js saves the engine state there after every call, so the repo
     always holds the latest holdings, open bids, realized profit and watchlist for the next chat.

Start once per session from the repo root (background process):  python scripts/state_server.py
"""
import functools
import http.server
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
STATE = ROOT / "data" / "market_state.json"


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_PUT(self):
        if self.path.split("?")[0] != "/data/market_state.json":
            self.send_error(403, "only data/market_state.json is writable")
            return
        size = int(self.headers.get("Content-Length") or 0)
        if not 0 < size <= 1_000_000:
            self.send_error(413, "empty or too large")
            return
        body = self.rfile.read(size)
        try:
            json.loads(body)
        except ValueError:
            self.send_error(400, "body is not valid JSON")
            return
        tmp = STATE.with_suffix(".tmp")
        tmp.write_bytes(body.rstrip(b"\n") + b"\n")
        tmp.replace(STATE)
        self.send_response(204)
        self.end_headers()

    def log_message(self, format, *args):  # keep the background process log quiet
        pass


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=str(ROOT))
    http.server.ThreadingHTTPServer(("127.0.0.1", 8765), handler).serve_forever()
