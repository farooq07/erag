"""
Tiny role-based access layer.

For demos we identify users by the `X-User` header (sent from the user picker
in the frontend). In production this is the seam where SSO / SAML / OAuth /
JWT verification slots in — replace `get_current_user` and the rest of the
codebase stays the same.
"""
import json
from functools import lru_cache

from fastapi import Header, HTTPException

from config import USERS_FILE


@lru_cache(maxsize=1)
def _load_users_cached(mtime: float) -> dict:
    data = json.loads(USERS_FILE.read_text())
    return {u["id"]: u for u in data.get("users", [])}


def load_users() -> dict:
    """Load users keyed by id. Cached on file mtime so edits are picked up."""
    if not USERS_FILE.exists():
        return {}
    return _load_users_cached(USERS_FILE.stat().st_mtime)


def list_users() -> list[dict]:
    return list(load_users().values())


def get_current_user(x_user: str | None = Header(default=None, alias="X-User")) -> dict:
    """FastAPI dependency: resolves the X-User header to a user record."""
    users = load_users()
    if not users:
        raise HTTPException(status_code=500, detail="No users configured")
    # No header → first user (admin), so the API is usable without auth wiring.
    if not x_user:
        return next(iter(users.values()))
    user = users.get(x_user)
    if not user:
        raise HTTPException(status_code=401, detail=f"Unknown user: {x_user}")
    return user


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
