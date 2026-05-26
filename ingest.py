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


def _loader_for(path: Path):
    ext = path.suffix.lower()
    if ext == ".pdf":
        return PyMuPDFLoader(str(path))
    if ext in {".docx", ".doc"}:
        return Docx2txtLoader(str(path))
    if ext in {".txt", ".md"}:
        return TextLoader(str(path), encoding="utf-8")
    if ext == ".xlsx":
        return UnstructuredExcelLoader(str(path), mode="elements")
    if ext == ".pptx":
        return UnstructuredPowerPointLoader(str(path))
    raise ValueError(f"Unsupported file type: {ext}")


def get_vectorstore() -> Chroma:
    embeddings = OllamaEmbeddings(model=EMBED_MODEL, base_url=OLLAMA_BASE_URL)
    return Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=embeddings,
        persist_directory=str(CHROMA_DIR),
    )


def _load_and_split(path: Path) -> list[Document]:
    docs = _loader_for(path).load()
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_documents(docs)
    for i, c in enumerate(chunks):
        c.metadata["source"] = path.name
        c.metadata["chunk_id"] = i
    return chunks


def ingest_paths(paths: Iterable[Path], progress=None) -> dict:
    vs = get_vectorstore()
    hashes = _load_hashes()
    stats = {"added": 0, "skipped": 0, "failed": []}
    paths = list(paths)
    for idx, p in enumerate(paths):
        if progress:
            progress(idx, len(paths), p.name)
        if p.suffix.lower() not in SUPPORTED_EXTS:
            stats["failed"].append(f"{p.name} (unsupported)")
            continue
        try:
            h = _file_hash(p)
            if hashes.get(p.name) == h:
                stats["skipped"] += 1
                continue
            if p.name in hashes:
                vs.delete(where={"source": p.name})
            chunks = _load_and_split(p)
            if not chunks:
                stats["failed"].append(f"{p.name} (empty)")
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


def ingest_uploads_dir() -> dict:
    files = [p for p in UPLOADS_DIR.iterdir() if p.is_file()]
    return ingest_paths(files)


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
    print(ingest_uploads_dir())
