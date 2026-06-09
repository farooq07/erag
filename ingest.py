"""
Document ingestion pipeline with:
- OCR fallback for scanned PDFs (requires Tesseract installed)
- Hash-based deduplication (skip unchanged files)
- Multi-format support: PDF, Word, Excel, PPT, TXT/MD
- Department / tag categorisation
"""
import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Iterable

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_community.document_loaders import (
    Docx2txtLoader,
    PyMuPDFLoader,
    TextLoader,
    UnstructuredExcelLoader,
    UnstructuredPowerPointLoader,
)
from langchain_core.documents import Document
from langchain_ollama import OllamaEmbeddings

from config import (
    CHROMA_DIR,
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    COLLECTION_NAME,
    DEFAULT_DEPARTMENT,
    EMBED_MODEL,
    OLLAMA_BASE_URL,
    SUPPORTED_EXTS,
    UPLOADS_DIR,
)

HASH_INDEX = CHROMA_DIR / "_ingested.json"


# ── Utilities ────────────────────────────────────────────────────────────

def _file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()


def _load_index() -> dict:
    """Load index; migrate old {name: hash_str} → {name: {hash, ...}}."""
    if not HASH_INDEX.exists():
        return {}
    raw = json.loads(HASH_INDEX.read_text())
    migrated = {}
    for name, value in raw.items():
        if isinstance(value, str):
            migrated[name] = {
                "hash": value,
                "department": DEFAULT_DEPARTMENT,
                "tags": [],
                "uploaded_at": None,
                "chunks": 0,
                "size": 0,
            }
        else:
            migrated[name] = value
    return migrated


def _save_index(index: dict) -> None:
    HASH_INDEX.write_text(json.dumps(index, indent=2))


# ── OCR helper ───────────────────────────────────────────────────────────

def _is_scanned_pdf(path: Path) -> bool:
    """Return True if PDF has little or no extractable text (likely scanned)."""
    try:
        import fitz
        doc = fitz.open(str(path))
        total_chars = sum(len(page.get_text().strip()) for page in doc)
        pages = len(doc)
        doc.close()
        return pages > 0 and total_chars < 100 * pages
    except Exception:
        return False


def _ocr_pdf(path: Path) -> list[Document]:
    """OCR a scanned PDF using Tesseract via pdf2image + pytesseract."""
    docs = []
    try:
        import pytesseract
        from pdf2image import convert_from_path

        images = convert_from_path(str(path), dpi=300)
        for i, img in enumerate(images):
            text = pytesseract.image_to_string(img, lang="eng")
            if text.strip():
                docs.append(Document(
                    page_content=text,
                    metadata={"source": path.name, "page": i + 1, "ocr": True},
                ))
    except ImportError:
        docs = PyMuPDFLoader(str(path)).load()
    except Exception:
        docs = PyMuPDFLoader(str(path)).load()
    return docs


# ── Loaders ──────────────────────────────────────────────────────────────

def _loader_for(path: Path) -> list[Document]:
    ext = path.suffix.lower()
    if ext == ".pdf":
        if _is_scanned_pdf(path):
            return _ocr_pdf(path)
        return PyMuPDFLoader(str(path)).load()
    if ext in {".docx", ".doc"}:
        return Docx2txtLoader(str(path)).load()
    if ext in {".txt", ".md"}:
        return TextLoader(str(path), encoding="utf-8").load()
    if ext == ".xlsx":
        return UnstructuredExcelLoader(str(path), mode="elements").load()
    if ext == ".pptx":
        return UnstructuredPowerPointLoader(str(path)).load()
    raise ValueError(f"Unsupported file type: {ext}")


# ── Vector store ─────────────────────────────────────────────────────────

def get_vectorstore() -> Chroma:
    embeddings = OllamaEmbeddings(model=EMBED_MODEL, base_url=OLLAMA_BASE_URL)
    return Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=embeddings,
        persist_directory=str(CHROMA_DIR),
    )


# ── Splitter ─────────────────────────────────────────────────────────────

def _split(docs: list[Document], source_name: str, department: str, tags: list[str]) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_documents(docs)
    # Chroma metadata values must be primitives — join tags as a comma string.
    tags_str = ",".join(tags) if tags else ""
    for i, c in enumerate(chunks):
        c.metadata["source"] = source_name
        c.metadata["chunk_id"] = i
        c.metadata["department"] = department
        if tags_str:
            c.metadata["tags"] = tags_str
    return chunks


# ── Public API ───────────────────────────────────────────────────────────

def ingest_paths(
    paths: Iterable[Path],
    department: str = DEFAULT_DEPARTMENT,
    tags: list[str] | None = None,
    progress=None,
) -> dict:
    vs = get_vectorstore()
    index = _load_index()
    stats = {"added": 0, "skipped": 0, "failed": [], "ocr_used": []}
    paths = list(paths)
    tags = tags or []
    department = department or DEFAULT_DEPARTMENT

    for idx, p in enumerate(paths):
        if progress:
            progress(idx, len(paths), p.name)
        if p.suffix.lower() not in SUPPORTED_EXTS:
            stats["failed"].append(f"{p.name} (unsupported type)")
            continue
        try:
            h = _file_hash(p)
            existing = index.get(p.name)
            # Skip only if file unchanged AND department/tags unchanged
            if (
                existing
                and existing.get("hash") == h
                and existing.get("department") == department
                and existing.get("tags", []) == tags
            ):
                stats["skipped"] += 1
                continue
            if existing:
                vs.delete(where={"source": p.name})

            raw_docs = _loader_for(p)
            if raw_docs and raw_docs[0].metadata.get("ocr"):
                stats["ocr_used"].append(p.name)

            chunks = _split(raw_docs, p.name, department, tags)
            if not chunks:
                stats["failed"].append(f"{p.name} (empty after parsing)")
                continue
            vs.add_documents(chunks)
            index[p.name] = {
                "hash": h,
                "department": department,
                "tags": tags,
                "uploaded_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                "chunks": len(chunks),
                "size": p.stat().st_size,
            }
            stats["added"] += 1
        except Exception as e:
            stats["failed"].append(f"{p.name} ({e})")

    _save_index(index)
    if stats["added"]:
        try:
            from rag import invalidate_bm25_cache
            invalidate_bm25_cache()
        except ImportError:
            pass
    if progress:
        progress(len(paths), len(paths), "done")
    return stats


def list_indexed() -> list[dict]:
    """Return list of documents with their metadata."""
    index = _load_index()
    out = []
    for name in sorted(index.keys()):
        meta = index[name]
        out.append({
            "name": name,
            "department": meta.get("department", DEFAULT_DEPARTMENT),
            "tags": meta.get("tags", []),
            "uploaded_at": meta.get("uploaded_at"),
            "chunks": meta.get("chunks", 0),
            "size": meta.get("size", 0),
        })
    return out


def update_document_meta(name: str, department: str | None = None, tags: list[str] | None = None) -> None:
    """Update department/tags for an already-ingested document (re-stamps chunks)."""
    index = _load_index()
    if name not in index:
        raise KeyError(name)
    entry = index[name]
    new_dept = department if department is not None else entry.get("department", DEFAULT_DEPARTMENT)
    new_tags = tags if tags is not None else entry.get("tags", [])

    vs = get_vectorstore()
    col = vs._collection.get(where={"source": name}, include=["documents", "metadatas"])
    ids = col.get("ids", [])
    metas = col.get("metadatas", [])
    if ids:
        tags_str = ",".join(new_tags) if new_tags else ""
        new_metas = []
        for m in metas:
            m = dict(m or {})
            m["department"] = new_dept
            if tags_str:
                m["tags"] = tags_str
            elif "tags" in m:
                m.pop("tags")
            new_metas.append(m)
        vs._collection.update(ids=ids, metadatas=new_metas)

    entry["department"] = new_dept
    entry["tags"] = new_tags
    _save_index(index)
    try:
        from rag import invalidate_bm25_cache
        invalidate_bm25_cache()
    except ImportError:
        pass


def remove_document(name: str) -> None:
    vs = get_vectorstore()
    vs.delete(where={"source": name})
    index = _load_index()
    index.pop(name, None)
    _save_index(index)
    f = UPLOADS_DIR / name
    if f.exists():
        f.unlink()
    try:
        from rag import invalidate_bm25_cache
        invalidate_bm25_cache()
    except ImportError:
        pass


def clear_all() -> None:
    vs = get_vectorstore()
    vs.delete_collection()
    if HASH_INDEX.exists():
        HASH_INDEX.unlink()
    for f in UPLOADS_DIR.iterdir():
        if f.is_file():
            f.unlink()
    try:
        from rag import invalidate_bm25_cache
        invalidate_bm25_cache()
    except ImportError:
        pass


if __name__ == "__main__":
    files = [p for p in UPLOADS_DIR.iterdir() if p.is_file()]
    print(ingest_paths(files))
