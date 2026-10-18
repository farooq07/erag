"""
Authentication: email/password login with short-lived access tokens and
rotating refresh tokens.

- Access token: HS256 JWT (stdlib HMAC), ACCESS_TOKEN_MINUTES long, sent as
  `Authorization: Bearer`. Carries the user's token_version, so bumping it
  (password change/reset, "log out everywhere") revokes every access token.
- Refresh token: random opaque string in an httpOnly cookie, stored hashed.
  Each use rotates it; presenting an already-rotated token means it was
  copied, so every session of that user is revoked.
- Lockout: LOCKOUT_THRESHOLD failed logins lock the account for LOCKOUT_MINUTES.

Endpoints are registered in main.py under /auth/*.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import uuid
from datetime import timedelta

import bcrypt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, update

from config import (
    ACCESS_TOKEN_MINUTES,
    APP_BASE_URL,
    LOCKOUT_MINUTES,
    LOCKOUT_THRESHOLD,
    PASSWORD_RESET_MINUTES,
    REFRESH_TOKEN_DAYS,
)
from db import PasswordResetToken, RefreshToken, User, aware, session_scope, utcnow
from mailer import send_email

_DEV_SECRET = "documind-dev-secret-change-in-production"
SECRET = os.getenv("JWT_SECRET", _DEV_SECRET).encode()
if SECRET == _DEV_SECRET.encode():
    print("[auth] WARNING: JWT_SECRET is not set; using the insecure dev secret.")

ACCESS_TOKEN_SECONDS = ACCESS_TOKEN_MINUTES * 60
MIN_PASSWORD_LEN = 8
REFRESH_REUSE_GRACE_SECONDS = 30

bearer_scheme = HTTPBearer(auto_error=False)


# ── Minimal HS256 JWT (stdlib only) ──────────────────────────────────────

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    pad = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + "=" * (pad % 4))


HEADER = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())


def create_access_token(user_id: str, token_version: int) -> str:
    now = int(time.time())
    claims = {"sub": user_id, "tv": token_version, "typ": "access", "iat": now, "exp": now + ACCESS_TOKEN_SECONDS}
    payload = _b64url(json.dumps(claims).encode())
    sig = _b64url(hmac.new(SECRET, f"{HEADER}.{payload}".encode(), hashlib.sha256).digest())
    return f"{HEADER}.{payload}.{sig}"


def decode_token(token: str) -> dict:
    """Return the verified claims or raise 401."""
    try:
        header, payload, sig = token.split(".")
        expected = _b64url(hmac.new(SECRET, f"{header}.{payload}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            raise ValueError("bad signature")
        data = json.loads(_b64url_decode(payload))
        if data.get("exp", 0) < time.time() or data.get("typ") != "access":
            raise ValueError("expired or wrong type")
        return data
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from e


# ── Password helpers ─────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def _check_password_strength(password: str) -> None:
    if len(password) < MIN_PASSWORD_LEN:
        raise HTTPException(status_code=400, detail=f"Password must be at least {MIN_PASSWORD_LEN} characters")
    if len(password.encode()) > 72:  # bcrypt ignores bytes past 72
        raise HTTPException(status_code=400, detail="Password is too long")


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ── User store ───────────────────────────────────────────────────────────

def list_users() -> list[dict]:
    with session_scope() as s:
        return [u.public() for u in s.scalars(select(User).order_by(User.created_at))]


def _by_email(s, email: str) -> User | None:
    return s.scalar(select(User).where(User.email == email.lower().strip()))


# ── Sessions ─────────────────────────────────────────────────────────────

class Session:
    """What a successful login/signup/refresh hands back to the API layer."""

    def __init__(self, user: dict, access_token: str, refresh_token: str):
        self.user = user
        self.access_token = access_token
        self.refresh_token = refresh_token

    def body(self) -> dict:
        return {"access_token": self.access_token, "expires_in": ACCESS_TOKEN_SECONDS, "user": self.user}


def _new_session(s, user: User, user_agent: str | None) -> tuple[Session, RefreshToken]:
    raw = secrets.token_urlsafe(48)
    row = RefreshToken(
        user_id=user.id,
        token_hash=_hash_token(raw),
        expires_at=utcnow() + timedelta(days=REFRESH_TOKEN_DAYS),
        user_agent=(user_agent or "")[:300] or None,
    )
    s.add(row)
    s.flush()
    return Session(user.public(), create_access_token(user.id, user.token_version), raw), row


def _revoke_all(s, user_id: str) -> None:
    s.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )


def do_signup(name: str, email: str, password: str, user_agent: str | None = None) -> Session:
    if not name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    if not email.strip() or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    _check_password_strength(password)

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
            token_version=0,
        )
        s.add(user)
        s.flush()
        session, _ = _new_session(s, user, user_agent)
    return session


def do_login(email: str, password: str, user_agent: str | None = None) -> Session:
    # Commit the failed-attempt counter before raising, so the session must
    # finish first; the outcome is decided inside and acted on after.
    outcome, session = "bad", None
    with session_scope() as s:
        user = _by_email(s, email)
        if user is None or not user.password_hash:
            verify_password(password, _DUMMY_HASH)  # same timing as a real check
        elif aware(user.locked_until) and aware(user.locked_until) > utcnow():
            outcome = "locked"
        elif not verify_password(password, user.password_hash):
            user.failed_logins = (user.failed_logins or 0) + 1
            if user.failed_logins >= LOCKOUT_THRESHOLD:
                user.locked_until = utcnow() + timedelta(minutes=LOCKOUT_MINUTES)
                user.failed_logins = 0
                outcome = "locked"
        else:
            user.failed_logins = 0
            user.locked_until = None
            session, _ = _new_session(s, user, user_agent)
            outcome = "ok"

    if outcome == "locked":
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Try again in {LOCKOUT_MINUTES} minutes or reset your password.",
        )
    if outcome != "ok":
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return session


_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def session_for_user(user_id: str, user_agent: str | None = None) -> Session:
    """Start a session for an already-authenticated user (e.g. after SSO)."""
    with session_scope() as s:
        user = s.get(User, user_id)
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        user.failed_logins = 0
        session, _ = _new_session(s, user, user_agent)
    return session


def rotate_refresh_token(raw: str | None, user_agent: str | None = None) -> Session:
    """Exchange a refresh token for a new access + refresh token pair."""
    if not raw:
        raise HTTPException(status_code=401, detail="No session")
    reused = False
    session = None
    with session_scope() as s:
        row = s.scalar(select(RefreshToken).where(RefreshToken.token_hash == _hash_token(raw)))
        if row is None or aware(row.expires_at) < utcnow():
            pass
        elif row.revoked_at is not None:
            # A rotated-out token came back: someone has a copy, so kill every
            # session. Exception: two tabs refreshing at once both send the old
            # cookie; within the grace window just fail and let the client retry
            # with the cookie the first refresh set.
            recently = utcnow() - aware(row.revoked_at) < timedelta(seconds=REFRESH_REUSE_GRACE_SECONDS)
            if row.replaced_by is not None and not recently:
                _revoke_all(s, row.user_id)
                reused = True
        else:
            user = s.get(User, row.user_id)
            if user is not None:
                session, new_row = _new_session(s, user, user_agent)
                row.revoked_at = utcnow()
                row.replaced_by = new_row.id
    if reused:
        print(f"[auth] refresh token reuse detected for user {row.user_id}; all sessions revoked")
    if session is None:
        raise HTTPException(status_code=401, detail="Session expired, please log in again")
    return session


def revoke_refresh_token(raw: str | None) -> str | None:
    """Log out one session. Returns the user id it belonged to, if any."""
    if not raw:
        return None
    with session_scope() as s:
        row = s.scalar(select(RefreshToken).where(RefreshToken.token_hash == _hash_token(raw)))
        if row is None:
            return None
        if row.revoked_at is None:
            row.revoked_at = utcnow()
        return row.user_id


def logout_everywhere(user_id: str) -> None:
    with session_scope() as s:
        user = s.get(User, user_id)
        user.token_version += 1
        _revoke_all(s, user_id)


def change_password(user_id: str, current: str, new: str) -> None:
    _check_password_strength(new)
    with session_scope() as s:
        user = s.get(User, user_id)
        if not user or not user.password_hash or not verify_password(current, user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        user.password_hash = hash_password(new)
        user.token_version += 1
        _revoke_all(s, user_id)


# ── Password reset ───────────────────────────────────────────────────────

def request_password_reset(email: str) -> str | None:
    """Email a reset link if the account exists. Returns the user id or None.

    The API always answers the same way, so callers can't probe which emails
    are registered.
    """
    raw = secrets.token_urlsafe(32)
    with session_scope() as s:
        user = _by_email(s, email)
        if user is None:
            return None
        s.add(PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(raw),
            expires_at=utcnow() + timedelta(minutes=PASSWORD_RESET_MINUTES),
        ))
        to, name, uid = user.email, user.name, user.id
    send_email(
        to,
        "Reset your DocuMind password",
        f"Hi {name},\n\n"
        f"Use this link to choose a new password. It expires in {PASSWORD_RESET_MINUTES} minutes "
        f"and can be used once:\n\n{APP_BASE_URL}/reset-password?token={raw}\n\n"
        "If you didn't ask for this, you can ignore this email.",
    )
    return uid


def reset_password(raw: str, new_password: str) -> str:
    """Set a new password from a reset token. Returns the user id."""
    _check_password_strength(new_password)
    with session_scope() as s:
        row = s.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == _hash_token(raw or "")))
        if row is None or row.used_at is not None or aware(row.expires_at) < utcnow():
            raise HTTPException(status_code=400, detail="This reset link is invalid or has expired")
        user = s.get(User, row.user_id)
        user.password_hash = hash_password(new_password)
        user.token_version += 1
        user.failed_logins = 0
        user.locked_until = None
        row.used_at = utcnow()
        _revoke_all(s, user.id)
        return user.id


# ── FastAPI dependency ───────────────────────────────────────────────────

def user_from_token(token: str) -> dict:
    claims = decode_token(token)
    with session_scope() as s:
        user = s.get(User, claims.get("sub"))
        if not user or claims.get("tv") != user.token_version:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
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
