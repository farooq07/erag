# DocuMind (ERAG) — answers from your company's documents

Upload policies, reports, contracts and slide decks; ask questions in plain language; get answers that cite the exact passage they came from. Each person only gets answers from documents in departments they're allowed to see.

FastAPI + LangChain + Chroma backend, React + Tailwind + shadcn/ui frontend, Groq (or local Ollama) for the language model.

**Measured quality** (58-question benchmark in [`eval/`](eval/README.md)): 98.1% of answers contain every expected fact, 100% of unanswerable questions are refused, 0 passages leak across departments.

---

## Table of Contents

- [Status](#status)
- [Features](#features)
- [Architecture](#architecture)
- [Project Layout](#project-layout)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [RAG Pipeline](#rag-pipeline)
- [Evaluation](#evaluation)
- [Authentication & Roles](#authentication--roles)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Before Going to Production](#before-going-to-production)
- [Troubleshooting](#troubleshooting)

---

## Status

| Phase | State |
|---|---|
| 0 · Security fixes | ✅ Done |
| 1 · Production foundation (database, job queue, sessions, SSO) | ✅ Mostly done — pgvector, S3 storage and multi-tenancy pending |
| 2 · Answer quality (benchmark + retrieval fixes) | ✅ Done |
| 3 · Product features (chat history, feedback, connectors, admin console) | ⬜ Not started |
| 4 · Frontend polish | 🟡 Partly done — homepage, shadcn/ui, auth screens; routing, bundle splitting, a11y audit pending |
| 5 · Observability & security operations | 🟡 Partly done — audit log, health checks; Sentry, tracing, security headers pending |
| 6 · Testing, CI/CD, deployment | ✅ Built — 51 backend + 7 frontend + 14 end-to-end tests, offline eval gate, GitHub Actions, Docker smoke test, Render blueprint ([deploy guide](docs/DEPLOY.md)); first CI run and live deploy pending |
| 7 · SaaS business layer | ⬜ Not started |

---

## Features

**Documents**
- PDF, Word, Excel, PowerPoint, Markdown and text; scanned PDFs via OCR (Tesseract)
- Background ingestion: uploads return immediately, each document shows *queued → indexing → ready / failed*, with retries
- Structure-aware chunking: one chunk per document section, tables kept with their heading, every chunk labelled with its location ("Operations SOPs › 2. Procurement Thresholds")
- Hash-based deduplication, per-document department and tags, auto-generated summaries

**Answers**
- Streaming answers with numbered source citations; click one to open the PDF at the cited page
- Hybrid search (keyword BM25 + semantic vectors) → cross-encoder reranking → relevance filtering
- Follow-up questions understood from chat history
- Says "I couldn't find this" instead of guessing; low-confidence warning only when no passage is a strong match
- Post-answer grounding check flags sentences the sources don't support

**Access & security**
- Department-based permissions enforced inside search, so restricted passages never reach an answer, citation or summary
- Email/password with lockout, password reset, rotating sessions, "sign out of all devices"
- Google and Microsoft Entra single sign-on, optional domain restriction
- Audit log of logins, uploads, edits, deletions and questions

**Interface**
- Product homepage at `/` with an interactive, permission-aware demo
- Chat with sources panel, PDF viewer, dark/light theme, drag-and-drop upload

---

## Architecture

```
Browser (React)
  Homepage /  ·  Sign-in /login  ·  App: Chat, Sidebar, PdfViewer
        │  HTTPS: JSON + SSE (/api/*)
        │  Authorization: Bearer <15-min access token>
        │  httpOnly refresh cookie (/api/auth)
        ▼
FastAPI  (main.py)
  auth.py  sessions, lockout, password reset, RBAC
  sso.py   Google / Microsoft OpenID Connect
  /chat ─► rag.py   rewrite → BM25 + vectors → RRF → rerank → filter → LLM
  /upload ─► jobs.py  DB-backed queue ─► ingest.py  parse → section chunks → embed
        │                       │                          │
        ▼                       ▼                          ▼
  SQL database             Chroma (data/chroma_db)    data/uploads/
  (SQLite or Postgres)     all-MiniLM-L6-v2 (ONNX)    original files
  users, documents, jobs,
  sessions, audit log

LLM: Groq (openai/gpt-oss-20b by default) or local Ollama
```

---

## Project Layout

```
ERAG/
├── main.py            FastAPI app and HTTP endpoints
├── rag.py             Retrieval pipeline and answer generation
├── ingest.py          Loaders, OCR, structure-aware chunking, Chroma writer, re-index CLI
├── jobs.py            Background ingestion queue (in-process or `python -m jobs`)
├── auth.py            Sessions, passwords, lockout, reset, RBAC helpers
├── sso.py             Google / Microsoft single sign-on
├── db.py              SQLAlchemy models and session helpers
├── mailer.py          SMTP (or log) email for password resets
├── config.py          Paths, models, retrieval flags, security settings
├── migrations/        Alembic database migrations (applied on startup)
├── users.json         Demo users, imported into the database on first start
├── demo/              Demo corpus (HR, Finance, IT, Legal, Operations, Handbook)
├── eval/              Benchmark corpus, questions, runner, baseline — see eval/README.md
├── tests/             pytest suite (SSO, retrieval building blocks)
├── Dockerfile, docker-compose.yml, run.bat, run.sh
└── frontend/
    └── src/
        ├── App.jsx                 Routing: homepage / login / app
        ├── lib/session.js          In-memory access token, refresh-and-retry
        ├── landing/                Homepage (Landing, HeroDemo, HowItWorks)
        └── components/             Chat, Sidebar, PdfViewer, AuthScreen, AccountMenu, ui/
```

---

## Quick Start

### Windows, one click

Run `run.bat`. It installs Python and Node dependencies, builds the frontend and starts the server at **http://localhost:8000**. On first run it creates `.env` from `.env.example` and asks for your Groq key.

### Manual

Prerequisites: Python 3.11+, Node 18+, a [Groq API key](https://console.groq.com). Tesseract and poppler are only needed for scanned PDFs.

```bash
python -m venv .venv
.venv\Scripts\activate                 # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                    # then set GROQ_API_KEY and JWT_SECRET

cd frontend && npm install && npm run build && cd ..
python -m uvicorn main:app --port 8000  # → http://localhost:8000
```

For frontend development, run `npm run dev` in `frontend/` (http://localhost:5173, proxies `/api` to port 8000).

On first start the database is created, the demo users are imported, and — if no documents exist yet — the demo corpus is queued for indexing. The reranker model (~90 MB) downloads on the first question.

Sign in with `admin@acme.com` / `Admin123!` (other demo users use `Demo123!`; see [roles](#authentication--roles)).

### Docker

```bash
docker compose up --build              # app + Postgres
docker compose --profile ollama up     # also start a local Ollama
```

---

## Configuration

Secrets and deployment settings go in `.env` (see [`.env.example`](.env.example)):

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Groq key for the language model |
| `GROQ_MODEL` | Default model (`openai/gpt-oss-20b`); `ALLOWED_MODELS` lists what clients may pick |
| `JWT_SECRET` | **Required in production.** Signs access tokens |
| `DATABASE_URL` | Defaults to SQLite at `data/documind.db`; use `postgresql+psycopg://…` in production |
| `APP_BASE_URL` | Public URL, used in reset links and SSO redirects |
| `ALLOWED_ORIGINS` | Browser origins allowed to call the API |
| `GOOGLE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET/TENANT` | Single sign-on |
| `SSO_ALLOWED_DOMAINS`, `SSO_AUTO_SIGNUP` | Who may sign in with SSO |
| `SMTP_HOST/PORT/USER/PASSWORD/FROM` | Password-reset email (printed to the log when unset) |
| `INGEST_WORKER_ENABLED` | Run the ingest worker in the API process (default `true`) |
| `MAX_UPLOAD_MB`, `ACCESS_TOKEN_MINUTES`, `REFRESH_TOKEN_DAYS`, `COOKIE_SECURE` | Limits and session settings |

Retrieval knobs live in [`config.py`](config.py). Defaults are the configuration measured in `eval/baseline.json`:

| Setting | Default | Purpose |
|---|---|---|
| `CHUNK_SIZE` / `CHUNK_OVERLAP` | 800 / 120 | Sub-split size for sections longer than 1.5 × chunk size |
| `TOP_K` | 5 | Chunks sent to the language model |
| `QUERY_REWRITE_ENABLED` | `True` | Rewrite the question (resolves follow-ups) |
| `HYDE_ENABLED` | `False` | Hypothetical-answer embeddings; measured no gain, costs a call |
| `RERANKER_ENABLED` | `True` | Cross-encoder rescoring |
| `RERANK_POOL` / `POOL_PER_RETRIEVER` | 20 / 5 | Reranker candidate pool; each retriever's top hits always included |
| `CRAG_ENABLED` | `True` | Drop weak chunks, flag low confidence |
| `CRAG_MIN_CHUNKS` / `CRAG_THRESHOLD` | 2 / 0.3 | Always keep the top 2; keep others scoring ≥ 0.3 |
| `CRAG_LOW_CONFIDENCE` | 0.02 | Warn when the best chunk scores below this |
| `DEPARTMENTS` | HR, Accounts, Finance, IT, Legal, Operations, General | Permission scopes |

After changing chunking or embeddings, rebuild the index without losing departments: `python ingest.py --reindex`.

---

## RAG Pipeline

A `/chat` request retrieves once; the same passages are shown as sources and used for the answer.

1. **Query rewrite** (`_rewrite_query`) — one model call turns the question into a standalone, keyword-rich query, resolving follow-ups from history ("and the quarter before?").
2. **Hybrid search** (`hybrid_retrieve`)
   - Vectors: Chroma similarity search on the rewritten query (top 20), filtered to the user's departments.
   - Keywords: BM25 over the original question **plus** the rewrite, so exact terms like "Q1" or "IT-14" survive. Tokenised on word characters with numbers kept intact.
   - Fusion: Reciprocal Rank Fusion, keyed by `source#chunk_id`.
3. **Rerank** — `cross-encoder/ms-marco-MiniLM-L-6-v2` scores a pool of 20, which always includes each retriever's own top 5.
4. **Filter** — keep the top 2 plus any chunk scoring ≥ 0.3; mark *low confidence* only when the best chunk scores below 0.02.
5. **Answer** — the top chunks, labelled `[n] source (page)`, plus recent history go to the model, which answers only from them and streams tokens over SSE. A grounding check then flags unsupported sentences.

---

## Evaluation

[`eval/`](eval/README.md) holds a reproducible benchmark: the demo documents plus look-alike distractors, 58 questions (look-ups, paraphrases, codes, distractor traps, comparisons, follow-ups, unanswerable and wrong-department questions), deterministic fact-based scoring, and a regression gate.

```bash
python eval/eval_runner.py --retrieval-only   # fast, nearly free
python eval/eval_runner.py --check            # full run; exit 1 if worse than eval/baseline.json
```

| | Phase 2 start | Now |
|---|---|---|
| Answer accuracy | 92.3% | **98.1%** |
| Context recall | 94.2% | **98.1%** |
| False refusals | 5.8% | **1.9%** |
| Refusal accuracy | 100% | **100%** |
| Low-confidence warnings on answerable questions | ~81% | **7.7%** |
| Model calls per question | 2.9 | **2.0** |
| Retrieval latency (p50) | 2.9 s | **2.3 s** |
| Department leaks | 0 | **0** |

The eval README explains each fix and the finding behind it.

---

## Authentication & Roles

Users live in the database (`users` table). On first start the seven demo users in [`users.json`](users.json) are imported (passwords: `admin@acme.com / Admin123!`, the rest `Demo123!`):

| ID | Role | Departments | Can upload |
|---|---|---|---|
| `admin` | Admin | all | ✅ |
| `ceo` | CEO | all | ❌ |
| `hr_manager` | HR Manager | HR, General | ✅ |
| `finance_director` | Finance Director | Finance, Accounts, General | ✅ |
| `it_lead` | IT Lead | IT, General | ✅ |
| `legal_counsel` | Legal Counsel | Legal, General | ✅ |
| `ops_lead` | Operations Lead | Operations, General | ✅ |

Every endpoint that touches documents calls `assert_can_access` / `assert_can_upload`. Retrieval takes `allowed_departments` and intersects it with the user-chosen scope, so there is no way to retrieve a chunk you aren't allowed to see, even with crafted requests.

### Sessions

- **Access token**: 15-minute HS256 JWT, kept in browser memory, sent as `Authorization: Bearer`.
- **Refresh token**: random value in an httpOnly, `SameSite=Strict` cookie scoped to `/api/auth`, stored hashed. It rotates on every refresh; replaying an old one revokes all of that user's sessions.
- Changing or resetting a password, or **Sign out of all devices**, invalidates every outstanding token.
- 5 failed logins lock an account for 15 minutes. Password-reset links are single-use and expire after 30 minutes; without `SMTP_HOST` they are printed to the server log.

### Single sign-on (Google, Microsoft)

A provider's button appears on the login page as soon as its client id and secret are set in `.env`.

**Google** — [Google Cloud console](https://console.cloud.google.com/apis/credentials) → *Create credentials → OAuth client ID → Web application*:
- Authorized redirect URI: `{APP_BASE_URL}/api/auth/sso/google/callback` (locally `http://localhost:8000/api/auth/sso/google/callback`)
- Put the values in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

**Microsoft Entra ID** — [Entra admin center](https://entra.microsoft.com) → *App registrations → New registration*:
- Redirect URI (platform *Web*): `{APP_BASE_URL}/api/auth/sso/microsoft/callback`
- *Certificates & secrets → New client secret*; copy the **Value** into `MICROSOFT_CLIENT_SECRET`, the *Application (client) ID* into `MICROSOFT_CLIENT_ID`.
- Set `MICROSOFT_TENANT` to your *Directory (tenant) ID*. With a specific tenant, user emails are trusted because your admins control them. With `organizations`/`common`, emails can be set by any tenant's admin, so they're only trusted when the token carries the `xms_edov` claim (add it under *Token configuration → optional claims*); otherwise sign-in is refused rather than risk an account takeover.

Account mapping: a known provider identity → its user; otherwise a **verified** email matching an existing user → linked; otherwise a new Staff user in *General* (disable with `SSO_AUTO_SIGNUP=false`). Restrict who can sign in with `SSO_ALLOWED_DOMAINS=yourcompany.com`.

The rest of the codebase reads `user["role"]`, `user["departments"]`, and `user["can_upload"]` — keep those keys if you change how users are provisioned.

---

## API Reference

| Method | Path | Body / Form | Notes |
|---|---|---|---|
| POST | `/auth/signup` | `{name, email, password}` | Returns `access_token` + user, sets refresh cookie |
| POST | `/auth/login` | `{email, password}` | Same as signup; 429 when locked |
| POST | `/auth/refresh` | — (cookie) | Rotates the refresh cookie, returns a new `access_token` |
| POST | `/auth/logout` | — (cookie) | Revokes this session |
| POST | `/auth/logout-all` | — | Revokes every session of the user |
| POST | `/auth/forgot-password` | `{email}` | Always 200; emails a reset link |
| POST | `/auth/reset-password` | `{token, password}` | Single-use token |
| POST | `/auth/change-password` | `{current_password, new_password}` | Keeps this session, revokes others |
| GET | `/auth/sso/providers` | — | Configured SSO providers |
| GET | `/auth/sso/{provider}/start` | — | Redirects to Google / Microsoft |
| GET | `/auth/me` | — | Current user |
| GET | `/users` | — | Admin only |
| GET | `/departments` | — | Full list, default, current user's allowed, `can_upload` |
| GET | `/stats` | — | Counts for the user's departments |
| GET | `/documents` | — | User-visible documents with ingest `status` |
| GET | `/files/{name}` | — | Original file, department-checked |
| POST | `/upload` | `files[], department, tags` | Multipart; queues ingestion and returns immediately |
| PATCH | `/documents/{name}` | `{department?, tags?}` | Re-stamps chunks |
| DELETE | `/documents/{name}` | — | Removes chunks + raw file |
| POST | `/clear` | — | Admin only — wipes collection |
| POST | `/summary` | `{filename, model}` | 4–5 bullet summary |
| POST | `/chat` | `{question, model, history, department?, check_grounding?}` | SSE stream: `sources`, `token`…, `grounding`, `error`, `done` |
| GET | `/healthz`, `/readyz` | — | Liveness / readiness (DB check) |

Everything except `/auth/*` (other than `me`, `logout-all`, `change-password`) and the health checks requires `Authorization: Bearer <access_token>`. The browser app calls these under `/api/…`.

---

## Testing

```bash
pip install -r requirements-dev.txt
ruff check .                                                          # Python lint
python -m pytest tests                                                # 51 tests: API, auth, RBAC, SSO, retrieval
python eval/eval_runner.py --offline --baseline eval/baseline_ci.json --check   # quality gate, no model calls

cd frontend
npm run lint && npm test                                              # ESLint + 7 Vitest tests
npm run build && npm run e2e                                          # 14 Playwright tests (desktop + mobile)
```

Tests use a throwaway data directory and database and a deterministic fake LLM (`LLM_PROVIDER=fake`), so they never touch `data/` or spend Groq quota. CI (`.github/workflows/ci.yml`) runs all of the above on every push and pull request, plus a Docker build, Trivy scan and a compose smoke test. The full answer-quality eval (uses Groq) runs manually via the *Full eval* workflow.

---

## Before Going to Production

- **Language model quota.** Groq's free tier allows 1,000 requests and 200,000 tokens per day per model — roughly 100 questions a day for the whole company. Use a paid Groq tier or another provider.
- **Set `JWT_SECRET`** (`python -c "import secrets; print(secrets.token_urlsafe(48))"`). Without it the server warns at startup and uses an insecure dev key.
- **Use Postgres** (`DATABASE_URL`) and serve over HTTPS; set `APP_BASE_URL` and `ALLOWED_ORIGINS` to the public address.
- **Configure SMTP** so password-reset emails are delivered.
- **SSO** — add Google/Microsoft credentials and set `SSO_ALLOWED_DOMAINS`.

---

## Troubleshooting

**"Collection expecting embedding with dimension of 768, got 384"**
The index was built with a different embedding model. Run `python ingest.py --reindex` (stop the server first).

**Chat says the AI provider's usage limit was reached**
The Groq quota is used up; the message says when to retry. See [Before Going to Production](#before-going-to-production).

**A document stays "Queued"**
The ingest worker runs inside the API process; check the server log. If you set `INGEST_WORKER_ENABLED=false`, start a worker with `python -m jobs`.

**OCR is slow or fails**
Tesseract and poppler must both be on `PATH` (`tesseract --version`, `pdftoppm -v`).

**Reranker downloads on every restart**
It's cached in `~/.cache/huggingface`; check the `HF_HOME` variable and disk space.

**Locked out after failed logins**
Wait 15 minutes or use *Forgot password* — a reset also clears the lock.

---

## License

MIT.
