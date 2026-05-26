"""
Document ingestion pipeline with:
- OCR fallback for scanned PDFs (requires Tesseract installed)
- Hash-based deduplication (skip unchanged files)
- Multi-format support: PDF, Word, Excel, PPT, TXT/MD
"""
import hashlib
import json
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


def _load_hashes() -> dict:
    if HASH_INDEX.exists():
        return json.loads(HASH_INDEX.read_text())
    return {}


def _save_hashes(hashes: dict) -> None:
    HASH_INDEX.write_text(json.dumps(hashes, indent=2))


# ── OCR helper ───────────────────────────────────────────────────────────

def _is_scanned_pdf(path: Path) -> bool:
    """Return True if PDF has little or no extractable text (likely scanned)."""
    try:
        import fitz
        doc = fitz.open(str(path))
        total_chars = sum(len(page.get_text().strip()) for page in doc)
        doc.close()
        return total_chars < 100 * len(doc)  # <100 chars/page avg → scanned
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
        # Tesseract/pdf2image not installed — fall back to PyMuPDF
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

def _split(docs: list[Document], source_name: str) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_documents(docs)
    for i, c in enumerate(chunks):
        c.metadata["source"] = source_name
        c.metadata["chunk_id"] = i
    return chunks


# ── Public API ───────────────────────────────────────────────────────────

def ingest_paths(paths: Iterable[Path], progress=None) -> dict:
    vs = get_vectorstore()
    hashes = _load_hashes()
    stats = {"added": 0, "skipped": 0, "failed": [], "ocr_used": []}
    paths = list(paths)

    for idx, p in enumerate(paths):
        if progress:
            progress(idx, len(paths), p.name)
        if p.suffix.lower() not in SUPPORTED_EXTS:
            stats["failed"].append(f"{p.name} (unsupported type)")
            continue
        try:
            h = _file_hash(p)
            if hashes.get(p.name) == h:
                stats["skipped"] += 1
                continue
            if p.name in hashes:
                vs.delete(where={"source": p.name})

            raw_docs = _loader_for(p)
            # Track if OCR was used
            if raw_docs and raw_docs[0].metadata.get("ocr"):
                stats["ocr_used"].append(p.name)

            chunks = _split(raw_docs, p.name)
            if not chunks:
                stats["failed"].append(f"{p.name} (empty after parsing)")
                continue
            vs.add_documents(chunks)
            hashes[p.name] = h
            stats["added"] += 1
        except Exception as e:
            stats["failed"].append(f"{p.name} ({e})")

    _save_hashes(hashes)
    if progress:
        progress(len(paths), len(paths), "done")
    return stats


def list_indexed() -> list[str]:
    return sorted(_load_hashes().keys())


def remove_document(name: str) -> None:
    vs = get_vectorstore()
    vs.delete(where={"source": name})
    hashes = _load_hashes()
    hashes.pop(name, None)
    _save_hashes(hashes)
    f = UPLOADS_DIR / name
    if f.exists():
        f.unlink()


def clear_all() -> None:
    vs = get_vectorstore()
    vs.delete_collection()
    if HASH_INDEX.exists():
        HASH_INDEX.unlink()
    for f in UPLOADS_DIR.iterdir():
        if f.is_file():
            f.unlink()


if __name__ == "__main__":
    files = [p for p in UPLOADS_DIR.iterdir() if p.is_file()]
    print(ingest_paths(files))
