"""
End-to-end SSO tests against a fake OpenID provider.

The provider's HTTP endpoints (discovery, JWKS, token) are served by an
httpx MockTransport, and ID tokens are signed with a throwaway RSA key, so the
real verification code paths run without network access or real credentials.
"""
import time
import uuid
from urllib.parse import parse_qs, urlparse

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import select

import sso
from auth import hash_password
from db import User, UserIdentity, session_scope

ISSUER = "https://idp.test"
CLIENT_ID = "test-client-id"


def _rsa_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


SIGNING_KEY = _rsa_key()
OTHER_KEY = _rsa_key()  # not published in the JWKS


class FakeIdP:
    """Holds what the next token response should contain."""

    def __init__(self, issuer=ISSUER):
        self.issuer = issuer
        self.claims = {}
        self.nonce = None
        self.sign_with = SIGNING_KEY
        self.token_status = 200

    def jwks(self):
        jwk = jwt.algorithms.RSAAlgorithm.to_jwk(SIGNING_KEY.public_key(), as_dict=True)
        jwk.update(kid="k1", use="sig", alg="RS256")
        return {"keys": [jwk]}

    def id_token(self):
        now = int(time.time())
        claims = {"iss": self.issuer, "aud": CLIENT_ID, "iat": now, "exp": now + 300, "nonce": self.nonce}
        claims.update(self.claims)
        return jwt.encode(claims, self.sign_with, algorithm="RS256", headers={"kid": "k1"})

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/.well-known/openid-configuration"):
            return httpx.Response(200, json={
                "issuer": self.issuer,
                "authorization_endpoint": "https://idp.test/authorize",
                "token_endpoint": "https://idp.test/token",
                "jwks_uri": "https://idp.test/jwks",
            })
        if path == "/jwks":
            return httpx.Response(200, json=self.jwks())
        if path == "/token":
            if self.token_status != 200:
                return httpx.Response(self.token_status, json={"error": "invalid_grant"})
            return httpx.Response(200, json={"id_token": self.id_token(), "access_token": "x"})
        return httpx.Response(404)


@pytest.fixture()
def idp(monkeypatch):
    fake = FakeIdP()
    monkeypatch.setattr(sso, "http", httpx.Client(transport=httpx.MockTransport(fake.handler)))
    monkeypatch.setattr(sso, "PROVIDERS", {
        "google": sso.Provider(
            name="google", label="Google", client_id=CLIENT_ID, client_secret="s",
            discovery_url=f"{ISSUER}/.well-known/openid-configuration",
        ),
    })
    sso._discovery_cache.clear()
    sso._jwks_cache.clear()
    return fake


def _start(client, provider="google"):
    r = client.get(f"/api/auth/sso/{provider}/start")
    assert r.status_code == 302
    params = parse_qs(urlparse(r.headers["location"]).query)
    return params


def login(client, idp, provider="google", state_override=None):
    """Run start → callback; return the callback response."""
    params = _start(client, provider)
    assert params["code_challenge_method"] == ["S256"]
    idp.nonce = params["nonce"][0]
    state = state_override or params["state"][0]
    return client.get(f"/api/auth/sso/{provider}/callback", params={"code": "abc", "state": state})


def google_claims(email, sub=None, verified=True, name="Sso Person"):
    return {"sub": sub or uuid.uuid4().hex, "email": email, "email_verified": verified, "name": name}


def sso_error(response):
    assert response.status_code == 302
    qs = parse_qs(urlparse(response.headers["location"]).query)
    return qs.get("sso_error", [None])[0]


def refreshed_user(client):
    r = client.post("/api/auth/refresh")
    assert r.status_code == 200, r.text
    return r.json()["user"]


# ── Tests ────────────────────────────────────────────────────────────────

def test_providers_lists_configured(client, idp):
    assert client.get("/api/auth/sso/providers").json() == {"providers": [{"id": "google", "label": "Google"}]}


def test_unknown_provider_404(client, idp):
    assert client.get("/api/auth/sso/github/start").status_code == 404


def test_first_login_creates_user_and_session(client, idp):
    idp.claims = google_claims("new.person@corp.test", sub="g-new")
    r = login(client, idp)
    assert r.status_code == 302 and r.headers["location"] == "/"
    assert "dm_refresh=" in r.headers.get("set-cookie", "")

    user = refreshed_user(client)
    assert user["email"] == "new.person@corp.test"
    assert user["role"] == "Staff" and user["departments"] == ["General"]
    with session_scope() as s:
        ident = s.scalar(select(UserIdentity).where(UserIdentity.subject == "g-new"))
        assert ident.user_id == user["id"]
        assert s.get(User, user["id"]).password_hash is None


def test_repeat_login_reuses_identity(client, idp):
    idp.claims = google_claims("repeat@corp.test", sub="g-repeat")
    login(client, idp)
    first = refreshed_user(client)
    client.cookies.clear()
    idp.claims = google_claims("repeat@corp.test", sub="g-repeat")
    login(client, idp)
    assert refreshed_user(client)["id"] == first["id"]


def test_links_existing_password_account_by_verified_email(client, idp):
    with session_scope() as s:
        s.add(User(id="pw-user", name="Pw", email="pw.user@corp.test",
                   password_hash=hash_password("Whatever123"), role="HR Manager",
                   departments=["HR", "General"], can_upload=True))
    idp.claims = google_claims("PW.User@corp.test", sub="g-pw")
    login(client, idp)
    user = refreshed_user(client)
    assert user["id"] == "pw-user" and user["role"] == "HR Manager"  # linked, not duplicated


def test_unverified_email_is_refused(client, idp):
    idp.claims = google_claims("victim@corp.test", verified=False)
    msg = sso_error(login(client, idp))
    assert "didn't confirm" in msg
    with session_scope() as s:
        assert s.scalar(select(User).where(User.email == "victim@corp.test")) is None


def test_state_mismatch_is_refused(client, idp):
    idp.claims = google_claims("state@corp.test")
    assert "expired" in sso_error(login(client, idp, state_override="forged-state"))


def test_missing_state_cookie_is_refused(client, idp):
    params = _start(client)
    client.cookies.clear()  # e.g. a callback replayed in another browser
    idp.nonce = params["nonce"][0]
    r = client.get("/api/auth/sso/google/callback", params={"code": "abc", "state": params["state"][0]})
    assert "expired" in sso_error(r)


def test_token_signed_by_unknown_key_is_refused(client, idp):
    idp.claims = google_claims("forged@corp.test")
    idp.sign_with = OTHER_KEY
    assert sso_error(login(client, idp))  # signature check fails


def test_wrong_audience_is_refused(client, idp):
    idp.claims = {**google_claims("aud@corp.test"), "aud": "someone-elses-client"}
    assert "couldn't be verified" in sso_error(login(client, idp))


def test_wrong_issuer_is_refused(client, idp):
    idp.claims = {**google_claims("iss@corp.test"), "iss": "https://evil.test"}
    assert "unexpected issuer" in sso_error(login(client, idp))


def test_nonce_mismatch_is_refused(client, idp):
    idp.claims = {**google_claims("nonce@corp.test"), "nonce": "replayed-nonce"}
    assert "didn't match" in sso_error(login(client, idp))


def test_provider_rejecting_code(client, idp):
    idp.claims = google_claims("rejected@corp.test")
    idp.token_status = 400
    assert "rejected" in sso_error(login(client, idp))


def test_user_cancelled(client, idp):
    _start(client)
    r = client.get("/api/auth/sso/google/callback", params={"error": "access_denied"})
    assert "cancelled" in sso_error(r)


def test_allowed_domains(client, idp, monkeypatch):
    monkeypatch.setattr(sso, "SSO_ALLOWED_DOMAINS", {"corp.test"})
    idp.claims = google_claims("outsider@gmail.test")
    assert "isn't allowed" in sso_error(login(client, idp))
    client.cookies.clear()
    idp.claims = google_claims("insider@corp.test")
    login(client, idp)
    assert refreshed_user(client)["email"] == "insider@corp.test"


def test_auto_signup_disabled(client, idp, monkeypatch):
    monkeypatch.setattr(sso, "SSO_AUTO_SIGNUP", False)
    idp.claims = google_claims("uninvited@corp.test")
    assert "invite" in sso_error(login(client, idp))


# ── Microsoft multi-tenant specifics ─────────────────────────────────────

@pytest.fixture()
def ms_idp(monkeypatch):
    fake = FakeIdP(issuer="https://login.test/{tenantid}/v2.0")
    monkeypatch.setattr(sso, "http", httpx.Client(transport=httpx.MockTransport(fake.handler)))
    monkeypatch.setattr(sso, "PROVIDERS", {
        "microsoft": sso.Provider(
            name="microsoft", label="Microsoft", client_id=CLIENT_ID, client_secret="s",
            discovery_url=f"{ISSUER}/organizations/v2.0/.well-known/openid-configuration",
            issuer_has_tenant_placeholder=True, trust_email=False,
        ),
    })
    sso._discovery_cache.clear()
    sso._jwks_cache.clear()
    return fake


def _ms_claims(email, tid="tenant-a", **extra):
    return {"sub": uuid.uuid4().hex, "tid": tid, "iss": f"https://login.test/{tid}/v2.0",
            "preferred_username": email, "name": "Ms Person", **extra}


def test_microsoft_multitenant_unverified_email_refused(client, ms_idp):
    # Any tenant admin can set any UPN/email, so it must not be trusted.
    ms_idp.claims = _ms_claims("ceo@corp.test")
    assert "didn't confirm" in sso_error(login(client, ms_idp, provider="microsoft"))


def test_microsoft_domain_verified_claim_accepted(client, ms_idp):
    ms_idp.claims = _ms_claims("ms.user@corp.test", xms_edov=True)
    login(client, ms_idp, provider="microsoft")
    assert refreshed_user(client)["email"] == "ms.user@corp.test"


def test_microsoft_issuer_must_match_token_tenant(client, ms_idp):
    ms_idp.claims = {**_ms_claims("x@corp.test", xms_edov=True), "iss": "https://login.test/other-tenant/v2.0"}
    assert "unexpected issuer" in sso_error(login(client, ms_idp, provider="microsoft"))


# ── State cookie integrity ───────────────────────────────────────────────

def test_state_cookie_tampering_detected():
    cookie = sso._sign({"p": "google", "state": "s", "nonce": "n", "verifier": "v", "exp": time.time() + 60})
    assert sso._unsign(cookie)["state"] == "s"
    body, sig = cookie.split(".")
    assert sso._unsign(f"{body}x.{sig}") is None
    expired = sso._sign({"p": "google", "state": "s", "exp": time.time() - 1})
    assert sso._unsign(expired) is None
