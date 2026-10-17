"""
Background ingestion: a small job queue stored in the ingest_jobs table.

Uploads call enqueue() and return immediately; a worker thread claims queued
jobs one at a time and runs ingest_paths(). Using the database instead of
Redis keeps local dev dependency-free, and the claim is a conditional UPDATE,
so several workers (API processes or `python -m jobs`) can share one queue.

Document status shown in the UI: queued → processing → ready | failed.
"""
import threading
import time

from sqlalchemy import select, update

from config import INGEST_MAX_ATTEMPTS, UPLOADS_DIR
from db import Document, IngestJob, session_scope, utcnow
from ingest import ingest_paths

POLL_SECONDS = 1.0


def enqueue(name: str, department: str, tags: list[str], user_id: str | None) -> None:
    with session_scope() as s:
        doc = s.get(Document, name)
        if doc is None:
            s.add(Document(
                name=name,
                department=department,
                tags=tags,
                status="queued",
                uploaded_by=user_id,
                uploaded_at=utcnow(),
            ))
        else:
            # Keep the stored department/tags until the job runs, so
            # ingest_paths can tell whether anything actually changed.
            doc.status = "queued"
            doc.error = None
        s.add(IngestJob(document_name=name, department=department, tags=tags, created_by=user_id))


def recover_stale_jobs() -> None:
    """Re-queue jobs left 'processing' by a crashed or killed worker.

    Runs when a worker starts, so start workers one at a time; a worker that
    starts while another is mid-job would re-queue that job (it is then
    ingested twice, which is harmless but wasteful).
    """
    with session_scope() as s:
        s.execute(
            update(IngestJob)
            .where(IngestJob.status == "processing")
            .values(status="queued", started_at=None)
        )


def _claim_next() -> IngestJob | None:
    with session_scope() as s:
        job = s.scalar(
            select(IngestJob).where(IngestJob.status == "queued").order_by(IngestJob.id).limit(1)
        )
        if job is None:
            return None
        claimed = s.execute(
            update(IngestJob)
            .where(IngestJob.id == job.id, IngestJob.status == "queued")
            .values(status="processing", started_at=utcnow(), attempts=IngestJob.attempts + 1)
        ).rowcount
        if not claimed:  # another worker got it first
            return None
        doc = s.get(Document, job.document_name)
        if doc:
            doc.status = "processing"
        s.refresh(job)
        return job


def _finish(job: IngestJob, ok: bool, error: str | None) -> None:
    with session_scope() as s:
        row = s.get(IngestJob, job.id)
        if ok or row.attempts >= INGEST_MAX_ATTEMPTS:
            row.status = "done" if ok else "failed"
            row.finished_at = utcnow()
        else:
            row.status = "queued"  # retry
        row.error = error
        if not ok and row.status == "queued":
            doc = s.get(Document, job.document_name)
            if doc:
                doc.status = "queued"


def run_one() -> bool:
    """Process a single queued job. Returns False when the queue is empty."""
    job = _claim_next()
    if job is None:
        return False
    path = UPLOADS_DIR / job.document_name
    if not path.is_file():  # retrying can't help, fail immediately
        with session_scope() as s:
            row = s.get(IngestJob, job.id)
            row.status, row.error, row.finished_at = "failed", "file missing from storage", utcnow()
            doc = s.get(Document, job.document_name)
            if doc:
                doc.status, doc.error = "failed", "file missing from storage"
        return True
    try:
        stats = ingest_paths([path], department=job.department, tags=list(job.tags or []),
                             uploaded_by=job.created_by)
        error = "; ".join(stats["failed"]) or None
        _finish(job, error is None, error)
    except Exception as e:  # ingest_paths catches per-file errors; this is a safety net
        _finish(job, False, repr(e)[:1000])
    return True


class Worker:
    def __init__(self):
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        recover_stale_jobs()
        self._thread = threading.Thread(target=self._loop, name="ingest-worker", daemon=True)
        self._thread.start()

    def stop(self, timeout: float = 10) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout)

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                if not run_one():
                    self._stop.wait(POLL_SECONDS)
            except Exception as e:
                print(f"[ingest-worker] error: {e!r}")
                self._stop.wait(POLL_SECONDS * 5)


if __name__ == "__main__":
    # Standalone worker: `python -m jobs` (set INGEST_WORKER_ENABLED=false on the API).
    from db import run_migrations

    run_migrations()
    recover_stale_jobs()
    print("[ingest-worker] started")
    while True:
        if not run_one():
            time.sleep(POLL_SECONDS)
