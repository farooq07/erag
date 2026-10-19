"""Shared helpers for API tests."""
import json

DEMO_PASSWORD = "Demo123!"
ADMIN = ("admin@acme.com", "Admin123!")
HR = ("hr@acme.com", DEMO_PASSWORD)
FINANCE = ("finance@acme.com", DEMO_PASSWORD)
IT = ("it@acme.com", DEMO_PASSWORD)


def login(client, email: str, password: str) -> str:
    """Log in through the API and return the access token."""
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def read_sse(response) -> list[dict]:
    """Parse a text/event-stream body into its JSON events."""
    return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]


def chat(client, token: str, question: str, **body) -> list[dict]:
    r = client.post("/api/chat", headers=auth(token), json={"question": question, **body})
    assert r.status_code == 200, r.text
    return read_sse(r)
