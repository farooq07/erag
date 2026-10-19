"""
API tests that pin the Phase 0 security fixes and the core flows
(uploads, background indexing, chat streaming). No network model calls:
conftest sets LLM_PROVIDER=fake.
"""
import pytest

import jobs
import main
from config import UPLOADS_DIR
from tests.helpers import ADMIN, FINANCE, HR, IT, auth, chat, login


@pytest.mark.parametrize("method,path,body", [
    ("get", "/api/departments", None),
    ("get", "/api/documents", None),
    ("get", "/api/stats", None),
    ("get", "/api/users", None),
    ("get", "/api/files/HR_Leave_Policy.md", None),
    ("post", "/api/chat", {"question": "hi"}),
])
def test_protected_routes_require_token(client, method, path, body):
    r = getattr(client, method)(path, json=body) if body else getattr(client, method)(path)
    assert r.status_code == 401


def test_x_user_header_is_ignored(client):
    assert client.get("/api/departments", headers={"X-User": "admin"}).status_code == 401


def test_users_admin_only(client):
    assert client.get("/api/users", headers=auth(login(client, *HR))).status_code == 403
    r = client.get("/api/users", headers=auth(login(client, *ADMIN)))
    assert r.status_code == 200 and len(r.json()["users"]) >= 7


def test_stats_scoped_to_departments(client, indexed_demo):
    stats = client.get("/api/stats", headers=auth(login(client, *HR))).json()
    assert set(stats["departments"]) <= {"HR", "General"}


def test_file_download_enforces_department(client, indexed_demo):
    h = auth(login(client, *HR))
    assert client.get("/api/files/HR_Leave_Policy.md", headers=h).status_code == 200
    assert client.get("/api/files/Finance_Q3_2024_Report.md", headers=h).status_code == 403


def test_upload_sanitises_names_and_types(client, indexed_demo, monkeypatch):
    h = auth(login(client, *ADMIN))
    r = client.post("/api/upload", headers=h, data={"department": "General"},
                    files={"files": ("../../evil.md", b"# Evil\n\nJust text.", "text/markdown")})
    assert r.status_code == 200, r.text
    assert (UPLOADS_DIR / "evil.md").is_file()
    assert not (UPLOADS_DIR.parent.parent / "evil.md").exists()
    client.delete("/api/documents/evil.md", headers=h)

    r = client.post("/api/upload", headers=h, data={"department": "General"},
                    files={"files": ("tool.exe", b"MZ", "application/octet-stream")})
    assert r.status_code == 400

    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 10)
    r = client.post("/api/upload", headers=h, data={"department": "General"},
                    files={"files": ("big.md", b"x" * 20, "text/markdown")})
    assert r.status_code == 413
    assert not (UPLOADS_DIR / "big.md").exists()


def test_upload_cannot_overwrite_other_department(client, indexed_demo):
    r = client.post("/api/upload", headers=auth(login(client, *IT)), data={"department": "IT"},
                    files={"files": ("HR_Leave_Policy.md", b"# Replaced", "text/markdown")})
    assert r.status_code == 409


def test_upload_queues_then_worker_indexes(client, indexed_demo):
    h = auth(login(client, *ADMIN))
    body = b"# Parking Policy\n\n## 1. Spaces\n\nStaff parking has 40 spaces, booked via the Desk Booking app."
    r = client.post("/api/upload", headers=h, data={"department": "Operations", "tags": "parking"},
                    files={"files": ("Parking_Policy.md", body, "text/markdown")})
    assert r.status_code == 200
    doc = next(d for d in r.json()["documents"] if d["name"] == "Parking_Policy.md")
    assert doc["status"] == "queued"

    while jobs.run_one():
        pass
    doc = next(d for d in client.get("/api/documents", headers=h).json()["documents"]
               if d["name"] == "Parking_Policy.md")
    assert doc["status"] == "ready" and doc["chunks"] > 0 and doc["tags"] == ["parking"]
    client.delete("/api/documents/Parking_Policy.md", headers=h)


def test_chat_streams_sources_tokens_done(client, indexed_demo):
    events = chat(client, login(client, *ADMIN), "How many days of annual leave do full-time employees get?",
                  check_grounding=False)
    types = [e["type"] for e in events]
    assert types[0] == "sources" and "token" in types and types[-1] == "done"
    assert "HR_Leave_Policy.md" in {s["source"] for s in events[0]["sources"]}


def test_chat_respects_scope(client, indexed_demo):
    events = chat(client, login(client, *HR), "What was total revenue in Q3 2024?", check_grounding=False)
    sources = events[0]["sources"]
    assert all(s["department"] in ("HR", "General") for s in sources)


def test_chat_rate_limit_message(client, indexed_demo, monkeypatch):
    class Throttled(Exception):
        status_code = 429

    def boom(*args, **kwargs):
        raise Throttled("Rate limit reached ... Please try again in 3m6.6s. Need more tokens?")
        yield  # pragma: no cover

    monkeypatch.setattr(main, "generate_answer_stream", boom)
    events = chat(client, login(client, *FINANCE), "What was total revenue in Q3 2024?", check_grounding=False)
    errors = [e for e in events if e["type"] == "error"]
    assert errors and "usage limit" in errors[0]["message"] and "3 minutes" in errors[0]["message"]


def test_login_lockout_after_five_failures(client):
    r = client.post("/api/auth/signup", json={"name": "Lock Test", "email": "lock@example.com",
                                              "password": "Correct-horse1"})
    assert r.status_code == 200
    codes = [client.post("/api/auth/login", json={"email": "lock@example.com", "password": "wrong-pass"}).status_code
             for _ in range(5)]
    assert codes[:4] == [401] * 4 and codes[4] == 429
    r = client.post("/api/auth/login", json={"email": "lock@example.com", "password": "Correct-horse1"})
    assert r.status_code == 429
