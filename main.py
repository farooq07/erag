import asyncio
import json
import shutil
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import UPLOADS_DIR
from ingest import clear_all, ingest_paths, list_indexed, remove_document
from rag import answer_stream, retrieve

app = FastAPI(title="Office RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    question: str
    model: str = "qwen2.5:3b"


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
        saved.append(dest)
    stats = ingest_paths([Path(p) for p in saved])
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


@app.post("/chat")
async def chat(req: ChatRequest):
    async def stream():
        docs = retrieve(req.question)
        sources = [
            {
                "source": d.metadata.get("source", "?"),
                "page": d.metadata.get("page", d.metadata.get("page_number", "?")),
                "preview": d.page_content[:200].replace("\n", " ") + "...",
            }
            for d in docs
        ]
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

        loop = asyncio.get_event_loop()
        token_iter = await loop.run_in_executor(
            None, lambda: list(answer_stream(req.question, model=req.model))
        )
        for token in token_iter:
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
