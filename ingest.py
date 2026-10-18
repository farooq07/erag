"""
Document ingestion pipeline with:
- OCR fallback for scanned PDFs (requires Tesseract installed)
- Hash-based deduplication (skip unchanged files)
- Multi-format support: PDF, Word, Excel, PPT, TXT/MD
- Department / tag categorisation
"""
import hashlib
import re
from pathlib import Path
from typing import Iterable

from sqlalchemy import delete, select

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import (
    Docx2txtLoader,
    PyMuPDFLoader,
    TextLoader,
    UnstructuredExcelLoader,
    UnstructuredPowerPointLoader,
)
from langchain_core.documents import Document
from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2
from langchain_chroma import Chroma as _ChromaBase

from config import (
    CHROMA_DIR,
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    COLLECTION_NAME,
    DEFAULT_DEPARTMENT,
    SUPPORTED_EXTS,
    UPLOADS_DIR,
)
from db import Document as DocumentRow, IngestJob, session_scope, utcnow

# Thin wrapper so langchain-chroma accepts the chromadb EmbeddingFunction
class _ONNXEmbeddings:
    def __init__(self):
        self._fn = ONNXMiniLM_L6_V2()

    def embed_documents(self, texts):
        return self._fn(texts)

    def embed_query(self, text):
        return self._fn([text])[0]

HASH_INDEX = CHROMA_DIR / "_ingested.json"

# ── Structure-aware loaders ──────────────────────────────────────────────

def _load_xlsx_structured(path: Path) -> list[Document]:
    """Row-aware Excel loader: keeps header context with every data row.

    Produces one Document per non-blank data row formatted as
    '[Sheet: Name] Col1: val1 | Col2: val2 | ...', so the record
    is never split mid-field by the recursive text splitter.
    Falls back to UnstructuredExcelLoader on any error.
    """
    try:
        import openpyxl
        wb = openpyxl.load_workbook(str(path), read_only=True, data_only=True)
        docs: list[Document] = []
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            rows = [
                [str(c).strip() if c is not None else "" for c in row]
                for row in ws.iter_rows(values_only=True)
            ]
            if not rows:
                continue

            # First non-blank row becomes the header.
            header: list[str] | None = None
            data_start = 0
            for i, row in enumerate(rows):
                if any(c for c in row):
                    header = list(row)
                    data_start = i + 1
                    break
            if header is None:
                continue

            # Trim trailing empty header columns.
            while header and not header[-1]:
                header.pop()
            n_cols = len(header)

            for row_i, row in enumerate(rows[data_start:], start=data_start + 1):
                cells = row[:n_cols]
                if not any(c for c in cells):
                    continue
                pairs = [f"{h}: {v}" for h, v in zip(header, cells, strict=False) if h or v]
                content = f"[Sheet: {sheet_name}] " + " | ".join(pairs)
                docs.append(Document(
                    page_content=content,
                    metadata={"source": path.name, "sheet": sheet_name, "row": row_i, "page": 1},
                ))
        wb.close()
        return docs or UnstructuredExcelLoader(str(path), mode="elements").load()
    except Exception:
        return UnstructuredExcelLoader(str(path), mode="elements").load()


def _load_pptx_structured(path: Path) -> list[Document]:
    """Slide-aware PPTX loader: one Document per slide, tables reformatted as labelled rows.

    For each table shape: emits 'Col1: val1 | Col2: val2' rows so records are
    never cut mid-row.  Falls back to UnstructuredPowerPointLoader on any error.
    """
    try:
        from pptx import Presentation  # python-pptx, pulled in by unstructured
        prs = Presentation(str(path))
    except Exception:
        return UnstructuredPowerPointLoader(str(path)).load()

    docs: list[Document] = []
    for slide_num, slide in enumerate(prs.slides, 1):
        parts: list[str] = []

        # Title first.
        if slide.shapes.title and slide.shapes.title.text.strip():
            parts.append(f"[Slide {slide_num}: {slide.shapes.title.text.strip()}]")
        else:
            parts.append(f"[Slide {slide_num}]")

        for shape in slide.shapes:
            if shape.has_table:
                table = shape.table
                if not table.rows:
                    continue
                header_cells = [c.text.strip() for c in table.rows[0].cells]
                has_header = any(header_cells)
                data_rows = table.rows[1:] if has_header else table.rows
                for row in data_rows:
                    cells = [c.text.strip() for c in row.cells]
                    if not any(cells):
                        continue
                    if has_header:
                        row_str = " | ".join(
                            f"{h}: {v}" for h, v in zip(header_cells, cells, strict=False) if h or v
                        )
                    else:
                        row_str = " | ".join(c for c in cells if c)
                    if row_str:
                        parts.append(row_str)
            elif shape.has_text_frame and shape != slide.shapes.title:
                text = shape.text_frame.text.strip()
                if text:
                    parts.append(text)

        content = "\n".join(parts)
        if content.strip():
            docs.append(Document(
                page_content=content,
                metadata={"source": path.name, "page": slide_num},
            ))

    return docs or UnstructuredPowerPointLoader(str(path)).load()


# ── Utilities ────────────────────────────────────────────────────────────

def _file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()


def _invalidate_bm25() -> None:
    try:
        from rag import invalidate_bm25_cache
        invalidate_bm25_cache()
    except ImportError:
        pass


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

def _loader_for(path: Path) -> tuple[list[Document], bool]:
    """Return (docs, pre_chunked).

    pre_chunked=True means docs are already split into logical units
    (one row per Excel record, one slide per PPTX) and should skip
    the recursive text splitter to avoid mid-record cuts.
    """
    ext = path.suffix.lower()
    if ext == ".pdf":
        if _is_scanned_pdf(path):
            return _ocr_pdf(path), False
        return PyMuPDFLoader(str(path)).load(), False
    if ext in {".docx", ".doc"}:
        return Docx2txtLoader(str(path)).load(), False
    if ext in {".txt", ".md"}:
        return TextLoader(str(path), encoding="utf-8").load(), False
    if ext == ".xlsx":
        return _load_xlsx_structured(path), True
    if ext == ".pptx":
        return _load_pptx_structured(path), True
    raise ValueError(f"Unsupported file type: {ext}")


# ── Vector store ─────────────────────────────────────────────────────────

def get_vectorstore():
    embeddings = _ONNXEmbeddings()
    return _ChromaBase(
        collection_name=COLLECTION_NAME,
        embedding_function=embeddings,
        persist_directory=str(CHROMA_DIR),
    )


# ── Splitter ─────────────────────────────────────────────────────────────

# ── Structure-aware chunking ─────────────────────────────────────────────
# Fixed-size chunks used to cut across sections (a table separated from its
# heading, three unrelated sections in one chunk), which hurt keyword search,
# embeddings and the reranker alike. Markdown-structured text is now split on
# headings, one section per chunk, and every chunk starts with a location
# line ("Operations SOPs › 2. Procurement Thresholds") so it can be matched
# and understood out of context.

_MD_HEADING_RE = re.compile(r"^(#{1,3})\s+(.+?)\s*#*\s*$", re.MULTILINE)


def _doc_title(docs: list[Document], source_name: str) -> str:
    for d in docs[:1]:
        m = re.search(r"^#\s+(.+)$", d.page_content, re.MULTILINE)
        if m:
            # "Acme Corp — Operations Standard Operating Procedures" → the part after the dash
            return re.split(r"\s+[—–-]\s+", m.group(1).strip(), maxsplit=1)[-1]
    return Path(source_name).stem.replace("_", " ")


def _split_by_sections(doc: Document, title: str, splitter) -> list[Document]:
    text = doc.page_content
    marks = list(_MD_HEADING_RE.finditer(text))
    sections, path = [], {}
    starts = [m.start() for m in marks] + [len(text)]
    if marks and marks[0].start() > 0:
        sections.append(([], text[: marks[0].start()]))
    for m, end in zip(marks, starts[1:], strict=False):
        level = len(m.group(1))
        path = {k: v for k, v in path.items() if k < level}
        path[level] = m.group(2).strip()
        trail = [path[k] for k in sorted(path) if k > 1]  # h1 is the document title
        sections.append((trail, text[m.start():end]))

    out = []
    for trail, body in sections:
        body = body.strip()
        # A heading with nothing under it (e.g. the h1) is folded into the next section.
        if not body or _MD_HEADING_RE.fullmatch(body):
            continue
        where = " › ".join([title, *trail])
        pieces = [body] if len(body) <= CHUNK_SIZE * 1.5 else splitter.split_text(body)
        for piece in pieces:
            out.append(Document(page_content=f"{where}\n{piece}", metadata=dict(doc.metadata)))
    return out


def _split(
    docs: list[Document],
    source_name: str,
    department: str,
    tags: list[str],
    pre_chunked: bool = False,
) -> list[Document]:
    tags_str = ",".join(tags) if tags else ""

    if pre_chunked:
        # Docs are already split into logical units — only stamp metadata.
        for i, c in enumerate(docs):
            c.metadata["source"] = source_name
            c.metadata["chunk_id"] = i
            c.metadata["department"] = department
            if tags_str:
                c.metadata["tags"] = tags_str
        return docs

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    title = _doc_title(docs, source_name)
    chunks = []
    for d in docs:
        if len(_MD_HEADING_RE.findall(d.page_content)) >= 2:
            chunks.extend(_split_by_sections(d, title, splitter))
        else:
            for c in splitter.split_documents([d]):
                page = c.metadata.get("page")
                where = f"{title} (page {page + 1 if isinstance(page, int) else page})" if page is not None else title
                c.page_content = f"{where}\n{c.page_content}"
                chunks.append(c)
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
    uploaded_by: str | None = None,
    force: bool = False,
) -> dict:
    """Parse, chunk and embed files synchronously, recording each in the DB.

    The API does not call this directly any more; it enqueues a job and the
    worker in jobs.py calls it. A failed file raises nothing; it is reported
    in stats["failed"] and its document row is marked failed.
    """
    vs = get_vectorstore()
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
            with session_scope() as s:
                existing = s.get(DocumentRow, p.name)
                # Skip only if file unchanged AND department/tags unchanged
                if (
                    not force
                    and existing
                    and existing.chunks > 0
                    and existing.hash == h
                    and existing.department == department
                    and list(existing.tags or []) == tags
                ):
                    existing.status = "ready"
                    existing.error = None
                    stats["skipped"] += 1
                    continue
                if existing:
                    existing.status = "processing"
            if existing:
                vs.delete(where={"source": p.name})

            raw_docs, pre_chunked = _loader_for(p)
            ocr_used = bool(raw_docs and raw_docs[0].metadata.get("ocr"))
            if ocr_used:
                stats["ocr_used"].append(p.name)

            chunks = _split(raw_docs, p.name, department, tags, pre_chunked=pre_chunked)
            if not chunks:
                raise ValueError("empty after parsing")
            vs.add_documents(chunks)
            with session_scope() as s:
                row = s.get(DocumentRow, p.name) or DocumentRow(name=p.name)
                row.hash = h
                row.department = department
                row.tags = tags
                row.status = "ready"
                row.error = None
                row.chunks = len(chunks)
                row.size = p.stat().st_size
                row.ocr = ocr_used
                row.uploaded_at = utcnow()
                row.uploaded_by = uploaded_by or row.uploaded_by
                s.merge(row)
            stats["added"] += 1
        except Exception as e:
            stats["failed"].append(f"{p.name} ({e})")
            with session_scope() as s:
                row = s.get(DocumentRow, p.name)
                if row:
                    row.status = "failed"
                    row.error = str(e)[:1000]

    if stats["added"]:
        _invalidate_bm25()
    if progress:
        progress(len(paths), len(paths), "done")
    return stats


def list_indexed() -> list[dict]:
    """Return all documents (any status) with their metadata."""
    with session_scope() as s:
        return [d.as_dict() for d in s.scalars(select(DocumentRow).order_by(DocumentRow.name))]


def get_document(name: str) -> dict | None:
    with session_scope() as s:
        row = s.get(DocumentRow, name)
        return row.as_dict() if row else None


def update_document_meta(name: str, department: str | None = None, tags: list[str] | None = None) -> None:
    """Update department/tags for an already-ingested document (re-stamps chunks)."""
    entry = get_document(name)
    if entry is None:
        raise KeyError(name)
    new_dept = department if department is not None else entry["department"]
    new_tags = tags if tags is not None else entry["tags"]

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

    with session_scope() as s:
        row = s.get(DocumentRow, name)
        row.department = new_dept
        row.tags = new_tags
    _invalidate_bm25()


def remove_document(name: str) -> None:
    vs = get_vectorstore()
    vs.delete(where={"source": name})
    with session_scope() as s:
        s.execute(delete(DocumentRow).where(DocumentRow.name == name))
        s.execute(delete(IngestJob).where(IngestJob.document_name == name, IngestJob.status == "queued"))
    f = UPLOADS_DIR / name
    if f.exists():
        f.unlink()
    _invalidate_bm25()


def clear_all() -> None:
    vs = get_vectorstore()
    vs.delete_collection()
    with session_scope() as s:
        s.execute(delete(DocumentRow))
        s.execute(delete(IngestJob).where(IngestJob.status == "queued"))
    for f in UPLOADS_DIR.iterdir():
        if f.is_file():
            f.unlink()
    _invalidate_bm25()


def reindex_all() -> dict:
    """Re-chunk and re-embed every indexed document, keeping its department
    and tags. Run after changing chunking or embeddings: `python ingest.py --reindex`."""
    totals = {"added": 0, "skipped": 0, "failed": [], "ocr_used": []}
    for doc in list_indexed():
        path = UPLOADS_DIR / doc["name"]
        if not path.is_file():
            totals["failed"].append(f"{doc['name']} (file missing)")
            continue
        stats = ingest_paths([path], department=doc["department"], tags=doc["tags"], force=True)
        for key in totals:
            totals[key] += stats[key]
        print(f"[reindex] {doc['name']}: {'ok' if stats['added'] else stats['failed']}")
    return totals


if __name__ == "__main__":
    import sys

    if "--reindex" not in sys.argv:
        raise SystemExit("Usage: python ingest.py --reindex   (re-chunk every document, keeping departments)")
    from db import run_migrations

    run_migrations()
    print(reindex_all())
