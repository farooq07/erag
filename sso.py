"""
Single sign-on with Google and Microsoft Entra ID (OpenID Connect).

Authorization-code flow with PKCE:
  1. /auth/sso/{provider}/start    → redirect to the provider; state, nonce and
                                     PKCE verifier ride in a signed, httpOnly,
                                     10-minute cookie.
  2. /auth/sso/{provider}/callback → check state, exchange the code, verify the
                                     ID token (signature via the provider's JWKS,
                                     issuer, audience, expiry, nonce), then map
                                     the identity to a DocuMind user.

Account mapping, in order:
  - a user_identities row for (provider, sub) → that user
  - otherwise, if the provider vouches for the email, an existing user with
    that email is linked
  - otherwise a new Staff user is created (SSO_AUTO_SIGNUP)

Emails count as verified only when the provider vouches for them: Google's
email_verified, or Microsoft with a single-tenant setup (or the xms_edov
claim). Unverified emails are never used to link or create accounts, which
closes the "set someone else's email in your own tenant" takeover.
"""
import base64
import hashlib
import hmac
import json
import secrets
import time
import uuid
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import HTTPException
from sqlalchemy import select

from auth import SECRET
from config import (
    APP_BASE_URL,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    MICROSOFT_CLIENT_ID,
    MICROSOFT_CLIENT_SECRET,
    MICROSOFT_TENANT,
    SSO_ALLOWED_DOMAINS,
    SSO_AUTO_SIGNUP,
)
from db import User, UserIdentity, session_scope, utcnow

STATE_TTL_SECONDS = 600
DISCOVERY_TTL_SECONDS = 3600
MULTI_TENANT = {"common", "organizations", "consumers"}

# Module-level so tests can swap in a mock transport.
http = httpx.Client(timeout=10, follow_redirects=False)


class SSOError(Exception):
    """A login failure safe to show to the user."""


@dataclass
class Provider:
    name: str
    label: str
    client_id: str
    client_secret: str
    discovery_url: str
    scope: str = "openid email profile"
    # Microsoft multi-tenant discovery docs use "{tenantid}" in the issuer.
    issuer_has_tenant_placeholder: bool = False
    trust_email: bool = False  # provider-level guarantee that emails are verified


def configured_providers() -> dict[str, Provider]:
    providers = {}
    if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET:
        providers["google"] = Provider(
            name="google",
            label="Google",
            client_id=GOOGLE_CLIENT_ID,
            client_secret=GOOGLE_CLIENT_SECRET,
            discovery_url="https://accounts.google.com/.well-known/openid-configuration",
        )
    if MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET:
        tenant = MICROSOFT_TENANT or "organizations"
        providers["microsoft"] = Provider(
            name="microsoft",
            label="Microsoft",
            client_id=MICROSOFT_CLIENT_ID,
            client_secret=MICROSOFT_CLIENT_SECRET,
            discovery_url=f"https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration",
            issuer_has_tenant_placeholder=tenant in MULTI_TENANT,
            # In a single-tenant app the org's admins control every email.
            trust_email=tenant not in MULTI_TENANT,
        )
    return providers


PROVIDERS: dict[str, Provider] = configured_providers()


def get_provider(name: str) -> Provider:
    p = PROVIDERS.get(name)
    if p is None:
        raise HTTPException(status_code=404, detail="Unknown or unconfigured sign-in provider")
    return p


def redirect_uri(provider: Provider) -> str:
    return f"{APP_BASE_URL}/api/auth/sso/{provider.name}/callback"


# ── Provider metadata (cached) ───────────────────────────────────────────

_discovery_cache: dict[str, tuple[float, dict]] = {}
_jwks_cache: dict[str, tuple[float, jwt.PyJWKSet]] = {}


def _discovery(provider: Provider) -> dict:
    hit = _discovery_cache.get(provider.discovery_url)
    if hit and hit[0] > time.time():
        return hit[1]
    r = http.get(provider.discovery_url)
    r.raise_for_status()
    doc = r.json()
    _discovery_cache[provider.discovery_url] = (time.time() + DISCOVERY_TTL_SECONDS, doc)
    return doc


def _signing_key(jwks_uri: str, kid: str | None, refresh: bool = False):
    hit = _jwks_cache.get(jwks_uri)
    if refresh or not hit or hit[0] < time.time():
        r = http.get(jwks_uri)
        r.raise_for_status()
        hit = (time.time() + DISCOVERY_TTL_SECONDS, jwt.PyJWKSet.from_dict(r.json()))
        _jwks_cache[jwks_uri] = hit
    for key in hit[1].keys:
        if key.key_id == kid:
            return key
    if not refresh:  # the provider may have rotated keys since we cached them
        return _signing_key(jwks_uri, kid, refresh=True)
    raise SSOError("The sign-in provider's signing key wasn't recognised.")


# ── Signed state cookie ──────────────────────────────────────────────────

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _sign(payload: dict) -> str:
    body = _b64(json.dumps(payload).encode())
    sig = _b64(hmac.new(SECRET, f"sso.{body}".encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def _unsign(value: str | None) -> dict | None:
    try:
        body, sig = (value or "").split(".")
        expected = _b64(hmac.new(SECRET, f"sso.{body}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        data = json.loads(_unb64(body))
        return data if data.get("exp", 0) > time.time() else None
    except Exception:
        return None


# ── Flow ─────────────────────────────────────────────────────────────────

def start(provider: Provider) -> tuple[str, str]:
    """Return (provider authorize URL, signed state cookie value)."""
    state = secrets.token_urlsafe(24)
    nonce = secrets.token_urlsafe(24)
    verifier = secrets.token_urlsafe(48)
    challenge = _b64(hashlib.sha256(verifier.encode()).digest())
    params = {
        "client_id": provider.client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri(provider),
        "scope": provider.scope,
        "state": state,
        "nonce": nonce,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    url = f"{_discovery(provider)['authorization_endpoint']}?{urlencode(params)}"
    cookie = _sign({
        "p": provider.name, "state": state, "nonce": nonce, "verifier": verifier,
        "exp": int(time.time()) + STATE_TTL_SECONDS,
    })
    return url, cookie


def finish(provider: Provider, code: str | None, state: str | None, cookie: str | None) -> dict:
    """Validate the callback and return verified claims."""
    saved = _unsign(cookie)
    if not saved or saved.get("p") != provider.name or not state \
            or not hmac.compare_digest(saved["state"], state):
        raise SSOError("Your sign-in session expired. Please try again.")
    if not code:
        raise SSOError("The sign-in provider didn't return an authorization code.")

    meta = _discovery(provider)
    r = http.post(meta["token_endpoint"], data={
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri(provider),
        "client_id": provider.client_id,
        "client_secret": provider.client_secret,
        "code_verifier": saved["verifier"],
    }, headers={"Accept": "application/json"})
    if r.status_code != 200:
        print(f"[sso] {provider.name} token exchange failed: {r.status_code} {r.text[:300]}")
        raise SSOError("The sign-in provider rejected the login. Please try again.")
    id_token = r.json().get("id_token")
    if not id_token:
        raise SSOError("The sign-in provider didn't return an identity token.")
    return _verify_id_token(provider, meta, id_token, saved["nonce"])


def _verify_id_token(provider: Provider, meta: dict, id_token: str, nonce: str) -> dict:
    try:
        header = jwt.get_unverified_header(id_token)
        key = _signing_key(meta["jwks_uri"], header.get("kid"))
        claims = jwt.decode(
            id_token,
            key.key,
            algorithms=["RS256"],  # what Google and Entra sign with; never accept "none"/HS*
            audience=provider.client_id,
            options={"require": ["exp", "iat", "iss", "sub", "aud"], "verify_iss": False},
            leeway=60,
        )
    except SSOError:
        raise
    except jwt.PyJWTError as e:
        print(f"[sso] {provider.name} id_token rejected: {e}")
        raise SSOError("The sign-in response couldn't be verified.") from e

    expected_iss = meta["issuer"]
    if provider.issuer_has_tenant_placeholder:
        expected_iss = expected_iss.replace("{tenantid}", str(claims.get("tid", "")))
    if claims.get("iss") != expected_iss:
        raise SSOError("The sign-in response came from an unexpected issuer.")
    if not hmac.compare_digest(str(claims.get("nonce", "")), nonce):
        raise SSOError("The sign-in response didn't match this login attempt.")
    return claims


def _verified_email(provider: Provider, claims: dict) -> str | None:
    if provider.name == "google":
        email = claims.get("email")
        return email.lower() if email and claims.get("email_verified") is True else None
    # Microsoft: "email" is optional and admin-editable; fall back to the UPN.
    email = claims.get("email") or claims.get("preferred_username")
    if email and "@" in email and (provider.trust_email or claims.get("xms_edov") is True):
        return email.lower()
    return None


def resolve_user(provider: Provider, claims: dict) -> tuple[str, str]:
    """Map verified claims to a user id. Returns (user_id, how) for auditing."""
    sub = str(claims["sub"])
    email = _verified_email(provider, claims)

    if SSO_ALLOWED_DOMAINS:
        domain = email.rsplit("@", 1)[-1] if email else None
        if domain not in SSO_ALLOWED_DOMAINS:
            raise SSOError("This account isn't allowed to sign in. Use your work account.")

    with session_scope() as s:
        identity = s.scalar(select(UserIdentity).where(
            UserIdentity.provider == provider.name, UserIdentity.subject == sub))
        if identity is not None:
            identity.last_login_at = utcnow()
            if email:
                identity.email = email
            return identity.user_id, "existing"

        if email is None:
            raise SSOError(
                f"{provider.label} didn't confirm this account's email address, so it can't be "
                "linked. Ask your administrator to configure single-tenant sign-in."
            )

        user = s.scalar(select(User).where(User.email == email))
        how = "linked"
        if user is None:
            if not SSO_AUTO_SIGNUP:
                raise SSOError("No DocuMind account exists for this email. Ask an administrator to invite you.")
            user = User(
                id=uuid.uuid4().hex[:12],
                name=(claims.get("name") or email.split("@")[0])[:200],
                email=email,
                password_hash=None,  # SSO-only until they set one via password reset
                role="Staff",
                departments=["General"],
                can_upload=False,
                token_version=0,
            )
            s.add(user)
            s.flush()
            how = "created"
        s.add(UserIdentity(user_id=user.id, provider=provider.name, subject=sub,
                           email=email, last_login_at=utcnow()))
        return user.id, how
