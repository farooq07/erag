import asyncio
import json
import shutil
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import UPLOADS_DIR, LLM_PROVIDER, GROQ_MODEL, LLM_MODEL
from ingest import clear_all, ingest_paths, list_indexed, remove_document
from rag import answer_stream, generate_doc_summary, retrieve

DEFAULT_MODEL = GROQ_MODEL if LLM_PROVIDER == "groq" else LLM_MODEL

app = FastAPI(title="Office RAG API")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


class ChatRequest(BaseModel):
    question: str
    model: str = DEFAULT_MODEL
    history: list[dict] = []   # [{role: "user"|"assistant", content: "..."}]


class SummaryRequest(BaseModel):
    filename: str
    model: str = DEFAULT_MODEL


# ── Document endpoints ───────────────────────────────────────────────────

@app.get("/documents")
def get_documents():
    return {"documents": list_indexed()}


@app.post("/upload")
async def upload_files(files: list[UploadFile] = File(...)):
    saved = []
    for f in files:
        dest = UPLOADS_DIR / f.filename
        with open(dest, "wb") as out:
            shutil.copyfileobj(f.file, out)
        saved.append(Path(dest))
    stats = ingest_paths(saved)
    return {"stats": stats, "documents": list_indexed()}


@app.delete("/documents/{name}")
def delete_document(name: str):
    try:
        remove_document(name)
        return {"documents": list_indexed()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/clear")
def clear():
    clear_all()
    return {"ok": True}


# ── Summary endpoint ─────────────────────────────────────────────────────

@app.post("/summary")
async def summarize(req: SummaryRequest):
    try:
        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(
            None, lambda: generate_doc_summary(req.filename, model=req.model)
        )
        return {"filename": req.filename, "summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Chat endpoint (SSE streaming) ────────────────────────────────────────

@app.post("/chat")
async def chat(req: ChatRequest):
    async def stream():
        # Emit sources first
        docs = retrieve(req.question)
        sources = [
            {
                "source": d.metadata.get("source", "?"),
                "page": d.metadata.get("page", d.metadata.get("page_number", "?")),
                "preview": d.page_content[:250].replace("\n", " ") + "...",
                "chunk": d.page_content,          # full chunk for highlight
                "ocr": d.metadata.get("ocr", False),
            }
            for d in docs
        ]
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

        # Stream tokens
        loop = asyncio.get_event_loop()
        tokens = await loop.run_in_executor(
            None,
            lambda: list(
                answer_stream(req.question, model=req.model, history=req.history)
            ),
        )
        for token in tokens:
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)
