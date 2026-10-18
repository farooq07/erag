"""
Test setup: every run gets a throwaway data directory and SQLite database,
so tests never touch data/ or the real users. Environment must be set before
any app module is imported, because config.py reads it at import time.
"""
import os
import shutil
import sys
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="documind-test-"))
os.environ["DOCUMIND_DATA_DIR"] = str(_TMP / "data")
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["INGEST_WORKER_ENABLED"] = "false"   # no embedding work in API tests
os.environ["JWT_SECRET"] = "test-secret-not-for-production"
os.environ["APP_BASE_URL"] = "http://testserver"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def app():
    import main

    main.limiter.enabled = False  # tests make many requests from one "IP"
    return main.app


@pytest.fixture()
def client(app):
    with TestClient(app, follow_redirects=False) as c:
        yield c


def pytest_sessionfinish(session, exitstatus):
    from db import engine

    engine.dispose()
    shutil.rmtree(_TMP, ignore_errors=True)
