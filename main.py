import asyncio
import json
import shutil
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from auth import (
    allowed_departments,
    assert_can_access,
    assert_can_upload,
    get_current_user,
    list_users,
)
from config import (
    DEFAULT_DEPARTMENT,
    DEPARTMENTS,
    GROQ_MODEL,
    GROUNDING_CHECK_ENABLED,
    LLM_MODEL,
    LLM_PROVIDER,
    UPLOADS_DIR,
)
from ingest import (
    clear_all,
    ingest_paths,
    list_indexed,
    remove_document,
    update_document_meta,
)
from rag import answer_stream, check_answer_grounding, generate_doc_summary, retrieve

DEFAULT_MODEL = GROQ_MODEL if LLM_PROVIDER == "groq" else LLM_MODEL

app = FastAPI(title="Office RAG API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.mount("/files", StaticFiles(directory=str(UPLOADS_DIR)), name="files")


# ── Models ───────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    question: str
    model: str = DEFAULT_MODEL
    history: list[dict] = []
    department: str | None = None
    check_grounding: bool = GROUNDING_CHECK_ENABLED


class SummaryRequest(BaseModel):
    filename: str
    model: str = DEFAULT_MODEL


class UpdateMetaRequest(BaseModel):
    department: str | None = None
    tags: list[str] | None = None


# ── Identity ─────────────────────────────────────────────────────────────

@app.get("/users")
def get_users():
    """Demo user list for the user-picker in the UI."""
    # Strip internal fields if any; current shape is already client-safe.
    return {"users": list_users()}


@app.get("/me")
def whoami(user: dict = Depends(get_current_user)):
    return {"user": user}


# ── Departments ──────────────────────────────────────────────────────────

@app.get("/departments")
def get_departments(user: dict = Depends(get_current_user)):
    """Returns the full department list + the subset this user can access."""
    return {
        "departments": DEPARTMENTS,
        "default": DEFAULT_DEPARTMENT,
        "allowed": allowed_departments(user),
        "can_upload": user.get("can_upload", False),
    }


# ── Document endpoints ───────────────────────────────────────────────────

@app.get("/documents")
def get_documents(user: dict = Depends(get_current_user)):
    allowed = set(allowed_departments(user))
    docs = [d for d in list_indexed() if d.get("department") in allowed]
    return {"documents": docs}


def _parse_tags(raw: str | None) -> list[str]:
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

    saved = []
    for f in files:
        dest = UPLOADS_DIR / f.filename
        with open(dest, "wb") as out:
            shutil.copyfileobj(f.file, out)
        saved.append(Path(dest))
    stats = ingest_paths(saved, department=department, tags=_parse_tags(tags))

    # Return only documents this user can see.
    allowed = set(allowed_departments(user))
    visible = [d for d in list_indexed() if d.get("department") in allowed]
    return {"stats": stats, "documents": visible}


def _doc_dept(name: str) -> str | None:
    for d in list_indexed():
        if d["name"] == name:
            return d.get("department")
    return None


@app.patch("/documents/{name}")
def patch_document(
    name: str,
    req: UpdateMetaRequest,
    user: dict = Depends(get_current_user),
):
    current_dept = _doc_dept(name)
    if current_dept is None:
        raise HTTPException(status_code=404, detail=f"Document not found: {name}")
    # Must be able to access the document where it currently lives…
    assert_can_access(user, current_dept)
    # …and the target department, if reassigning.
    if req.department is not None:
        if req.department not in DEPARTMENTS:
            raise HTTPException(status_code=400, detail=f"Unknown department: {req.department}")
        assert_can_access(user, req.department)
    try:
        update_document_meta(name, department=req.department, tags=req.tags)
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
        allowed = set(allowed_departments(user))
        visible = [d for d in list_indexed() if d.get("department") in allowed]
        return {"documents": visible}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/clear")
def clear(user: dict = Depends(get_current_user)):
    # Only Admin can nuke the whole collection.
    if user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Only Admin can clear all documents")
    clear_all()
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
        return {"filename": req.filename, "summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Chat (SSE streaming) ─────────────────────────────────────────────────

@app.post("/chat")
async def chat(req: ChatRequest, user: dict = Depends(get_current_user)):
    allowed = allowed_departments(user)

    async def stream():
        # 1. Emit sources first.
        docs = retrieve(req.question, department=req.department, allowed_departments=allowed, history=req.history)
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
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

        # 2. Bridge the sync generator → async queue so tokens flush as they arrive.
        loop = asyncio.get_event_loop()
        queue: asyncio.Queue = asyncio.Queue()
        SENTINEL = object()
        collected: list[str] = []

        def producer():
            try:
                for token in answer_stream(
                    req.question,
                    model=req.model,
                    history=req.history,
                    department=req.department,
                    allowed_departments=allowed,
                ):
                    loop.call_soon_threadsafe(queue.put_nowait, token)
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, SENTINEL)

        loop.run_in_executor(None, producer)

        while True:
            item = await queue.get()
            if item is SENTINEL:
                break
            yield f"data: {json.dumps({'type': 'token', 'content': item})}\n\n"
            if req.check_grounding:
                collected.append(item)

        # 3. Optional post-gen grounding check (runs after all tokens, before done).
        if req.check_grounding and collected and docs:
            full_answer = "".join(collected)
            grounding = await loop.run_in_executor(
                None,
                lambda: check_answer_grounding(full_answer, docs, model=req.model),
            )
            yield f"data: {json.dumps({'type': 'grounding', **grounding})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)
