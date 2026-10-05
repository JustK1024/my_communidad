#!/usr/bin/env python3
import json
import secrets
import sys
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


CLIENT_FILE = Path("secrets/google_oauth_client.json")
REDIRECT_URI = "http://localhost:3000/oauth2callback"
SCOPE = "https://www.googleapis.com/auth/drive.file"


def load_client_config():
    if not CLIENT_FILE.exists():
        raise SystemExit(f"Missing OAuth client file: {CLIENT_FILE}")

    data = json.loads(CLIENT_FILE.read_text())
    config = data.get("web") or data.get("installed")
    if not config:
        raise SystemExit("OAuth JSON must contain a 'web' or 'installed' client config.")

    return config["client_id"], config["client_secret"]


def build_auth_url(client_id, state):
    params = {
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)


def wait_for_code(expected_state):
    result = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)

            if parsed.path != "/oauth2callback":
                self.send_response(404)
                self.end_headers()
                return

            state = params.get("state", [""])[0]
            code = params.get("code", [""])[0]
            error = params.get("error", [""])[0]

            if state != expected_state:
                result["error"] = "State mismatch. Please try again."
            elif error:
                result["error"] = error
            elif code:
                result["code"] = code
            else:
                result["error"] = "No authorization code returned."

            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(
                b"<h1>Authorization received</h1>"
                b"<p>You can close this browser tab and return to the terminal.</p>"
            )

        def log_message(self, format, *args):
            return

    server = HTTPServer(("localhost", 3000), Handler)
    server.handle_request()

    if "error" in result:
        raise SystemExit(result["error"])
    return result["code"]


def exchange_code(client_id, client_secret, code):
    body = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": REDIRECT_URI,
        }
    ).encode()

    request = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        details = exc.read().decode()
        raise SystemExit(f"Token exchange failed: {details}") from exc


def main():
    client_id, client_secret = load_client_config()
    state = secrets.token_urlsafe(24)
    auth_url = build_auth_url(client_id, state)

    print("\nOpen this URL in your browser:\n")
    print(auth_url)
    print("\nWaiting for Google to redirect back to localhost:3000...\n")

    code = wait_for_code(state)
    token_response = exchange_code(client_id, client_secret, code)
    refresh_token = token_response.get("refresh_token")

    if not refresh_token:
        print(json.dumps(token_response, indent=2), file=sys.stderr)
        raise SystemExit(
            "No refresh_token returned. Make sure you used prompt=consent and selected the correct test user."
        )

    print("\nGOOGLE_REFRESH_TOKEN:")
    print(refresh_token)
    print("\nStore this in your backend .env only. Do not put it in the frontend or commit it.")


if __name__ == "__main__":
    main()
