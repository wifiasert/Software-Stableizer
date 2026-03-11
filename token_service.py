"""
Token issuance service for Vertex activation.
Verifies a payment reference (placeholder) and issues HMAC-signed tokens
containing user data, software code, and timestamps. Tokens are single-use.
"""
from http.server import BaseHTTPRequestHandler, HTTPServer
import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time

DB_PATH = os.environ.get("VERTEX_ACTIVATION_DB", "activation_tokens.db")
TOKEN_SECRET = os.environ.get("VERTEX_TOKEN_SECRET", "")
SOFTWARE_CODE = os.environ.get("VERTEX_SOFTWARE_CODE", "VERTEX")
TOKEN_TTL_DAYS = int(os.environ.get("VERTEX_TOKEN_TTL_DAYS", "30"))

HOST = os.environ.get("VERTEX_ACTIVATION_HOST", "0.0.0.0")
PORT = int(os.environ.get("VERTEX_ACTIVATION_PORT", "8080"))

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")

def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)

def _sign(payload_b64: str) -> str:
    mac = hmac.new(TOKEN_SECRET.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    return _b64url(mac)

def _make_token(user: str, now: int) -> str:
    payload = {
        "user": user,
        "code": SOFTWARE_CODE,
        "iat": now,
        "exp": now + TOKEN_TTL_DAYS * 86400,
        "jti": _b64url(secrets.token_bytes(12)),
    }
    payload_b64 = _b64url(json.dumps(payload).encode("utf-8"))
    sig = _sign(payload_b64)
    return f"{payload_b64}.{sig}"

def _ensure_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS issued_tokens ("
        "token TEXT PRIMARY KEY, "
        "reference TEXT UNIQUE, "
        "user TEXT, "
        "issued_at INTEGER, "
        "expires_at INTEGER, "
        "used INTEGER DEFAULT 0, "
        "used_at INTEGER, "
        "machine_id TEXT)"
    )
    conn.commit()
    conn.close()

def _issue_token(reference: str, user: str):
    now = int(time.time())
    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute("SELECT token, used FROM issued_tokens WHERE reference = ?", (reference,))
    row = cur.fetchone()
    if row:
        token, used = row
        conn.close()
        if int(used or 0) == 1:
            return None, "Token already used."
        return token, ""
    token = _make_token(user, now)
    conn.execute(
        "INSERT INTO issued_tokens (token, reference, user, issued_at, expires_at) VALUES (?, ?, ?, ?, ?)",
        (token, reference, user, now, now + TOKEN_TTL_DAYS * 86400)
    )
    conn.commit()
    conn.close()
    return token, ""

def _consume_token(token: str, machine_id: str | None):
    try:
        payload_b64, sig = token.split(".", 1)
        expected_sig = _sign(payload_b64)
        if not hmac.compare_digest(expected_sig, sig):
            return False, "Invalid token signature."
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception:
        return False, "Invalid token."

    now = int(time.time())
    if payload.get("code") != SOFTWARE_CODE:
        return False, "Token does not match this software."
    if now > int(payload.get("exp", 0)):
        return False, "Token expired."

    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute("SELECT used FROM issued_tokens WHERE token = ?", (token,))
    row = cur.fetchone()
    if not row:
        conn.close()
        return False, "Token not recognized."
    if row[0] == 1:
        conn.close()
        return False, "Token already used."
    conn.execute(
        "UPDATE issued_tokens SET used = 1, used_at = ?, machine_id = ? WHERE token = ?",
        (now, machine_id, token)
    )
    conn.commit()
    conn.close()
    return True, ""

class Handler(BaseHTTPRequestHandler):
    def _send_headers(self, status, content_type=None, length=None):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        if content_type:
            self.send_header("Content-Type", content_type)
        if length is not None:
            self.send_header("Content-Length", str(length))
        self.end_headers()

    def _send(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self._send_headers(status, "application/json", len(data))
        self.wfile.write(data)

    def do_OPTIONS(self):
        self._send_headers(204)

    def do_POST(self):
        if self.path not in ("/api/tokens/issue", "/api/tokens/consume"):
            self._send(404, {"error": "Not found"})
            return

        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8")
        try:
            payload = json.loads(body or "{}")
        except Exception:
            self._send(400, {"error": "Invalid JSON"})
            return

        if not TOKEN_SECRET or len(TOKEN_SECRET) < 32:
            self._send(500, {"error": "Token secret not configured"})
            return

        if self.path == "/api/tokens/issue":
            reference = (payload.get("reference") or "").strip()
            user = (payload.get("user") or "").strip()
            if not reference:
                self._send(400, {"error": "Missing payment reference"})
                return
            if not user:
                self._send(400, {"error": "Missing user information"})
                return
            if len(user) > 256 or len(reference) > 256:
                self._send(400, {"error": "Reference or user is too long"})
                return
            # TODO: Verify the payment reference with your payment provider here.
            token, err = _issue_token(reference, user)
            if err:
                self._send(409, {"error": err})
                return
            self._send(200, {"token": token, "expires_in_days": TOKEN_TTL_DAYS})
            return

        if self.path == "/api/tokens/consume":
            token = payload.get("token")
            machine_id = payload.get("machine_id")
            if not token:
                self._send(400, {"error": "Missing token"})
                return
            ok, msg = _consume_token(token, machine_id)
            if not ok:
                self._send(400, {"valid": False, "error": msg})
                return
            self._send(200, {"valid": True})
            return

def main():
    _ensure_db()
    server = HTTPServer((HOST, PORT), Handler)
    print("Activation API running.")
    print(f"DB: {DB_PATH}")
    server.serve_forever()

if __name__ == "__main__":
    main()
