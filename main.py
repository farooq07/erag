import asyncio
import json
import re
import shutil
from contextlib import asynccontextmanager
from datetime import datetime, time, timezone
from pathlib import Path
from urllib.parse import urlencode

import httpx

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, Response, StreamingResponse
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
    change_password,
    do_login,
    do_signup,
    get_current_user,
    list_users,
    logout_everywhere,
    request_password_reset,
    require_admin,
    reset_password,
    revoke_refresh_token,
    rotate_refresh_token,
    session_for_user,
    user_from_token,
)
import sso
from config import (
    ALLOWED_MODELS,
    ALLOWED_ORIGINS,
    COOKIE_SECURE,
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
    REFRESH_TOKEN_DAYS,
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
from rag import (
    check_answer_grounding,
    generate_answer_stream,
    generate_doc_summary,
    retrieve_with_confidence,
)

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
    allow_credentials=True,  # refresh cookie on cross-origin dev setups
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
        raise HTTPException(status_code=503, detail=f"database unavailable: {e.__class__.__name__}") from e
    return {"status": "ready"}


# ── Models ───────────────────────────────────────────────────────────────

class AuthRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    name: str = Field(max_length=200)
    email: str = Field(max_length=320)
    password: str = Field(max_length=200)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(max_length=320)


class ResetPasswordRequest(BaseModel):
    token: str = Field(max_length=200)
    password: str = Field(max_length=200)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: str = Field(max_length=200)


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

REFRESH_COOKIE = "dm_refresh"
# The browser always reaches auth routes under /api (Vite proxy in dev, the
# _StripApiPrefix middleware in prod), so scope the cookie to just those.
REFRESH_COOKIE_PATH = "/api/auth"


def _cookie_secure(request: Request) -> bool:
    if COOKIE_SECURE in ("true", "false"):
        return COOKIE_SECURE == "true"
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    return proto.split(",")[0].strip() == "https"


def _start_session(request: Request, response: Response, session) -> dict:
    response.set_cookie(
        REFRESH_COOKIE,
        session.refresh_token,
        max_age=REFRESH_TOKEN_DAYS * 24 * 3600,
        httponly=True,
        secure=_cookie_secure(request),
        samesite="strict",
        path=REFRESH_COOKIE_PATH,
    )
    response.headers["Cache-Control"] = "no-store"
    return session.body()


def _end_session(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)


def _ua(request: Request) -> str | None:
    return request.headers.get("user-agent")


@app.post("/auth/signup")
@limiter.limit("5/minute")
def signup(request: Request, response: Response, req: SignupRequest):
    session = do_signup(req.name, req.email, req.password, _ua(request))
    _audit("signup", session.user["id"])
    return _start_session(request, response, session)


@app.post("/auth/login")
@limiter.limit("5/minute")
def login(request: Request, response: Response, req: AuthRequest):
    try:
        session = do_login(req.email, req.password, _ua(request))
    except HTTPException as e:
        _audit("login_locked" if e.status_code == 429 else "login_failed", None, {"email": req.email[:120]})
        raise
    _audit("login", session.user["id"])
    return _start_session(request, response, session)


@app.post("/auth/refresh")
@limiter.limit("30/minute")
def refresh(request: Request, response: Response):
    try:
        session = rotate_refresh_token(request.cookies.get(REFRESH_COOKIE), _ua(request))
    except HTTPException:
        _end_session(response)
        raise
    return _start_session(request, response, session)


@app.post("/auth/logout")
def logout(request: Request, response: Response):
    uid = revoke_refresh_token(request.cookies.get(REFRESH_COOKIE))
    _end_session(response)
    if uid:
        _audit("logout", uid)
    return {"ok": True}


@app.post("/auth/logout-all")
def logout_all(response: Response, user: dict = Depends(get_current_user)):
    logout_everywhere(user["id"])
    _end_session(response)
    _audit("logout_all", user["id"])
    return {"ok": True}


SSO_COOKIE = "dm_sso"
SSO_COOKIE_PATH = "/api/auth/sso"


@app.get("/auth/sso/providers")
def sso_providers():
    return {"providers": [{"id": p.name, "label": p.label} for p in sso.PROVIDERS.values()]}


@app.get("/auth/sso/{provider}/start")
@limiter.limit("20/minute")
def sso_start(request: Request, provider: str):
    p = sso.get_provider(provider)
    try:
        url, state_cookie = sso.start(p)
    except httpx.HTTPError as e:
        print(f"[sso] {provider} discovery failed: {e!r}")
        return RedirectResponse(_sso_error_url(f"{p.label} sign-in is unavailable right now."), status_code=302)
    response = RedirectResponse(url, status_code=302)
    response.set_cookie(
        SSO_COOKIE, state_cookie,
        max_age=sso.STATE_TTL_SECONDS,
        httponly=True,
        secure=_cookie_secure(request),
        samesite="lax",  # must survive the top-level redirect back from the provider
        path=SSO_COOKIE_PATH,
    )
    return response


@app.get("/auth/sso/{provider}/callback")
@limiter.limit("20/minute")
def sso_callback(request: Request, provider: str, code: str | None = None,
                 state: str | None = None, error: str | None = None):
    p = sso.get_provider(provider)
    try:
        if error:  # user cancelled, or the provider refused
            raise sso.SSOError(f"{p.label} sign-in was cancelled.")
        claims = sso.finish(p, code, state, request.cookies.get(SSO_COOKIE))
        user_id, how = sso.resolve_user(p, claims)
        session = session_for_user(user_id, _ua(request))
    except sso.SSOError as e:
        _audit("sso_failed", None, {"provider": provider, "reason": str(e)})
        response = RedirectResponse(_sso_error_url(str(e)), status_code=302)
        response.delete_cookie(SSO_COOKIE, path=SSO_COOKIE_PATH)
        return response
    except httpx.HTTPError as e:
        print(f"[sso] {provider} callback HTTP error: {e!r}")
        return RedirectResponse(_sso_error_url(f"Couldn't reach {p.label}. Please try again."), status_code=302)

    _audit("login_sso", user_id, {"provider": provider, "account": how})
    # The SPA picks the session up from the refresh cookie on load.
    response = RedirectResponse("/", status_code=302)
    _start_session(request, response, session)
    response.delete_cookie(SSO_COOKIE, path=SSO_COOKIE_PATH)
    return response


def _sso_error_url(message: str) -> str:
    return f"/login?{urlencode({'sso_error': message})}"


@app.post("/auth/forgot-password")
@limiter.limit("3/minute")
def forgot_password(request: Request, req: ForgotPasswordRequest):
    uid = request_password_reset(req.email)
    _audit("password_reset_requested", uid, {"email": req.email[:120]})
    # Same answer whether or not the account exists.
    return {"ok": True, "message": "If that email is registered, a reset link is on its way."}


@app.post("/auth/reset-password")
@limiter.limit("5/minute")
def do_reset_password(request: Request, req: ResetPasswordRequest):
    uid = reset_password(req.token, req.password)
    _audit("password_reset", uid)
    return {"ok": True}


@app.post("/auth/change-password")
@limiter.limit("5/minute")
def do_change_password(request: Request, response: Response, req: ChangePasswordRequest,
                       user: dict = Depends(get_current_user)):
    change_password(user["id"], req.current_password, req.new_password)
    _audit("password_changed", user["id"])
    # Every session was revoked; start a fresh one for this browser.
    return _start_session(request, response, do_login(user["email"], req.new_password, _ua(request)))


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
    except KeyError as e:
        raise HTTPException(status_code=404, detail=f"Document not found: {name}") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


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
        raise HTTPException(status_code=500, detail=str(e)) from e


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
        raise HTTPException(status_code=500, detail=str(e)) from e


# ── Chat (SSE streaming) ─────────────────────────────────────────────────

def _llm_error_message(e: Exception) -> str:
    """A user-facing explanation of a model failure."""
    if getattr(e, "status_code", None) == 429:
        m = re.search(r"try again in ((?:\d+h)?(?:\d+m)?[\d.]+s)", str(e))
        when = f" in about {m.group(1).split('.')[0]}s" if m and "m" not in m.group(1) else (
            f" in about {m.group(1).split('m')[0]} minutes" if m else " shortly")
        return f"The AI provider's usage limit has been reached. Try again{when}, or ask an admin to raise the plan's limits."
    return "The language model failed to answer. Please try again or pick another model."


@app.post("/chat")
@limiter.limit("30/minute")
async def chat(request: Request, req: ChatRequest, user: dict = Depends(get_current_user)):
    allowed = allowed_departments(user)
    _audit("chat", user.get("id"), {"question": req.question[:120], "department": req.department})

    async def stream():
        loop = asyncio.get_event_loop()
        # Retrieve once; the same docs are shown as sources and used for the answer.
        docs, low_confidence = await loop.run_in_executor(
            None,
            lambda: retrieve_with_confidence(
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
                for token in generate_answer_stream(
                    req.question,
                    docs,
                    low_confidence,
                    model=req.model,
                    history=req.history,
                    department=req.department,
                ):
                    if cancelled:
                        break
                    full_answer.append(token)
                    loop.call_soon_threadsafe(queue.put_nowait, token)
            except Exception as e:
                print(f"[chat] LLM error: {e!r}")
                loop.call_soon_threadsafe(queue.put_nowait, ERROR(_llm_error_message(e)))
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, SENTINEL)

        loop.run_in_executor(None, producer)

        try:
            while True:
                item = await queue.get()
                if item is SENTINEL:
                    break
                if isinstance(item, ERROR):
                    yield f"data: {json.dumps({'type': 'error', 'message': str(item)})}\n\n"
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
