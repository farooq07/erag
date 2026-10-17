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
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select

from db import User, session_scope

_DEV_SECRET = "documind-dev-secret-change-in-production"
SECRET = os.getenv("JWT_SECRET", _DEV_SECRET).encode()
if SECRET == _DEV_SECRET.encode():
    print("[auth] WARNING: JWT_SECRET is not set; using the insecure dev secret.")
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

def list_users() -> list[dict]:
    with session_scope() as s:
        return [u.public() for u in s.scalars(select(User).order_by(User.created_at))]


def _by_email(s, email: str) -> User | None:
    return s.scalar(select(User).where(User.email == email.lower().strip()))


# ── Auth operations ──────────────────────────────────────────────────────

def do_signup(name: str, email: str, password: str) -> tuple[dict, str]:
    if not name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    if not email.strip() or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    with session_scope() as s:
        if _by_email(s, email):
            raise HTTPException(status_code=400, detail="Email already registered")
        user = User(
            id=uuid.uuid4().hex[:12],
            name=name.strip(),
            email=email.lower().strip(),
            password_hash=hash_password(password),
            role="Staff",
            departments=["General"],
            can_upload=False,
        )
        s.add(user)
        public = user.public()
    return public, create_token(public["id"])


def do_login(email: str, password: str) -> tuple[dict, str]:
    with session_scope() as s:
        user = _by_email(s, email)
        if not user or not user.password_hash or not verify_password(password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        public = user.public()
    return public, create_token(public["id"])


# ── FastAPI dependency ───────────────────────────────────────────────────

def user_from_token(token: str) -> dict:
    uid = decode_token(token)
    with session_scope() as s:
        user = s.get(User, uid)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user.public()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_from_token(credentials.credentials)


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


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
