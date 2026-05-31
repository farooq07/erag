# ERAG — Office RAG Assistant

An end-to-end Retrieval-Augmented Generation (RAG) system for office documents. Upload PDFs, Word docs, spreadsheets, slides, and text files; ask questions in natural language; get grounded answers with inline source citations. Built with a React + Tailwind frontend and a FastAPI + LangChain + Chroma backend.

The retrieval pipeline is what makes this more than a toy: **Query Rewriting → HyDE → Hybrid (BM25 + Vector) → RRF → Cross-encoder Reranking → CRAG-lite filtering**, each step independently toggleable.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Project Layout](#project-layout)
- [Tech Stack](#tech-stack)
- [Setup](#setup)
- [Configuration](#configuration)
- [Backend — Deep Dive](#backend--deep-dive)
- [RAG Pipeline — Deep Dive](#rag-pipeline--deep-dive)
- [Frontend — Deep Dive](#frontend--deep-dive)
- [Authentication & Roles](#authentication--roles)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

---

## Features

**Document handling**
- Multi-format ingestion: PDF, DOCX, XLSX, PPTX, TXT, MD
- Automatic OCR fallback for scanned PDFs (via Tesseract + pdf2image)
- SHA-256 hash-based deduplication — re-uploading an unchanged file is a no-op
- Auto-generated 4–5 bullet document summaries after ingestion
- Per-document department + tags metadata, editable in place

**Retrieval**
- Query rewriting (LLM expands acronyms, fixes typos, sharpens keywords)
- HyDE — embeds a hypothetical answer instead of the raw query for vector search
- Hybrid BM25 + dense-vector retrieval fused via Reciprocal Rank Fusion
- Cross-encoder reranking with `ms-marco-MiniLM-L-6-v2`
- CRAG-lite: drops chunks below a relevance threshold; warns the user on low-confidence answers
- Every stage is independently toggleable in `config.py`

**Chat**
- Streaming responses over Server-Sent Events
- Multi-turn conversation memory (last 6 turns)
- Inline source citations with page numbers, previews, and OCR badges
- Click a citation → opens the source PDF in an in-app viewer at the cited page

**Access control**
- Role-based access: per-user `departments` whitelist and `can_upload` flag
- Header-based user switching (`X-User`) — drop-in replacement seam for SSO / SAML / OAuth
- All retrieval and document endpoints are scoped to a user's allowed departments

**UX**
- Dark / light theme toggle
- Department filter dropdown
- Drag-and-drop upload zone
- Sidebar with per-document chips for department & tags, plus delete / summarize actions

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (React)                         │
│  ChatPanel · Sidebar · PdfViewer · UserPicker · ThemeToggle     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP + SSE   X-User header
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                       FastAPI  (main.py)                        │
│  /chat  /upload  /documents  /summary  /users  /me  /departments│
│            └─ auth.py: role + department gating                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼─────────────────────┐
        ▼                  ▼                     ▼
   ingest.py           rag.py              data/uploads/
   (loaders, OCR,      (Query Rewrite,     (raw files served
    splitter,          HyDE, Hybrid+RRF,    via /files)
    Chroma writer)     Reranker, CRAG,
                       LLM streaming)
        │                  │
        ▼                  ▼
   ┌──────────────────────────────┐
   │   Chroma  (data/chroma_db)   │
   │   nomic-embed-text (Ollama)  │
   └──────────────────────────────┘

LLM provider:
  - Groq (default)  → llama-3.1-8b-instant
  - Ollama fallback → qwen2.5:3b
```

---

## Project Layout

```
ERAG/
├── main.py                  # FastAPI app, all HTTP endpoints
├── rag.py                   # Retrieval pipeline + LLM streaming
├── ingest.py                # Loaders, splitter, OCR, Chroma writer
├── auth.py                  # X-User header → role + department gating
├── config.py                # All knobs: paths, models, flags, thresholds
├── users.json               # Demo users (admin, CEO, dept leads)
├── requirements.txt
├── data/
│   ├── uploads/             # Raw user files (served at /files)
│   ├── chroma_db/           # Vector store + ingest index
│   └── chroma_db/_ingested.json   # name → {hash, dept, tags, chunks, …}
└── frontend/
    ├── package.json
    ├── tailwind.config.js
    ├── vite.config.js
    └── src/
        ├── App.jsx
        ├── main.jsx
        ├── index.css
        └── components/
            ├── ChatPanel.jsx
            ├── Sidebar.jsx
            ├── Message.jsx
            ├── PdfViewer.jsx
            ├── UserPicker.jsx
            ├── ThemeToggle.jsx
            └── Dropdown.jsx
```

---

## Tech Stack

**Backend**
- Python 3.11
- FastAPI + uvicorn (server, SSE streaming)
- LangChain 0.3 (loaders, splitter, prompt templating)
- Chroma 0.5 (persistent vector DB)
- Ollama (embeddings via `nomic-embed-text`; optional local LLM)
- Groq SDK (default LLM provider; `llama-3.1-8b-instant`)
- `sentence-transformers` (`cross-encoder/ms-marco-MiniLM-L-6-v2` reranker)
- `rank_bm25` for keyword search
- PyMuPDF, docx2txt, openpyxl, unstructured (multi-format parsing)
- pytesseract + pdf2image (OCR fallback)

**Frontend**
- React 19 + Vite
- Tailwind CSS 3
- axios (HTTP)
- react-markdown (assistant message rendering)
- react-pdf (PDF viewer panel)
- react-dropzone (upload zone)
- lucide-react (icons)

---

## Setup

### 1. Prerequisites

- **Python 3.11+**
- **Node 18+** (for the frontend)
- **Ollama** running locally at `http://127.0.0.1:11434`
  - Pull the embedding model: `ollama pull nomic-embed-text`
  - (Optional) pull a chat model for local fallback: `ollama pull qwen2.5:3b`
- **Groq API key** (default LLM provider) — get one at https://console.groq.com
- **(Optional) Tesseract** — only needed if you upload scanned PDFs
  - Windows: https://github.com/UB-Mannheim/tesseract/wiki
  - Also install `poppler` for `pdf2image`

### 2. Backend

```bash
git clone <repo-url> ERAG
cd ERAG

python -m venv .venv
.venv\Scripts\activate          # PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Set your Groq key (or skip and set LLM_PROVIDER="ollama" in config.py)
echo GROQ_API_KEY=gsk_xxxxx > .env

python main.py
# → http://127.0.0.1:8000
```

First chat request will download the cross-encoder (~90 MB) into `~/.cache/huggingface`. One-time.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
# → http://127.0.0.1:5173
```

The dev server proxies API calls to `http://127.0.0.1:8000`.

---

## Configuration

All knobs live in [`config.py`](config.py):

| Setting | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | `"groq"` | `"groq"` or `"ollama"` |
| `GROQ_MODEL` | `"llama-3.1-8b-instant"` | Groq chat model |
| `LLM_MODEL` | `"qwen2.5:3b"` | Ollama fallback model |
| `EMBED_MODEL` | `"nomic-embed-text"` | Ollama embedding model |
| `CHUNK_SIZE` / `CHUNK_OVERLAP` | `800` / `120` | Recursive splitter |
| `TOP_K` | `5` | Final chunks sent to the LLM |
| `DEPARTMENTS` | HR, Accounts, Finance, IT, Legal, Operations, General | Document tags |
| **`QUERY_REWRITE_ENABLED`** | `True` | LLM rewrites the question before retrieval |
| **`HYDE_ENABLED`** | `True` | Embed a hypothetical answer for vector search |
| **`RERANKER_ENABLED`** | `True` | Cross-encoder rescore over the fused pool |
| **`CRAG_ENABLED`** | `True` | Filter low-relevance chunks + low-confidence warning |
| `CRAG_THRESHOLD` | `0.3` | Min sigmoid-normalised cross-encoder score to keep |
| `CRAG_MIN_CHUNKS` | `2` | Below this many survivors → low-confidence flag |
| `RERANK_POOL` | `10` | Fused pool size handed to the reranker |
| `RERANKER_MODEL` | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Reranker checkpoint |

Flip any of the four pipeline flags to `False` to disable that stage — no code changes needed.

---

## Backend — Deep Dive

### `main.py` — FastAPI app

- `GET /users` — demo user list for the picker
- `GET /me` — resolved current user (via `X-User` header)
- `GET /departments` — full list, default, current user's allowed subset, `can_upload`
- `GET /documents` — documents visible to the current user (department-scoped)
- `POST /upload` — multipart files + `department` + `tags`; runs ingest pipeline; returns updated visible doc list
- `PATCH /documents/{name}` — change department / tags; re-stamps Chroma chunks
- `DELETE /documents/{name}` — removes chunks + raw file
- `POST /clear` — Admin-only nuke of the whole collection
- `POST /summary` — 4-5 bullet summary of a specific document
- `POST /chat` — SSE stream: emits `sources` event first, then `token` events, then `done`

Streaming bridges a sync generator (`answer_stream`) to an async queue so tokens flush as they arrive from the LLM.

### `ingest.py`

- `_loader_for(path)` — dispatches to the right LangChain loader per extension
- `_is_scanned_pdf(path)` — opens with PyMuPDF; if < 100 chars/page it's treated as scanned
- `_ocr_pdf(path)` — pdf2image → pytesseract; tags chunks with `ocr: True` metadata
- `_split()` — `RecursiveCharacterTextSplitter` (800 / 120), stamps `source`, `chunk_id`, `department`, `tags`
- `ingest_paths()` — hashes file, skips if unchanged AND dept/tags unchanged; on update deletes old chunks then re-adds
- `_ingested.json` — name → `{hash, department, tags, uploaded_at, chunks, size}`

### `auth.py`

The whole file is ~60 lines. `get_current_user` is the FastAPI dependency used by every protected endpoint; replace its body with your SSO/JWT logic and the rest of the codebase doesn't change.

---

## RAG Pipeline — Deep Dive

A `/chat` call walks through five stages. The numbered tags match the `# [TAG]` comments in [`rag.py`](rag.py).

### 1. `# [QUERY REWRITE]`

`_rewrite_query(question)` — small LLM call that expands acronyms, fixes typos, and makes the question keyword-rich. Output is bounded to 500 chars; on any error it falls back to the raw question. Results cached in-process so the same question doesn't trigger two LLM calls (one in `retrieve()` for sources, one in `answer_stream()` for tokens).

### 2. `# [HYDE]`

`_generate_hyde(question)` — LLM writes a 2–3 sentence plausible passage that would *appear* in an office document and answer the question. The embedding of this passage is closer in vector space to real chunks than the raw query is. Used **only** for the vector branch — BM25 still gets the real (rewritten) query because keywords matter for lexical match.

Chroma path: `vs._embedding_function.embed_query(hyde_text)` → `vs.similarity_search_by_vector(vec, k=k*4, filter=dept_filter)`.

Also cached.

### 3. Hybrid retrieval + RRF (`hybrid_retrieve`)

- Vector branch: HyDE-augmented `similarity_search_by_vector`, k=20
- BM25 branch: `BM25Okapi` over the (department-scoped) corpus, top-20 by score
- Reciprocal Rank Fusion: `score = Σ 1 / (60 + rank + 1)` across branches
- Pool size: `max(TOP_K, RERANK_POOL)` so the reranker has room to work

### 4. `# [RERANKER]`

`_score_pairs(question, docs)` lazy-loads `cross-encoder/ms-marco-MiniLM-L-6-v2` (cached as a module-level singleton). Each `(query, chunk)` pair gets a logit; sigmoid-normalised to `[0, 1]`. Docs are reordered by this score. On model load failure it returns `0.5` for everything so the user still gets *an* answer.

### 5. `# [CRAG]`

CRAG-lite filtering using the cross-encoder scores:
- Drop chunks with `score < CRAG_THRESHOLD` (0.3 by default)
- If fewer than `CRAG_MIN_CHUNKS` (2) survive → set `low_confidence=True` and fall back to the **top-k of the unfiltered list** so we never leave the user empty-handed
- `answer_stream` prepends a ⚠️ low-confidence warning to the streamed response

### 6. Generation

Top-K (5) chunks formatted as `[1] source.pdf (page 3)\n<content>`. Last 6 turns of history pasted into the system prompt. LLM streams tokens via `chain.stream()`; main.py forwards each token as an SSE `token` event.

---

## Frontend — Deep Dive

Single-page React 19 app under `frontend/`. State lives in `App.jsx` and is drilled down to:

- **`UserPicker`** — header dropdown to switch identity. Stores `X-User` in `localStorage`; axios interceptor adds it to every request.
- **`Sidebar`** — drag-and-drop upload (`react-dropzone`), department picker, per-document cards with chips for dept + tags, summary trigger, delete button.
- **`ChatPanel`** — input box, voice input (browser Speech Recognition API), department scope dropdown, model picker, message list.
- **`Message`** — `react-markdown` for assistant text; expandable source-citation cards with file name, page number, OCR badge, and preview snippet. Clicking a citation opens `PdfViewer`.
- **`PdfViewer`** — `react-pdf`-backed modal that loads `/files/<name>` and jumps to the cited page.
- **`ThemeToggle`** — dark / light, persisted in `localStorage`.

SSE handling: `ChatPanel` uses `fetch()` with a streaming reader, parses each `data: {...}` line, dispatches on `type`:
- `sources` → renders citation cards immediately, before any tokens arrive
- `token` → appends to the in-flight assistant message
- `done` → marks streaming complete

---

## Authentication & Roles

Identities come from [`users.json`](users.json). Seven demo users ship with the repo:

| ID | Role | Departments | Can upload |
|---|---|---|---|
| `admin` | Admin | all | ✅ |
| `ceo` | CEO | all | ❌ |
| `hr_manager` | HR Manager | HR, General | ✅ |
| `finance_director` | Finance Director | Finance, Accounts, General | ✅ |
| `it_lead` | IT Lead | IT, General | ✅ |
| `legal_counsel` | Legal Counsel | Legal, General | ✅ |
| `ops_lead` | Operations Lead | Operations, General | ✅ |

Every backend endpoint that touches documents calls `assert_can_access` / `assert_can_upload`. Retrieval (`hybrid_retrieve`) takes `allowed_departments` and intersects it with the user-chosen scope — there is no way to retrieve a chunk you aren't allowed to see, even via crafted requests.

To plug in real auth: replace `get_current_user` in `auth.py` with your token/SSO validation. The rest of the codebase reads `user["role"]`, `user["departments"]`, and `user["can_upload"]` — keep those keys.

---

## API Reference

| Method | Path | Body / Form | Notes |
|---|---|---|---|
| GET | `/users` | — | Demo user list |
| GET | `/me` | — | Resolved current user |
| GET | `/departments` | — | Full list, default, current user's allowed, `can_upload` |
| GET | `/documents` | — | User-visible documents |
| POST | `/upload` | `files[], department, tags` | Multipart; runs ingest |
| PATCH | `/documents/{name}` | `{department?, tags?}` | Re-stamps chunks |
| DELETE | `/documents/{name}` | — | Removes chunks + raw file |
| POST | `/clear` | — | Admin only — wipes collection |
| POST | `/summary` | `{filename, model}` | 4–5 bullet summary |
| POST | `/chat` | `{question, model, history, department?}` | SSE stream |

All endpoints accept (and most require) an `X-User: <id>` header.

---

## Troubleshooting

**Groq dependency conflict during `pip install -r requirements.txt`**
The `langchain-groq==1.1.2` pin clashes with newer `langchain-core`. If your env is already working, you can ignore the resolver error; pip will leave the working versions in place. Otherwise, loosen the pin: `langchain-groq>=1.1.2`.

**Cross-encoder downloads on every restart**
It shouldn't — it's cached in `~/.cache/huggingface`. If you see repeated downloads, check `HF_HOME` env var and disk space.

**OCR is slow / fails**
Tesseract + poppler must both be on `PATH`. Test with `tesseract --version` and `pdftoppm -v`. On Windows install both via the official installers.

**Empty answers on a known-good question**
Likely the CRAG threshold is too aggressive. Lower `CRAG_THRESHOLD` in `config.py` (try 0.2), or set `CRAG_ENABLED = False` to bypass filtering.

**Ollama "connection refused"**
The backend assumes Ollama at `http://127.0.0.1:11434`. Start it (`ollama serve`) or change `OLLAMA_BASE_URL` in `config.py`.

**Chroma collection is stale / weird**
`POST /clear` (as Admin) wipes both the vector store and the raw uploads. Or delete `data/chroma_db/` and `data/uploads/` manually and restart.

---

## License

MIT.
