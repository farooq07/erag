"""
Smoke test for a running DocuMind deployment.

    python scripts/smoke_test.py http://localhost:8000 [--email admin@acme.com --password Admin123!]

Checks, in order: the database is reachable (/readyz), the homepage is
served, an admin can sign in, and the documents API answers. Exits 0 and
prints "OK" on success; otherwise prints the failing step and exits 1.
"""
import argparse
import sys
import time

import httpx


def wait_ready(base: str, timeout_s: float) -> None:
    deadline = time.time() + timeout_s
    last = "no response"
    while time.time() < deadline:
        try:
            r = httpx.get(f"{base}/readyz", timeout=5)
            if r.status_code == 200:
                return
            last = f"HTTP {r.status_code}: {r.text[:200]}"
        except httpx.HTTPError as e:
            last = repr(e)
        time.sleep(2)
    raise SystemExit(f"FAIL readyz: not ready after {timeout_s:.0f}s ({last})")


def check(step: str, ok: bool, detail: str = "") -> None:
    if not ok:
        raise SystemExit(f"FAIL {step}: {detail}")
    print(f"  ok  {step}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("base_url")
    ap.add_argument("--email", default="admin@acme.com")
    ap.add_argument("--password", default="Admin123!")
    ap.add_argument("--timeout", type=float, default=180)
    args = ap.parse_args()
    base = args.base_url.rstrip("/")

    wait_ready(base, args.timeout)
    print("  ok  readyz")

    home = httpx.get(f"{base}/", timeout=10)
    check("homepage", home.status_code == 200 and '<div id="root">' in home.text, f"HTTP {home.status_code}")

    login = httpx.post(f"{base}/api/auth/login", json={"email": args.email, "password": args.password}, timeout=10)
    check("login", login.status_code == 200, f"HTTP {login.status_code}: {login.text[:200]}")
    token = login.json()["access_token"]

    docs = httpx.get(f"{base}/api/documents", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    check("documents", docs.status_code == 200, f"HTTP {docs.status_code}: {docs.text[:200]}")

    print("OK")


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if e.code not in (0, None):
            print(e.code, file=sys.stderr)
            sys.exit(1)
        raise
