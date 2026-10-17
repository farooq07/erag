import asyncio
import json
import shutil
from contextlib import asynccontextmanager
from datetime import datetime, time, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import func, select, text
from starlette.middleware.base import BaseHTTPMiddleware

from auth import (
    allowed_departments,
    assert_can_access,
    assert_can_upload,
    bearer_scheme,
    do_login,
    do_signup,
    get_current_user,
    list_users,
    require_admin,
    user_from_token,
)
from config import (
    ALLOWED_MODELS,
    ALLOWED_ORIGINS,
    DEFAULT_DEPARTMENT,
    DEMO_CORPUS,
    DEMO_DIR,
    DEPARTMENTS,
    GROUNDING_CHECK_ENABLED,
    GROQ_MODEL,
    INGEST_WORKER_ENABLED,
    LLM_MODEL,
    LLM_PROVIDER,
    MAX_HISTORY_TURNS,
    MAX_QUESTION_CHARS,
    MAX_UPLOAD_BYTES,
    SUPPORTED_EXTS,
    UPLOADS_DIR,
)
from db import AuditEvent, Document, import_legacy_data, run_migrations, session_scope
from ingest import (
    HASH_INDEX,
    clear_all,
    get_document,
    list_indexed,
    remove_document,
    update_document_meta,
)
from jobs import Worker, enqueue
from rag import answer_stream, check_answer_grounding, generate_doc_summary, retrieve

DEFAULT_MODEL = GROQ_MODEL if LLM_PROVIDER == "groq" else LLM_MODEL

# ── Rate limiter ─────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=[])


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    import_legacy_data(HASH_INDEX)
    seed_demo_corpus()
    worker = Worker() if INGEST_WORKER_ENABLED else None
    if worker:
        worker.start()
    yield
    if worker:
        worker.stop()


app = FastAPI(title="DocuMind API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


# ── Strip /api prefix so the built React SPA can proxy via relative URLs ─
class _StripApiPrefix(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.scope.get("path", "").startswith("/api/"):
            request.scope["path"] = request.scope["path"][4:]
            request.scope["raw_path"] = request.scope["path"].encode()
        return await call_next(request)


app.add_middleware(_StripApiPrefix)


# ── Audit log ────────────────────────────────────────────────────────────

def _audit(event: str, user_id, extra=None):
    try:
        with session_scope() as s:
            s.add(AuditEvent(event=event, user_id=user_id, data=extra or {}))
    except Exception as e:
        print(f"[audit] failed to record {event}: {e!r}")


# ── Demo corpus auto-ingest on startup ───────────────────────────────────

def seed_demo_corpus():
    with session_scope() as s:
        if s.scalar(select(Document).limit(1)) is not None:
            return

    for filename, dept in DEMO_CORPUS:
        src = DEMO_DIR / filename
        if not src.exists():
            continue
        dest = UPLOADS_DIR / filename
        if not dest.exists():
            shutil.copy2(src, dest)
        enqueue(filename, dept, [], None)
        print(f"[demo-seed] queued {filename} → {dept}")


# ── Health ───────────────────────────────────────────────────────────────

@app.get("/healthz", include_in_schema=False)
def healthz():
    return {"status": "ok"}


@app.get("/readyz", include_in_schema=False)
def readyz():
    try:
        with session_scope() as s:
            s.execute(text("SELECT 1"))
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"database unavailable: {e.__class__.__name__}")
    return {"status": "ready"}


# ── Models ───────────────────────────────────────────────────────────────

class AuthRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    name: str
    email: str
    password: str


def _check_model(v: str) -> str:
    if v not in ALLOWED_MODELS:
        raise ValueError(f"Model not allowed: {v}")
    return v


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=MAX_QUESTION_CHARS)
    model: str = DEFAULT_MODEL
    history: list[dict] = Field(default=[], max_length=MAX_HISTORY_TURNS)
    department: str | None = None
    check_grounding: bool = GROUNDING_CHECK_ENABLED

    _model_ok = field_validator("model")(_check_model)


class SummaryRequest(BaseModel):
    filename: str
    model: str = DEFAULT_MODEL

    _model_ok = field_validator("model")(_check_model)


class UpdateMetaRequest(BaseModel):
    department: str | None = None
    tags: list[str] | None = None


# ── Auth endpoints ───────────────────────────────────────────────────────

@app.post("/auth/signup")
@limiter.limit("5/minute")
def signup(request: Request, req: SignupRequest):
    user, token = do_signup(req.name, req.email, req.password)
    _audit("signup", user.get("id"))
    return {"token": token, "user": user}


@app.post("/auth/login")
@limiter.limit("5/minute")
def login(request: Request, req: AuthRequest):
    try:
        user, token = do_login(req.email, req.password)
    except HTTPException:
        _audit("login_failed", None, {"email": req.email[:120]})
        raise
    _audit("login", user.get("id"))
    return {"token": token, "user": user}


@app.get("/auth/me")
def auth_me(user: dict = Depends(get_current_user)):
    return {"user": user}


# ── Identity ─────────────────────────────────────────────────────────────

@app.get("/users")
def get_users(user: dict = Depends(require_admin)):
    return {"users": list_users()}


@app.get("/me")
def whoami(user: dict = Depends(get_current_user)):
    return {"user": user}


# ── Departments ──────────────────────────────────────────────────────────

@app.get("/departments")
def get_departments(user: dict = Depends(get_current_user)):
    return {
        "departments": DEPARTMENTS,
        "default": DEFAULT_DEPARTMENT,
        "allowed": allowed_departments(user),
        "can_upload": user.get("can_upload", False),
    }


# ── Stats ─────────────────────────────────────────────────────────────────

@app.get("/stats")
def get_stats(user: dict = Depends(get_current_user)):
    allowed = set(allowed_departments(user))
    docs = [d for d in list_indexed() if d.get("department") in allowed]
    total_chunks = sum(d.get("chunks", 0) for d in docs)

    midnight = datetime.combine(datetime.now(timezone.utc).date(), time.min, tzinfo=timezone.utc)
    with session_scope() as s:
        queries_today = s.scalar(
            select(func.count())
            .select_from(AuditEvent)
            .where(AuditEvent.event == "chat", AuditEvent.ts >= midnight)
        )

    dept_breakdown: dict = {}
    for d in docs:
        dept = d.get("department", "General")
        dept_breakdown[dept] = dept_breakdown.get(dept, 0) + 1

    return {
        "documents": len(docs),
        "chunks": total_chunks,
        "queries_today": queries_today,
        "departments": dept_breakdown,
    }


# ── Document endpoints ───────────────────────────────────────────────────

@app.get("/documents")
def get_documents(user: dict = Depends(get_current_user)):
    allowed = set(allowed_departments(user))
    docs = [d for d in list_indexed() if d.get("department") in allowed]
    return {"documents": docs}


def _parse_tags(raw):
    if not raw:
        return []
    return [t.strip() for t in raw.split(",") if t.strip()]


@app.post("/upload")
async def upload_files(
    files: list[UploadFile] = File(...),
    department: str = Form(DEFAULT_DEPARTMENT),
    tags: str = Form(""),
    user: dict = Depends(get_current_user),
):
    if department not in DEPARTMENTS:
        raise HTTPException(status_code=400, detail=f"Unknown department: {department}")
    assert_can_upload(user, department)
    allowed = set(allowed_departments(user))

    saved = []
    for f in files:
        name = _safe_filename(f.filename)
        if Path(name).suffix.lower() not in SUPPORTED_EXTS:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {name}")
        existing = get_document(name)
        if existing and existing["department"] not in allowed:
            # Don't let an upload overwrite a document the user can't see.
            raise HTTPException(status_code=409, detail=f"A document named {name} already exists")
        dest = UPLOADS_DIR / name
        written = 0
        with open(dest, "wb") as out:
            while chunk := f.file.read(1024 * 1024):
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    out.close()
                    dest.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail=f"File too large: {name}")
                out.write(chunk)
        saved.append(dest)

    tag_list = _parse_tags(tags)
    for p in saved:
        enqueue(p.name, department, tag_list, user.get("id"))
    _audit("upload", user.get("id"), {"files": [p.name for p in saved], "department": department})

    visible = [d for d in list_indexed() if d.get("department") in allowed]
    return {"queued": [p.name for p in saved], "documents": visible}


def _safe_filename(raw: str | None) -> str:
    # Drop any directory parts (both separators) so uploads can't escape UPLOADS_DIR.
    name = Path((raw or "").replace("\\", "/")).name.strip()
    if not name or name in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid filename")
    return name


def _doc_dept(name):
    doc = get_document(name)
    return doc["department"] if doc else None


@app.get("/files/{name}")
def get_file(
    name: str,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = user_from_token(credentials.credentials)
    name = _safe_filename(name)
    dept = _doc_dept(name)
    if dept is None:
        raise HTTPException(status_code=404, detail=f"Document not found: {name}")
    assert_can_access(user, dept)
    path = UPLOADS_DIR / name
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"File missing: {name}")
    return FileResponse(str(path))


@app.patch("/documents/{name}")
def patch_document(name: str, req: UpdateMetaRequest, user: dict = Depends(get_current_user)):
    current_dept = _doc_dept(name)
    if current_dept is None:
        raise HTTPException(status_code=404, detail=f"Document not found: {name}")
    assert_can_access(user, current_dept)
    if req.department is not None:
        if req.department not in DEPARTMENTS:
            raise HTTPException(status_code=400, detail=f"Unknown department: {req.department}")
        assert_can_access(user, req.department)
    try:
        update_document_meta(name, department=req.department, tags=req.tags)
        _audit("update_doc", user.get("id"), {"file": name, "department": req.department, "tags": req.tags})
        allowed = set(allowed_departments(user))
        visible = [d for d in list_indexed() if d.get("department") in allowed]
        return {"documents": visible}
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Document not found: {name}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/documents/{name}")
def delete_document(name: str, user: dict = Depends(get_current_user)):
    current_dept = _doc_dept(name)
    if current_dept is None:
        raise HTTPException(status_code=404, detail=f"Document not found: {name}")
    assert_can_access(user, current_dept)
    if not user.get("can_upload", False):
        raise HTTPException(status_code=403, detail=f"{user.get('role')} is read-only")
    try:
        remove_document(name)
        _audit("delete_doc", user.get("id"), {"file": name, "department": current_dept})
        allowed = set(allowed_departments(user))
        visible = [d for d in list_indexed() if d.get("department") in allowed]
        return {"documents": visible}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/clear")
def clear(user: dict = Depends(get_current_user)):
    if user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Only Admin can clear all documents")
    clear_all()
    _audit("clear", user.get("id"))
    return {"ok": True}


# ── Summary ──────────────────────────────────────────────────────────────

@app.post("/summary")
async def summarize(req: SummaryRequest, user: dict = Depends(get_current_user)):
    current_dept = _doc_dept(req.filename)
    if current_dept is None:
        raise HTTPException(status_code=404, detail=f"Document not found: {req.filename}")
    assert_can_access(user, current_dept)
    try:
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None, lambda: generate_doc_summary(req.filename, model=req.model)
        )
        _audit("summary", user.get("id"), {"file": req.filename})
        return {"filename": req.filename, "summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Chat (SSE streaming) ─────────────────────────────────────────────────

@app.post("/chat")
@limiter.limit("30/minute")
async def chat(request: Request, req: ChatRequest, user: dict = Depends(get_current_user)):
    allowed = allowed_departments(user)
    _audit("chat", user.get("id"), {"question": req.question[:120], "department": req.department})

    async def stream():
        loop = asyncio.get_event_loop()
        docs = await loop.run_in_executor(
            None,
            lambda: retrieve(
                req.question,
                department=req.department,
                allowed_departments=allowed,
                history=req.history,
            ),
        )
        sources = [
            {
                "source": d.metadata.get("source", "?"),
                "page": d.metadata.get("page", d.metadata.get("page_number", "?")),
                "department": d.metadata.get("department"),
                "preview": d.page_content[:250].replace("\n", " ") + "...",
                "chunk": d.page_content,
                "ocr": d.metadata.get("ocr", False),
            }
            for d in docs
        ]
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources, 'scope': req.department or 'All'})}\n\n"

        queue: asyncio.Queue = asyncio.Queue()
        SENTINEL = object()

        class ERROR(str):
            pass

        full_answer: list = []
        cancelled = False

        def producer():
            try:
                for token in answer_stream(
                    req.question,
                    model=req.model,
                    history=req.history,
                    department=req.department,
                    allowed_departments=allowed,
                ):
                    if cancelled:
                        break
                    full_answer.append(token)
                    loop.call_soon_threadsafe(queue.put_nowait, token)
            except Exception as e:
                print(f"[chat] LLM error: {e!r}")
                loop.call_soon_threadsafe(queue.put_nowait, ERROR(str(e)))
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, SENTINEL)

        loop.run_in_executor(None, producer)

        try:
            while True:
                item = await queue.get()
                if item is SENTINEL:
                    break
                if isinstance(item, ERROR):
                    yield f"data: {json.dumps({'type': 'error', 'message': 'The language model failed to answer. Please try again or pick another model.'})}\n\n"
                    continue
                yield f"data: {json.dumps({'type': 'token', 'content': item})}\n\n"
        finally:
            # Client disconnected (generator closed) or stream ended: stop the LLM producer.
            cancelled = True

        if req.check_grounding and docs and full_answer:
            answer_text = "".join(full_answer)
            try:
                grounding = await loop.run_in_executor(
                    None,
                    lambda: check_answer_grounding(answer_text, docs, model=req.model),
                )
                yield f"data: {json.dumps({'type': 'grounding', **grounding})}\n\n"
            except Exception:
                pass

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


# ── SPA catch-all (MUST be last) ─────────────────────────────────────────
DIST = Path(__file__).parent / "frontend" / "dist"

if DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        candidate = (DIST / full_path).resolve()
        if candidate.is_relative_to(DIST.resolve()) and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(DIST / "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
