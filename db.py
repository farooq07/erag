"""
Database layer: SQLAlchemy 2.0 models + session helpers.

DATABASE_URL picks the backend:
  sqlite:///data/documind.db              (default, zero-setup local dev)
  postgresql+psycopg://user:pw@host/db    (Docker / production)

Schema changes go through Alembic (migrations/), applied on startup by
run_migrations().
"""
import json
from contextlib import contextmanager
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text, create_engine, event, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from config import AUDIT_LOG_PATH, DATABASE_URL, ROOT, USERS_FILE


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


_is_sqlite = DATABASE_URL.startswith("sqlite")
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"check_same_thread": False, "timeout": 30} if _is_sqlite else {},
)

if _is_sqlite:
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(conn, _):
        cur = conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")   # readers don't block the ingest worker
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


@contextmanager
def session_scope():
    s = SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


# ── Models ───────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(64), default="Staff")
    departments: Mapped[list] = mapped_column(JSON, default=list)
    can_upload: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    def public(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "departments": list(self.departments or []),
            "can_upload": bool(self.can_upload),
        }


class Document(Base):
    __tablename__ = "documents"

    name: Mapped[str] = mapped_column(String(512), primary_key=True)
    hash: Mapped[str] = mapped_column(String(64), default="")
    department: Mapped[str] = mapped_column(String(64), index=True)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    # queued → processing → ready | failed
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    error: Mapped[str | None] = mapped_column(Text)
    chunks: Mapped[int] = mapped_column(Integer, default=0)
    size: Mapped[int] = mapped_column(Integer, default=0)
    ocr: Mapped[bool] = mapped_column(Boolean, default=False)
    uploaded_by: Mapped[str | None] = mapped_column(String(64))
    uploaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "department": self.department,
            "tags": list(self.tags or []),
            "status": self.status,
            "error": self.error,
            "uploaded_at": _iso(self.uploaded_at),
            "chunks": self.chunks,
            "size": self.size,
        }


class IngestJob(Base):
    __tablename__ = "ingest_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_name: Mapped[str] = mapped_column(String(512), index=True)
    department: Mapped[str] = mapped_column(String(64))
    tags: Mapped[list] = mapped_column(JSON, default=list)
    # queued → processing → done | failed
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    event: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[str | None] = mapped_column(String(64), index=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:  # SQLite drops tzinfo; values are stored as UTC
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat(timespec="seconds").replace("+00:00", "Z")


def _parse_ts(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


# ── Startup: migrations + one-time import of the legacy JSON stores ──────

def run_migrations() -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "migrations"))
    command.upgrade(cfg, "head")


def import_legacy_data(hash_index_path) -> None:
    """Copy users.json / _ingested.json / audit.jsonl into the DB once.

    Each store is imported only while its table is empty, so this is safe
    to run on every startup. The legacy files are left in place.
    """
    with session_scope() as s:
        if s.scalar(select(User).limit(1)) is None and USERS_FILE.exists():
            for u in json.loads(USERS_FILE.read_text()).get("users", []):
                s.add(User(
                    id=u["id"],
                    name=u.get("name", u["id"]),
                    email=u.get("email", f"{u['id']}@local").lower(),
                    password_hash=u.get("password_hash"),
                    role=u.get("role", "Staff"),
                    departments=u.get("departments", []),
                    can_upload=u.get("can_upload", False),
                ))
            print("[db] imported users.json")

        if s.scalar(select(Document).limit(1)) is None and hash_index_path.exists():
            for name, meta in json.loads(hash_index_path.read_text()).items():
                if isinstance(meta, str):
                    meta = {"hash": meta}
                s.add(Document(
                    name=name,
                    hash=meta.get("hash", ""),
                    department=meta.get("department", "General"),
                    tags=meta.get("tags", []),
                    status="ready",
                    chunks=meta.get("chunks", 0),
                    size=meta.get("size", 0),
                    uploaded_at=_parse_ts(meta.get("uploaded_at")),
                ))
            print("[db] imported document index")

        if s.scalar(select(AuditEvent).limit(1)) is None and AUDIT_LOG_PATH.exists():
            with open(AUDIT_LOG_PATH) as f:
                for line in f:
                    try:
                        e = json.loads(line)
                    except ValueError:
                        continue
                    s.add(AuditEvent(
                        ts=_parse_ts(e.pop("ts", None)) or utcnow(),
                        event=e.pop("event", "unknown"),
                        user_id=e.pop("user", None),
                        data=e,
                    ))
            print("[db] imported audit.jsonl")
