"""
Authentication: JWT email/password auth using stdlib HMAC-SHA256.
No native crypto dependencies required.

Endpoints (registered in main.py):
  POST /auth/signup  — create account, returns token + user
  POST /auth/login   — verify credentials, returns token + user
  GET  /auth/me      — returns current user from token
"""
import base64
import hashlib
import hmac
import json
import os
import time
import uuid

import bcrypt
from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import USERS_FILE

SECRET = os.getenv("JWT_SECRET", "documind-dev-secret-change-in-production").encode()
TOKEN_SECONDS = 7 * 24 * 3600  # 7 days

bearer_scheme = HTTPBearer(auto_error=False)


# ── Minimal HS256 JWT (stdlib only) ──────────────────────────────────────

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    pad = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + "=" * (pad % 4))


HEADER = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())


def create_token(user_id: str) -> str:
    payload = _b64url(json.dumps({"sub": user_id, "exp": int(time.time()) + TOKEN_SECONDS}).encode())
    sig = _b64url(hmac.new(SECRET, f"{HEADER}.{payload}".encode(), hashlib.sha256).digest())
    return f"{HEADER}.{payload}.{sig}"


def decode_token(token: str) -> str:
    """Return user_id or raise 401."""
    try:
        header, payload, sig = token.split(".")
        expected = _b64url(hmac.new(SECRET, f"{header}.{payload}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            raise ValueError("bad signature")
        data = json.loads(_b64url_decode(payload))
        if data.get("exp", 0) < time.time():
            raise ValueError("expired")
        return data["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ── Password helpers ─────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ── User store ───────────────────────────────────────────────────────────

def _read() -> dict:
    if not USERS_FILE.exists():
        return {"users": []}
    return json.loads(USERS_FILE.read_text())


def _write(data: dict) -> None:
    USERS_FILE.write_text(json.dumps(data, indent=2))


def load_users() -> dict:
    return {u["id"]: u for u in _read().get("users", [])}


def _public(user: dict) -> dict:
    return {k: v for k, v in user.items() if k != "password_hash"}


def list_users() -> list[dict]:
    return [_public(u) for u in load_users().values()]


def _by_email(email: str) -> dict | None:
    for u in load_users().values():
        if u.get("email", "").lower() == email.lower():
            return u
    return None


# ── Auth operations ──────────────────────────────────────────────────────

def do_signup(name: str, email: str, password: str) -> tuple[dict, str]:
    if not name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    if not email.strip() or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if _by_email(email):
        raise HTTPException(status_code=400, detail="Email already registered")

    data = _read()
    user = {
        "id": str(uuid.uuid4())[:8],
        "name": name.strip(),
        "email": email.lower().strip(),
        "password_hash": hash_password(password),
        "role": "Staff",
        "departments": ["General"],
        "can_upload": False,
    }
    data["users"].append(user)
    _write(data)
    return _public(user), create_token(user["id"])


def do_login(email: str, password: str) -> tuple[dict, str]:
    user = _by_email(email)
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return _public(user), create_token(user["id"])


# ── FastAPI dependency ───────────────────────────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    x_user: str | None = Header(default=None, alias="X-User"),
) -> dict:
    users = load_users()

    if credentials and credentials.credentials:
        uid = decode_token(credentials.credentials)
        user = users.get(uid)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return _public(user)

    if x_user:
        user = users.get(x_user)
        if not user:
            raise HTTPException(status_code=401, detail=f"Unknown user: {x_user}")
        return _public(user)

    if not users:
        raise HTTPException(status_code=500, detail="No users configured")
    return _public(next(iter(users.values())))


# ── RBAC helpers ─────────────────────────────────────────────────────────

def allowed_departments(user: dict) -> list[str]:
    return list(user.get("departments", []))


def assert_can_access(user: dict, department: str) -> None:
    if department not in allowed_departments(user):
        raise HTTPException(
            status_code=403,
            detail=f"{user.get('role', 'User')} does not have access to {department}",
        )


def assert_can_upload(user: dict, department: str) -> None:
    if not user.get("can_upload", False):
        raise HTTPException(status_code=403, detail=f"{user.get('role')} is read-only")
    assert_can_access(user, department)
