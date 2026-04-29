"""
1-click smoke test runner for Plan 01 user-login-01-supabase.

Reads SUPABASE_HUB_ANON_KEY from root .env, injects into auth_smoke_test.html,
serves on http://localhost:50089/, opens browser.

Run: py projects/MaxMahon/scripts/run_auth_smoke_test.py
Stop: Ctrl+C

NOTE: Stop max-server.bat (FastAPI on 50089) first or this errors.
"""
import http.server
import socketserver
import webbrowser
import threading
import os
import sys
from pathlib import Path

try:
    import dotenv
except ImportError:
    sys.exit("ERROR: python-dotenv not installed. Run: pip install python-dotenv")

PROJECT_ROOT = Path(__file__).parent.parent
WORKSPACE_ROOT = PROJECT_ROOT.parent.parent
HTML_PATH = PROJECT_ROOT / "scripts" / "auth_smoke_test.html"
PORT = 50089
PLACEHOLDER = "<paste-from-Supabase-Dashboard-Settings-API-anon-public-key>"

dotenv.load_dotenv(WORKSPACE_ROOT / ".env")
ANON_KEY = os.environ.get("SUPABASE_HUB_ANON_KEY")
if not ANON_KEY:
    sys.exit("ERROR: SUPABASE_HUB_ANON_KEY not found in .env")
if not HTML_PATH.exists():
    sys.exit(f"ERROR: {HTML_PATH} not found")

html_injected = HTML_PATH.read_text(encoding='utf-8').replace(PLACEHOLDER, ANON_KEY)


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/", "/auth_smoke_test.html"):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(html_injected.encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, fmt, *args):
        pass


def main():
    try:
        with socketserver.TCPServer(("localhost", PORT), Handler) as httpd:
            url = f"http://localhost:{PORT}/auth_smoke_test.html"
            print(f"\n{'='*60}\n  MaxMahon Auth Smoke Test\n{'='*60}")
            print(f"  URL:     {url}")
            print(f"  ANON_KEY: injected ({len(ANON_KEY)} chars)")
            print(f"  Stop:    Ctrl+C\n")
            print("Opening browser...")
            threading.Timer(1.0, lambda: webbrowser.open(url)).start()
            httpd.serve_forever()
    except OSError as e:
        if "10048" in str(e) or "address already in use" in str(e).lower():
            sys.exit(
                f"\nERROR: Port {PORT} is in use.\n"
                "Stop max-server.bat (FastAPI) first, then re-run this script."
            )
        raise
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == "__main__":
    main()
