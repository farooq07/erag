# Phase 6 (CI, tests, deployment) + Phase 3 (product features) Implementation Plan

> **For the implementing agent:** Work through the tasks in order, one at a time. Each step is a checkbox (`- [ ]`); tick it when its check passes. Read "How to work in this repo" before Task A1 — it is part of every task's requirements.

**Goal:** Make DocuMind deployable with confidence (automated tests, CI quality gates, a verified Docker deploy) and then add the features a buyer expects: saved chat history, answer feedback, an admin console, and Google Drive / SharePoint connectors.

**Architecture:** FastAPI backend (`main.py` plus new `APIRouter` modules for new areas), SQLAlchemy models in `db.py` with Alembic migrations, a DB-backed ingest queue (`jobs.py`), React 19 + Vite + Tailwind + shadcn/ui frontend. Tests run with no network model calls by using a deterministic fake LLM. CI is GitHub Actions; hosting target is Render (Docker + Postgres + persistent disk).

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy 2, Alembic, Chroma, LangChain, httpx, PyJWT[crypto], pytest; React 19, Vite 8, Tailwind 3, Vitest, Playwright; GitHub Actions; Docker / docker compose; Render.

**Spec:** This plan's spec is the roadmap in `README.md` ("Status" table) and the Phase 3/6 items from the original roadmap: *Phase 6 — pytest API tests, Vitest component tests, Playwright E2E (login → upload → ask → cite), eval gate in CI, lint + type checks, Docker build + Trivy scan, a tested `docker compose up`, a hosting target with backups and staging. Phase 3 — persistent chat history (search, rename, pin, export), thumbs up/down feedback stored and usable for eval, connectors (Google Drive, SharePoint) with scheduled re-sync, admin console (users, roles, invites, departments, usage analytics, unanswered questions, audit log viewer).*

---

## How to work in this repo (read first)

These rules are how the previous phases were built; follow them on every task.

1. **Read before you edit.** Open the file and the code around your change. Follow existing patterns: `session_scope()` for DB access, `_audit(event, user_id, extra)` for write actions, `HTTPException(status_code, detail="Plain sentence")` for errors, `Depends(get_current_user)` / `Depends(require_admin)` for auth.
2. **Find the root cause before fixing.** When something fails, reproduce it, trace it, and fix the cause, not the symptom. Don't widen a tolerance, delete a failing test, or disable a lint rule to get green.
3. **Test first.** Write the failing test, run it and see it fail for the expected reason, implement, run it green.
4. **Verify before claiming.** A task is done only when its verification commands pass. Report failures honestly, with the output.
5. **Never call Groq from tests or CI.** The free tier allows 200,000 tokens/day for the whole company; one careless eval run uses most of it. Tests use the fake LLM (Task A2). Run the full eval (`python eval/eval_runner.py --check`) only after changing retrieval, chunking or prompts, and run `--retrieval-only` first.
6. **Security invariants (must stay true after every task):**
   - Every new endpoint requires a valid access token; admin endpoints use `require_admin`.
   - Users only ever see documents, passages, conversations and feedback they own or have department access to. A wrong-owner ID returns **404**, not 403 (don't reveal existence).
   - Write actions are audited with `_audit`.
   - `eval` scope leaks stay at 0.
7. **Database changes only through Alembic.** Revision ids in this plan: `0004` conversations (B1), `0005` feedback (B3), `0006` user status (B4), `0007` connectors (B6). Generate with autogenerate against a scratch DB, then read the file:
   ```bash
   DATABASE_URL=sqlite:///./scratch.db python -m alembic upgrade head
   DATABASE_URL=sqlite:///./scratch.db python -m alembic revision --autogenerate -m "<message>" --rev-id 0004
   rm scratch.db
   ```
   Migrations run automatically at startup (`db.run_migrations()`).
8. **New routers go before the SPA catch-all.** `main.py` ends with `@app.get("/{full_path:path}")`. Register every `app.include_router(...)` above that block, or the SPA will swallow the routes. The browser calls everything under `/api/…`; `_StripApiPrefix` removes it, so routes are declared without `/api`.
9. **Commit after each task** with a conventional message (`feat:`, `fix:`, `test:`, `ci:`, `docs:`) ending with your attribution line. Work on a branch (`feat/phase-6-ci`, then `feat/phase-3-product`). **Do not push or merge to `main` unless the user asks.**
10. **Never commit secrets** (`.env`, service-account JSON, client secrets). Never delete user data in `data/`.
11. **Dev environment is Windows** (PowerShell and Git Bash); CI is Ubuntu. Use `python -m pytest`, forward slashes, and `pathlib` in code.
12. **UI rules:** sentence case, specific verbs ("Save changes", not "Submit"), lucide-react icons (no emoji as icons), shadcn/ui components from `frontend/src/components/ui/`, visible focus states, works at 390px width. Check UI changes with a screenshot (Playwright) before calling them done.

## Global Constraints

- Python 3.11; Node 20 in CI.
- No heavy SDKs for connectors: use `httpx` + `PyJWT[crypto]` (already in `requirements.txt`), not `google-api-python-client` or `msal`.
- Test env vars (set in `tests/conftest.py`, extended in A2): `DOCUMIND_DATA_DIR`, `DATABASE_URL` (temp SQLite), `INGEST_WORKER_ENABLED=false`, `JWT_SECRET`, `APP_BASE_URL=http://testserver`, `LLM_PROVIDER=fake`.
- Demo logins (imported from `users.json` on first start): `admin@acme.com / Admin123!`; `hr@acme.com`, `finance@acme.com`, `ceo@acme.com` … `/ Demo123!`.
- Existing interfaces you will call (do not rename):
  - `jobs.enqueue(name: str, department: str, tags: list[str], user_id: str | None) -> None`, `jobs.run_one() -> bool`
  - `ingest.remove_document(name: str) -> None`, `ingest.get_document(name) -> dict | None`, `ingest.list_indexed() -> list[dict]`, `config.UPLOADS_DIR`, `config.MAX_UPLOAD_BYTES`, `config.SUPPORTED_EXTS`, `config.DEPARTMENTS`
  - `auth.logout_everywhere(user_id)`, `auth.request_password_reset(email) -> str | None`, `auth.hash_password`, `auth.allowed_departments(user)`
  - `rag.retrieve_with_confidence(...) -> (docs, low_confidence)`, `rag.generate_answer_stream(question, docs, low_confidence, model, history, department)`, `rag.NO_ANSWER` (= `"I couldn't find this in the uploaded documents"`)
  - SSE events from `/chat`: `sources`, `token`, `grounding`, `error`, `done`.

## Review Focus

The five failure modes most likely to hurt a real user that no single feature test naturally covers. Each has a pinned test in the task named.

1. **Reading someone else's conversation by guessing its id** → 404, and it doesn't appear in their list. Pinned in **B1** (`test_conversation_of_other_user_is_404`).
2. **A user loses department access after a conversation** → reopening the old conversation must not show stored source passages from that department. Pinned in **B1** (`test_stored_sources_filtered_by_current_access`).
3. **The last admin demotes or deactivates themself** → 400 "At least one active admin is required". Pinned in **B4** (`test_cannot_remove_last_admin`).
4. **A connector sync meets a bad file** (too large, unsupported type, download error, name clash with a manual upload) → that file is skipped with an error entry; the rest of the sync completes; the manual upload is never overwritten. Pinned in **B6** (`test_sync_isolates_bad_files`, `test_sync_never_overwrites_manual_upload`).
5. **CI without a Groq key** → nothing calls the network LLM; the offline eval asserts 0 model calls. Pinned in **A4** (`--offline` exits 1 if any model call is counted).

## Out of scope for this plan

Roadmap items deliberately left for a later plan — don't build them here:
- Python type checking (mypy/pyright) and a TypeScript migration.
- Sharing conversations with other users.
- Confluence, Notion, Slack and website connectors; inheriting per-file permissions from the source system (connectors use one department per connector).
- Editing the department list in the UI (it stays `config.DEPARTMENTS`).
- Answer extras: suggested follow-ups, regenerate, MCP/public API keys, Slack/Teams bot.

---

# PART A — Phase 6: tests, CI, deployment

### Task A1: Lint baseline green (ESLint + Ruff)

`npm run lint` currently fails with 18 errors, so a CI lint job would be red from the start.

**Files:**
- Modify: `frontend/src/App.jsx`, `frontend/src/components/{Dropdown,Message,PdfViewer,Sidebar,ThemeToggle,ThinkingLine}.jsx`, `frontend/eslint.config.js`
- Create: `frontend/src/lib/departments.js` (receives `DEPT_DOT` from `Dropdown.jsx`), `frontend/src/lib/theme.js` (receives the non-component export from `ThemeToggle.jsx`)
- Create: `pyproject.toml` (Ruff config); Modify: `requirements-dev.txt` (add `ruff>=0.8`)

**Interfaces:**
- Produces: `npm run lint` exits 0; `ruff check .` exits 0. Later tasks keep both green.

- [x] **Step 1:** Run `cd frontend && npx eslint .` and record the 18 errors. Categories found: `no-empty` (App.jsx 79/102/128), `react-hooks/set-state-in-effect` (App.jsx 143, PdfViewer 57, Sidebar 53, ThinkingLine 33/46, others), `react-refresh/only-export-components` (Dropdown 47, ThemeToggle 20), `no-unused-vars` (Message.jsx `cn`), `no-undef require` (a config file).
- [x] **Step 2:** Fix each in code, not by disabling rules:
  - Empty `catch {}` → log with `console.warn` or set an error state the UI shows.
  - set-state-in-effect where state mirrors props → derive it during render, or reset with a `key`. For PdfViewer's page reset on a new source, key the viewer on `source.source + source.page`.
  - Move shared constants out of component files into `src/lib/`.
  - Config files using `require`: add a `files: ["*.config.js"]` block with Node globals in `eslint.config.js`.
- [x] **Step 3:** Add `pyproject.toml`:
  ```toml
  [tool.ruff]
  line-length = 120
  target-version = "py311"
  extend-exclude = [".venv", "frontend", "migrations/versions"]
  [tool.ruff.lint]
  select = ["E4", "E7", "E9", "F", "B"]
  ```
  Run `ruff check .` and fix the findings.
- [x] **Step 4 — verify:** `npm run lint` → 0 problems; `ruff check .` → "All checks passed"; `npm run build` succeeds; `python -m pytest tests -q` → all pass; open `http://localhost:8000/` (signed out) and the app (signed in) and confirm nothing changed visually.
- [x] **Step 5:** Commit `chore: lint baseline green (eslint, ruff)`.

---

### Task A2: Deterministic fake LLM for tests and E2E

**Files:**
- Create: `fake_llm.py`, `tests/test_fake_llm.py`
- Modify: `config.py` (`LLM_PROVIDER = os.getenv("LLM_PROVIDER", "groq")`; new `RATE_LIMITS_ENABLED = os.getenv("RATE_LIMITS_ENABLED", "true") == "true"`), `rag.py` (`_get_llm`), `main.py` (`limiter.enabled = RATE_LIMITS_ENABLED`), `tests/conftest.py` (`os.environ["LLM_PROVIDER"] = "fake"`)

**Interfaces:**
- Produces: `fake_llm.EchoChatModel(BaseChatModel)`; `rag._get_llm()` returns it when `LLM_PROVIDER == "fake"`. Behaviour by prompt:
  - System message contains `"rewrite"` → returns the latest question unchanged.
  - Prompt contains `"Context from documents:"` → returns `"From {source}: {first sentence of chunk 1} [1]"`, where `{source}` is the file name on the `[1] …` line. If there is no `[1]` line, returns `rag.NO_ANSWER + "."`.
  - System message contains `"fact-checker"` or `"grounded"` → returns `'{"grounded": [], "ungrounded": []}'`.
  - Otherwise → `"- Summary unavailable in test mode"`.
  - Supports `.stream()` (yield the answer word by word through `_stream`).
- Startup guard: if `LLM_PROVIDER == "fake"` and `os.getenv("DOCUMIND_ENV") == "production"`, raise `RuntimeError("The fake LLM cannot run in production")` at import of `rag`.

- [ ] **Step 1:** Write `tests/test_fake_llm.py`:
  - `test_rewrite_returns_question`: `rag._rewrite_query("How many leave days?") == "How many leave days?"`
  - `test_answer_cites_first_source`: build two `Document`s (`source="HR_Leave_Policy.md"`, content `"HR Leave Policy 2024 › 1. Annual Leave\nAll staff get 25 days. More text."`) and call `rag.generate_answer("q", docs)` → contains `"HR_Leave_Policy.md"` and `"[1]"`
  - `test_no_docs_returns_no_answer`: `rag.generate_answer("q", [])` starts with `rag.NO_ANSWER`
  - `test_stream_yields_multiple_tokens`: `len(list(rag.generate_answer_stream("q", docs))) > 1`
- [ ] **Step 2:** Run `python -m pytest tests/test_fake_llm.py -v` → FAIL (`ModuleNotFoundError: fake_llm`).
- [ ] **Step 3:** Implement `EchoChatModel` (fields: none; `_llm_type = "echo"`; `_generate` / `_stream` parse the messages as above). Wire `_get_llm`, the config flags, the limiter flag and the conftest env.
- [ ] **Step 4 — verify:** `python -m pytest tests -q` → all pass (SSO tests unaffected).
- [ ] **Step 5:** Commit `test: deterministic fake LLM and switchable rate limits`.

---

### Task A3: Backend API tests that pin the security fixes and core flows

**Files:**
- Create: `tests/test_api.py`, `tests/helpers.py`
- Modify: `tests/conftest.py` (add a session fixture `indexed_demo` that runs `jobs.run_one()` until it returns False, after the app lifespan has queued the demo corpus)

**Interfaces:**
- Consumes: A2 fake LLM; `client` fixture; demo users.
- Produces: `tests/helpers.py`: `login(client, email: str, password: str) -> str` (returns the access token), `auth(token) -> dict` (headers), `read_sse(response) -> list[dict]` (parses `data:` lines).

- [ ] **Step 1:** Write the tests (all must pass without network LLM calls):
  - `test_protected_routes_require_token`: for `GET /api/departments`, `/api/documents`, `/api/stats`, `/api/users`, `/api/files/x.md`, and `POST /api/chat {"question":"hi"}` → 401.
  - `test_x_user_header_is_ignored`: `GET /api/departments` with `X-User: admin` and no token → 401.
  - `test_users_admin_only`: HR token → 403; admin token → 200 with 7+ users.
  - `test_stats_scoped_to_departments`: HR token → every key in `departments` is in `["HR", "General"]`.
  - `test_file_download_enforces_department` (`indexed_demo`): HR gets 200 for `HR_Leave_Policy.md` and **403** for `Finance_Q3_2024_Report.md`.
  - `test_upload_sanitises_names_and_types`: upload `filename="../../evil.md"` → file saved as `evil.md` inside `UPLOADS_DIR`; `.exe` → 400; with `monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 10)` a 20-byte file → 413.
  - `test_upload_cannot_overwrite_other_department`: IT lead uploads `HR_Leave_Policy.md` → 409.
  - `test_upload_queues_then_worker_indexes`: upload a small `.md` as admin → document `status == "queued"`; call `jobs.run_one()` → `status == "ready"` and `chunks > 0`.
  - `test_chat_streams_sources_tokens_done` (`indexed_demo`): admin asks "How many days of annual leave do full-time employees get?" → event types in order start with `sources`, contain `token`, end with `done`; `HR_Leave_Policy.md` is in the sources.
  - `test_chat_respects_scope` (`indexed_demo`): HR token asks "What was total revenue in Q3 2024?" → no source has department `Finance`.
  - `test_chat_rate_limit_message`: monkeypatch `main.generate_answer_stream` to raise an exception with `status_code = 429` and message `"... try again in 3m6.6s ..."` → an `error` event whose message contains `"usage limit"` and `"3 minutes"`.
  - `test_login_lockout_after_five_failures`: create a user, 5 wrong logins → the 5th returns 429; the right password → still 429.
- [ ] **Step 2:** Run → the new tests that touch unimplemented helpers fail; implement `tests/helpers.py` and the `indexed_demo` fixture.
- [ ] **Step 3 — verify:** `python -m pytest tests -q` → all pass. Note the first run downloads the ONNX embedding model (~80 MB) and the cross-encoder; that is expected.
- [ ] **Step 4:** Commit `test: API tests for auth, RBAC, uploads, chat`.

---

### Task A4: Offline eval gate for CI

**Files:**
- Modify: `eval/eval_runner.py`
- Create: `eval/baseline_ci.json` (generated)
- Modify: `eval/README.md` (document `--offline` and the CI baseline)

**Interfaces:**
- Produces: CLI flags `--baseline PATH` (default `eval/baseline.json`; used for compare, `--check` and `--save-baseline`) and `--offline` (implies `--retrieval-only`, `QUERY_REWRITE_ENABLED=false`, `HYDE_ENABLED=false`; after the run, exit 1 with `"offline run made N model calls"` if `llm_calls_per_q > 0`).

- [ ] **Step 1:** Add the flags (argparse block near line 333).
- [ ] **Step 2:** Generate the CI baseline: `python eval/eval_runner.py --offline --baseline eval/baseline_ci.json --save-baseline`. Expected summary: `llm_calls_per_q 0`, `scope_leaks 0`, hit rate ≈ 96%.
- [ ] **Step 3 — verify:** `python eval/eval_runner.py --offline --baseline eval/baseline_ci.json --check` → "No regressions." Run it again with `GROQ_API_KEY` unset in the shell → same result.
- [ ] **Step 4:** Commit `ci: offline eval gate with its own baseline`.

---

### Task A5: Frontend unit tests (Vitest)

**Files:**
- Modify: `frontend/package.json` (devDeps `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`; script `"test": "vitest run"`), `frontend/vite.config.js` (`test: { environment: "jsdom", setupFiles: "./src/test-setup.js" }`)
- Create: `frontend/src/test-setup.js` (jest-dom; `window.matchMedia` stub returning `matches: true` for `prefers-reduced-motion`), `frontend/src/lib/session.test.js`, `frontend/src/landing/HeroDemo.test.jsx`

- [ ] **Step 1:** Write the tests:
  - `refreshSession dedupes concurrent calls`: mock `fetch` resolving `{ ok: true, json: () => ({ access_token: "t", user: {id: "u"} }) }`; `await Promise.all([refreshSession(), refreshSession()])` → `fetch` called once; `getAccessToken() === "t"`.
  - `apiFetch retries once after 401`: first call 401, refresh ok, second call 200 → final status 200, `fetch` called 3 times.
  - `apiFetch does not refresh for /auth/ urls`: 401 on `/api/auth/me` → returned as-is, `fetch` called once.
  - `HeroDemo redacts sources outside the role`: render, click radio "What was revenue in Q3 2024?" → shows `"I couldn't find this in the documents you can access."` and `"Withheld · Finance only"`; click "Finance Director" → shows `"£18.4 million"`.
- [ ] **Step 2:** `npm test` → passes (reduced motion makes the demo render instantly).
- [ ] **Step 3:** Commit `test: vitest for session handling and hero demo`.

---

### Task A6: End-to-end tests (Playwright)

**Files:**
- Create: `frontend/playwright.config.js`, `frontend/e2e/homepage.spec.js`, `frontend/e2e/auth.spec.js`, `frontend/e2e/chat.spec.js`
- Modify: `frontend/package.json` (devDep `@playwright/test`; script `"e2e": "playwright test"`)

**Interfaces:**
- Consumes: A2 (`LLM_PROVIDER=fake`, `RATE_LIMITS_ENABLED=false`), built `frontend/dist`.
- `playwright.config.js` `webServer`: command `python -m uvicorn main:app --port 8001` with `cwd: ".."` and env `LLM_PROVIDER=fake`, `RATE_LIMITS_ENABLED=false`, `JWT_SECRET=e2e`, `DOCUMIND_DATA_DIR` and `DATABASE_URL` pointing at a fresh temp dir; `url: "http://localhost:8001/readyz"`; `baseURL: "http://localhost:8001"`; timeout 180s. Projects: Desktop Chrome and a 390×844 viewport.

- [ ] **Step 1:** Write the specs:
  - homepage: `/` shows heading "Answers from your documents, with the page they came from."; choose "Finance Director" then "What was revenue in Q3 2024?" → "£18.4 million" visible; at 390px, `document.documentElement.scrollWidth <= window.innerWidth`.
  - auth: "Open DocuMind" → `/login`; wrong password → alert "Invalid email or password"; `admin@acme.com / Admin123!` → app header shows "Alex Admin"; sign out → back at `/`.
  - chat: log in as admin; wait (≤120s, polling the sidebar) until "HR_Leave_Policy.md" shows no "Queued"/"Indexing…" badge; ask "How many days of annual leave do full-time employees get?" → a source card "HR_Leave_Policy.md" appears and the answer contains "[1]". Then log in as `hr@acme.com / Demo123!`, ask "What was total revenue in Q3 2024?" → no source card containing "Finance_".
- [ ] **Step 2 — verify:** `npm run build && npx playwright install chromium && npm run e2e` → all pass on both projects.
- [ ] **Step 3:** Commit `test: playwright e2e for homepage, auth, chat and permissions`.

---

### Task A7: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/eval-full.yml`, `.github/dependabot.yml`

**Interfaces:**
- `ci.yml` triggers: `push` to `main`, `pull_request`. Jobs:
  - `backend`: ubuntu-latest, Python 3.11 with pip cache; cache `~/.cache/huggingface` and `~/.cache/chroma` keyed on `requirements.txt`; `pip install -r requirements-dev.txt`; `ruff check .`; `python -m pytest tests -q`; `python eval/eval_runner.py --offline --baseline eval/baseline_ci.json --check`; upload `eval/results/latest.json` as an artifact.
  - `frontend`: Node 20 with npm cache; `npm ci`; `npm run lint`; `npm test`; `npm run build`.
  - `e2e`: `needs: [backend, frontend]`; set up both; `npx playwright install --with-deps chromium`; `npm run build`; `npm run e2e`; on failure upload `playwright-report/`.
  - `docker`: `needs: backend`; build the image; scan with `aquasecurity/trivy-action` (`severity: CRITICAL,HIGH`, `ignore-unfixed: true`, `exit-code: 1`); then the compose smoke test from A8.
  - No job sets `GROQ_API_KEY`.
- `eval-full.yml`: `workflow_dispatch` only; uses secret `GROQ_API_KEY`; runs `python eval/eval_runner.py --check`; uploads results. Header comment: "Uses ~100k Groq tokens — run manually after retrieval or prompt changes."
- `dependabot.yml`: weekly for `pip` (`/`), `npm` (`/frontend`), `github-actions`.

- [ ] **Step 1:** Write the three files.
- [ ] **Step 2 — verify locally:** `python -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/workflows/*.yml .github/dependabot.yml` (install `pyyaml` if missing); run each job's commands locally once.
- [ ] **Step 3:** Commit `ci: github actions for lint, tests, eval gate, e2e, docker`. Then **ask the user** to push the branch so the workflow runs; watch it with `gh run watch` and fix failures at their root cause.

---

### Task A8: Verified Docker deployment

**Files:**
- Modify: `docker-compose.yml` (replace the `./data:/app/data` bind mount with a named volume `appdata:/app/data` — the container runs as uid 10001 and can't write a host-owned bind mount)
- Create: `docker-compose.ci.yml` (overrides `LLM_PROVIDER=fake`, `JWT_SECRET=ci`, `RATE_LIMITS_ENABLED=false`, `DOCUMIND_ENV=ci`), `scripts/smoke_test.py`

**Interfaces:**
- `scripts/smoke_test.py BASE_URL`: polls `GET /readyz` for up to 180s; logs in as admin via `POST /api/auth/login`; asserts `GET /api/documents` is 200 and `GET /` returns HTML containing `<div id="root">`; exits 0 on success and non-zero with the failing step printed.

- [ ] **Step 1:** Write the smoke test and the CI override.
- [ ] **Step 2 — verify:** `docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --build && python scripts/smoke_test.py http://localhost:8000; docker compose logs app | tail -50; docker compose down -v` → smoke test prints "OK". If Docker isn't available locally, say so and rely on the CI `docker` job.
- [ ] **Step 3:** Add the compose smoke test to the CI `docker` job (A7).
- [ ] **Step 4:** Commit `ci: compose smoke test and writable data volume`.

---

### Task A9: Hosting on Render (staging + production)

**Files:**
- Modify: `config.py` (normalise `DATABASE_URL`: `postgres://…` or `postgresql://…` without a driver → `postgresql+psycopg://…`)
- Create: `tests/test_config.py`, `render.yaml`, `docs/DEPLOY.md`

**Interfaces:**
- Produces: `config.normalize_database_url(url: str) -> str`.
- `render.yaml`: one `web` service (`runtime: docker`, `healthCheckPath: /readyz`, `numInstances: 1`, disk `data` at `/app/data` 5 GB); env `DATABASE_URL` from the database `connectionString`, `JWT_SECRET` `generateValue: true`, `GROQ_API_KEY` `sync: false`, `COOKIE_SECURE=true`, `APP_BASE_URL` and `ALLOWED_ORIGINS` `sync: false`, `DOCUMIND_ENV=production`; one Postgres database `documind-db`.

- [ ] **Step 1:** Tests: `normalize_database_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"`; the same for `postgresql://…`; `postgresql+psycopg://…` and `sqlite:///x.db` unchanged.
- [ ] **Step 2:** Implement, run `python -m pytest tests/test_config.py -v` → PASS.
- [ ] **Step 3:** Write `render.yaml` and `docs/DEPLOY.md`. The doc covers: deploy steps; why it's **one instance** (in-process ingest worker and Chroma on the disk); backups (Render Postgres daily backups on paid plans + disk snapshots; restore steps); a staging environment as a second blueprint instance with its own database; `python ingest.py --reindex` after chunking changes; the Groq quota warning; registering the SSO redirect URIs for the public URL.
- [ ] **Step 4:** Commit `feat: render deployment blueprint and guide`. **Ask the user** to create the Render blueprint from their account; you can't verify the deploy without it.

---

# PART B — Phase 3: product features

Start a new branch `feat/phase-3-product` from `main` once Part A is merged.

### Task B1: Saved conversations (backend)

**Files:**
- Modify: `db.py` (models), `main.py` (`ChatRequest`, `/chat`, include router)
- Create: `conversations.py` (service + `APIRouter`), `migrations/versions/0004_conversations.py`, `tests/test_conversations.py`

**Interfaces:**
- Models:
  - `Conversation`: `id: str` (uuid4 hex, pk), `user_id` FK users (cascade, indexed), `title: str(200)`, `pinned: bool=False`, `created_at`, `updated_at` (indexed).
  - `Message`: `id: str` (uuid4 hex, pk), `conversation_id` FK (cascade, indexed), `role: str(16)` (`user`/`assistant`), `content: Text`, `sources: JSON=list`, `grounding: JSON|None`, `created_at`.
- `ChatRequest` gains `conversation_id: str | None = None`.
- `/chat` behaviour:
  - With `conversation_id`: load it; 404 `"Conversation not found"` unless it belongs to the caller. History = its last `MAX_HISTORY_TURNS` messages from the DB (ignore `req.history`).
  - Without one: create it with `title = question[:80]` (no model call).
  - Save the user message before retrieval.
  - First SSE event is `{"type": "conversation", "id": ...}`.
  - After streaming (also when the client disconnects), save the assistant message with the streamed text and the `sources` list exactly as sent.
  - When grounding arrives, update that message's `grounding`.
  - The `done` event carries `message_id`.
- Router `conversations.router`:
  - `GET /conversations?q=&limit=50` → `{"conversations": [{id, title, pinned, updated_at}]}`, own only, pinned first then `updated_at` desc; `q` matches title or message content (case-insensitive).
  - `GET /conversations/{id}` → `{id, title, pinned, messages: [{id, role, content, sources, grounding, created_at}]}`.
  - `PATCH /conversations/{id}` `{title?: str(1..200), pinned?: bool}`.
  - `DELETE /conversations/{id}`.
  - `GET /conversations/{id}/export` → `text/markdown` attachment `"{slug}.md"` containing the Q&A and a "Sources" list per answer.
- Service: `filter_sources(sources: list[dict], allowed: set[str]) -> list[dict]` drops entries whose `department` isn't in `allowed`; applied on every read.

- [ ] **Step 1:** Write `tests/test_conversations.py` (uses the fake LLM, `indexed_demo`, `helpers.login`):
  - `test_chat_creates_conversation_and_saves_both_messages`: the first event is `conversation`; `GET /api/conversations/{id}` → 2 messages, the assistant one has non-empty `sources`; `done.message_id` equals the assistant message id.
  - `test_follow_up_uses_stored_history`: second `/chat` with the `conversation_id` → conversation has 4 messages.
  - `test_conversation_of_other_user_is_404`: HR's conversation id fetched, patched, deleted and exported by the finance user → all 404; it doesn't appear in their list.
  - `test_stored_sources_filtered_by_current_access`: admin chats about Q3 revenue; then change the admin's departments in the DB to `["HR", "General"]` → `GET` the conversation → no source with department `Finance`.
  - `test_rename_pin_search_delete`: PATCH title → listed with the new title; pinned first; `q="annual leave"` finds it; DELETE → 404 afterwards.
  - `test_export_markdown`: content-type `text/markdown`; body contains the question and `"HR_Leave_Policy.md"`.
- [ ] **Step 2:** Run → FAIL. Generate migration `0004`, implement the models, service, router and `/chat` changes. Audit `conversation_deleted`.
- [ ] **Step 3 — verify:** `python -m pytest tests -q` → all pass; `python eval/eval_runner.py --offline --baseline eval/baseline_ci.json --check` → no regressions.
- [ ] **Step 4:** Commit `feat: saved conversations api`.

---

### Task B2: Saved conversations (frontend)

**Files:**
- Create: `frontend/src/components/HistoryPanel.jsx`
- Modify: `frontend/src/App.jsx` (`conversationId` state; send `conversation_id`; handle `conversation` and `done.message_id` events; load a conversation), `frontend/src/components/Sidebar.jsx` (mount `HistoryPanel`), `frontend/src/components/ChatPanel.jsx` ("New chat" clears `conversationId`)
- Test: `frontend/e2e/history.spec.js`

**Interfaces:**
- Consumes: B1 endpoints.
- `HistoryPanel({ activeId, onOpen(id), onNew(), refreshKey })`: search box (debounced 300 ms); list with pinned first; each row has a menu with Rename (inline input, Enter saves, Escape cancels), Pin/Unpin, Export (downloads `.md` via `apiFetch` → blob), Delete (confirmation dialog: "Delete this conversation? This can't be undone." Buttons "Delete" and "Cancel"). Empty state: "Your conversations will appear here." Loading: skeleton rows.
- A message object in `App.jsx` state gains `id` (from `done.message_id`).

- [ ] **Step 1:** Write `history.spec.js`: ask a question → it appears in History; reload the page → open it → both messages and source cards show; rename → new title shows; delete → it's gone.
- [ ] **Step 2:** Implement; refresh the list after each completed answer (bump `refreshKey`).
- [ ] **Step 3 — verify:** `npm run lint && npm test && npm run build && npm run e2e` → pass; screenshot the sidebar at 1440px and 390px and check them.
- [ ] **Step 4:** Commit `feat: conversation history sidebar`.

---

### Task B3: Answer feedback

**Files:**
- Modify: `db.py`; Create: `migrations/versions/0005_feedback.py`, `feedback.py` (router), `tests/test_feedback.py`, `eval/feedback_to_candidates.py`
- Modify: `frontend/src/components/Message.jsx` (thumbs), `main.py` (include router)

**Interfaces:**
- Model `MessageFeedback`: `id` int pk, `message_id` FK messages (cascade), `user_id` FK users (cascade), `rating: SmallInteger` (1 or -1), `comment: Text|None`, `created_at`, `updated_at`; unique (`message_id`, `user_id`).
- `PUT /messages/{message_id}/feedback` `{rating: Literal[1, -1], comment: str | None (max 1000)}` → upsert; only the owner of the message's conversation, else 404; only `assistant` messages, else 400. `DELETE /messages/{message_id}/feedback` → removes it. Audit `feedback`.
- `GET /conversations/{id}` includes `feedback: {rating, comment} | null` per assistant message.
- `eval/feedback_to_candidates.py`: reads 👎 feedback from the DB and writes `eval/candidates.json` (`question`, `answer`, `comment`, `sources`) for a person to review and turn into eval items. It never edits `eval_set.json`.
- UI: thumbs up / thumbs down buttons (`aria-pressed`, labels "Helpful" / "Not helpful") under each finished assistant message. Thumbs down opens a small textarea "What was wrong?" with "Send feedback". The toast says "Thanks — feedback saved."

- [ ] **Step 1:** Tests: `test_owner_can_rate_and_change_rating` (PUT 1 then -1 → one row with -1); `test_other_user_gets_404`; `test_cannot_rate_user_message` → 400; `test_feedback_returned_with_conversation`; `test_candidates_export_writes_only_negative` (run the script's main function against the test DB → only -1 items).
- [ ] **Step 2:** Run → FAIL; generate migration `0005`; implement the backend, then the UI; add an e2e step to `history.spec.js`: click "Not helpful", type a comment, send → reload → the button stays pressed.
- [ ] **Step 3 — verify:** pytest, lint, vitest, build, e2e all pass.
- [ ] **Step 4:** Commit `feat: answer feedback with eval candidate export`.

---

### Task B4: Admin API (users, invites, audit, analytics)

**Files:**
- Modify: `db.py` (`User.is_active: bool = True`, server default true), `auth.py`, `main.py` (include router)
- Create: `admin.py` (router, prefix `/admin`, every route `Depends(require_admin)`), `migrations/versions/0006_user_status.py`, `tests/test_admin.py`

**Interfaces:**
- `auth`: inactive users get 401 `"Account disabled"` from `do_login`, `user_from_token`, `rotate_refresh_token` and `session_for_user`. New `auth.invite_user(email) -> None`: same token as `request_password_reset`, but the email subject is `"You've been invited to DocuMind"` and the link expires in 7 days.
- Endpoints:
  - `GET /admin/users` → `{"users": [public + is_active + created_at]}`.
  - `POST /admin/users` `{name, email, role, departments, can_upload}` → 201; departments must be a subset of `config.DEPARTMENTS` (else 400 `"Unknown department: X"`); duplicate email → 409; creates the user with no password and sends the invite. Audit `user_invited`.
  - `PATCH /admin/users/{id}` `{role?, departments?, can_upload?, is_active?}` → deactivating calls `auth.logout_everywhere`. Audit `user_updated` with the changed fields.
  - Last-admin guard: if the change would leave zero active users with role `"Admin"` → 400 `"At least one active admin is required"`.
  - `GET /admin/audit?event=&user_id=&before_id=&limit=50` (max 200) → `{"events": [{id, ts, event, user_id, data}], "next_before_id": int | null}`, newest first, keyset paginated on `id`.
  - `GET /admin/analytics?days=30` (1–365) →
    ```
    {"questions_per_day": [{"date": "YYYY-MM-DD", "count": n}],
     "top_questions": [{"question": str, "count": n}],   # 10, from chat audit events, lower-cased and trimmed
     "no_answer_rate": float,     # assistant messages starting with rag.NO_ANSWER / all assistant messages
     "feedback": {"up": n, "down": n},
     "by_department": {dept: n},  # chat events by requested department; null → "All"
     "active_users": n}           # distinct users with a chat event in the window
    ```
  - `GET /admin/feedback?rating=-1&limit=50` → feedback with its question, answer and user email.

- [ ] **Step 1:** Tests: `test_admin_routes_reject_non_admin` (HR → 403 on every route); `test_invite_creates_user_and_sends_email` (monkeypatch `mailer.send_email`, capture the subject); `test_unknown_department_rejected`; `test_deactivate_revokes_sessions_and_blocks_login`; `test_cannot_remove_last_admin` (demote the only admin → 400; deactivate → 400); `test_audit_pagination` (create 3 events, `limit=2` → 2 + `next_before_id`, next page → the rest); `test_analytics_counts` (2 chats, one of them a no-answer, one 👍 → counts match).
- [ ] **Step 2:** Run → FAIL; generate migration `0006`; implement.
- [ ] **Step 3 — verify:** pytest all pass; offline eval check passes.
- [ ] **Step 4:** Commit `feat: admin api for users, invites, audit and analytics`.

---

### Task B5: Admin console (frontend)

**Files:**
- Create: `frontend/src/admin/AdminConsole.jsx` (lazy-loaded at `/admin`), `frontend/src/admin/UsersTab.jsx`, `AnalyticsTab.jsx`, `AuditTab.jsx`, `FeedbackTab.jsx`
- Modify: `frontend/src/App.jsx` (route `/admin`, only for `role === "Admin"`; others are sent to `/`), `frontend/src/components/AccountMenu.jsx` ("Admin console" item for admins)
- Test: `frontend/e2e/admin.spec.js`

**Interfaces:**
- Consumes: B4 endpoints.
- Users tab: table (name, email, role, departments as chips, upload, status) with an "Invite user" dialog (labelled fields, departments as checkboxes, inline errors from the API) and per-row edit and Deactivate/Reactivate (with confirmation).
- Analytics tab: questions-per-day bar chart (inline SVG, no chart library; table fallback for screen readers), tiles for no-answer rate, feedback 👍/👎 counts and active users, top-questions list, by-department list. Range buttons 7 / 30 / 90 days.
- Audit tab: filter by event and user, "Load more" via `next_before_id`.
- Feedback tab: 👎 list with question, answer excerpt and comment.
- Every tab has loading skeletons, an empty state and an error state with "Try again".

- [ ] **Step 1:** `admin.spec.js`: admin opens Admin console → invites `new.person@example.com` to HR → appears in the table; HR user visiting `/admin` lands on `/`.
- [ ] **Step 2:** Implement; check screenshots at 1440px and 390px.
- [ ] **Step 3 — verify:** lint, vitest, build, e2e pass.
- [ ] **Step 4:** Commit `feat: admin console`.

---

### Task B6: Connector framework + Google Drive

**Files:**
- Modify: `db.py`; Create: `migrations/versions/0007_connectors.py`, `connectors/__init__.py`, `connectors/base.py`, `connectors/google_drive.py`, `tests/test_connectors.py`
- Modify: `config.py` (`GOOGLE_SERVICE_ACCOUNT_FILE = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "")`), `.env.example`

**Interfaces:**
- Models:
  - `Connector`: `id` int pk, `kind: str(32)` (`google_drive` | `sharepoint`), `name: str(120)` unique, `department: str(64)`, `config: JSON` (no secrets), `enabled: bool=True`, `created_by`, `created_at`, `last_sync_at`, `last_status: str(16)|None` (`ok` | `partial` | `failed`), `last_error: Text|None`.
  - `ConnectorItem`: `id`, `connector_id` FK cascade, `external_id: str(255)`, `document_name: str(512)`, `version: str(255)`; unique (`connector_id`, `external_id`).
- `connectors/base.py`:
  - `@dataclass RemoteFile(external_id: str, name: str, version: str, size: int | None)`
  - `class Source(Protocol)`: `list_files() -> list[RemoteFile]`; `download(f: RemoteFile) -> tuple[str, bytes]` (final filename with extension, content)
  - `@dataclass SyncResult(added: int, updated: int, removed: int, skipped: list[str], errors: list[str])`
  - `unique_document_name(preferred: str) -> str`: returns `preferred` if no document or file has that name, else `"{stem} ({n}){ext}"` with the lowest free n ≥ 2.
  - `source_for(connector) -> Source`: builds the right source from `kind` + `config` + env credentials. Kind `"fake"` (files listed in `config["files"]` as `{name, content}`) is accepted only when `DOCUMIND_ENV` is `ci` or `test`; B7's E2E step uses it.
  - `sync_connector(connector_id: int, source: Source | None = None) -> SyncResult`:
    - List the files. Skip any whose extension isn't in `SUPPORTED_EXTS` or whose size is over `MAX_UPLOAD_BYTES` (add the reason to `skipped`).
    - New file → download, write `UPLOADS_DIR/unique_document_name(name)`, create the `ConnectorItem`, then `jobs.enqueue(doc_name, connector.department, [connector.name], None)`.
    - Changed `version` → download and overwrite **its own** `document_name`, then enqueue.
    - Items no longer listed → `ingest.remove_document(document_name)` and delete the item.
    - A per-file exception → append `"{name}: {error}"` to `errors` and continue.
    - Set `last_status` = `ok` (no errors), `partial` (some), `failed` (listing failed); set `last_sync_at`; audit `connector_sync` with the counts.
- `connectors/google_drive.py`: `GoogleDriveSource(service_account: dict, folder_id: str, http: httpx.Client | None = None)`.
  - Token: an RS256 JWT signed with `service_account["private_key"]`, claims `iss=client_email`, `scope="https://www.googleapis.com/auth/drive.readonly"`, `aud=token_uri`, `iat`, `exp=iat+3600`; POST `token_uri` with `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`; cache until 60s before expiry.
  - List: `GET https://www.googleapis.com/drive/v3/files` with `q="'{folder}' in parents and trashed=false"`, `fields="nextPageToken,files(id,name,mimeType,modifiedTime,size)"`, `pageSize=200`, `supportsAllDrives=true`, `includeItemsFromAllDrives=true`; follow `nextPageToken`; recurse into subfolders (mime `application/vnd.google-apps.folder`) up to depth 5. `version = modifiedTime`.
  - Download: Google Docs/Sheets/Slides → `/files/{id}/export?mimeType=` docx/xlsx/pptx (name gets that extension); other files → `/files/{id}?alt=media`.
  - Admins share the Drive folder with the service account's email; document that in `.env.example`.

- [ ] **Step 1:** Write `tests/test_connectors.py` with a `FakeSource` (in-memory files) and, for Drive, an `httpx.MockTransport` serving the token, list (two pages + one subfolder) and download endpoints, with a throwaway RSA key (pattern: `tests/test_sso.py`):
  - `test_first_sync_adds_and_queues`: 2 files → `added == 2`, 2 queued jobs with the connector's department and tag.
  - `test_unchanged_files_are_not_redownloaded` (FakeSource counts `download` calls).
  - `test_changed_version_updates_same_document`.
  - `test_removed_at_source_deletes_document`.
  - `test_sync_isolates_bad_files`: one oversized, one `.exe`, one whose download raises → `skipped` has 2, `errors` has 1, the good file is added, `last_status == "partial"`.
  - `test_sync_never_overwrites_manual_upload`: a manual `Policy.pdf` exists → the connector's `Policy.pdf` is stored as `Policy (2).pdf`; the manual file's bytes are unchanged.
  - `test_drive_lists_pages_and_subfolders_and_exports_google_docs`: a Google Doc is downloaded via the export URL with a `.docx` name; the token request is a JWT-bearer grant signed by the test key.
- [ ] **Step 2:** Run → FAIL; generate migration `0007`; implement.
- [ ] **Step 3 — verify:** pytest all pass (no real network calls — assert the mock transport saw every request).
- [ ] **Step 4:** Commit `feat: connector framework and google drive source`.

---

### Task B7: Connector scheduling and admin UI

**Files:**
- Create: `connectors/scheduler.py`, `frontend/src/admin/ConnectorsTab.jsx`
- Modify: `admin.py` (connector routes), `main.py` (start/stop the scheduler in `lifespan`), `config.py` (`CONNECTOR_SYNC_MINUTES = int(os.getenv("CONNECTOR_SYNC_MINUTES", "60"))`, `CONNECTOR_SYNC_ENABLED = os.getenv("CONNECTOR_SYNC_ENABLED", "true") == "true"`), `tests/test_admin.py`

**Interfaces:**
- `ConnectorScheduler` with the same shape as `jobs.Worker` (`start()`, `stop()`, daemon thread, `threading.Event` wait). Every minute it syncs enabled connectors whose `last_sync_at` is older than `CONNECTOR_SYNC_MINUTES`; one connector's exception is logged and doesn't stop the loop. It's started only when both `CONNECTOR_SYNC_ENABLED` and `INGEST_WORKER_ENABLED` are true.
- Admin routes:
  - `GET /admin/connectors`; `POST /admin/connectors` `{kind, name, department, config}` (validate `kind`, department, and the required config keys: Drive `folder_id`; SharePoint `site`, `folder_path`).
  - `PATCH /admin/connectors/{id}` `{name?, department?, enabled?, config?}` (changing department re-enqueues its documents with the new department).
  - `DELETE /admin/connectors/{id}?remove_documents=true|false`.
  - `POST /admin/connectors/{id}/sync` → runs `sync_connector` in a thread executor and returns the `SyncResult` as JSON.
  - Responses never include credentials.
- UI tab: list with status badges (`ok` / `partial` / `failed`, text and colour), last sync time, "Sync now" (button disabled while running, then shows the result counts), add/edit dialog, delete with a "Also remove its documents" checkbox.

- [ ] **Step 1:** Tests: `test_connector_crud_admin_only`; `test_sync_now_returns_counts` (inject a FakeSource via monkeypatched `connectors.base.source_for`); `test_scheduler_syncs_due_connectors_only` (call the scheduler's `tick()` directly with a fixed clock).
- [ ] **Step 2:** Implement; add an e2e step: admin creates a connector with a monkeypatched source in E2E mode (`DOCUMIND_ENV=ci` allows `kind="fake"`), clicks "Sync now" → "1 added".
- [ ] **Step 3 — verify:** pytest, lint, vitest, build, e2e pass.
- [ ] **Step 4:** Commit `feat: scheduled connector sync and admin connectors tab`.

---

### Task B8: SharePoint / OneDrive connector

**Files:**
- Create: `connectors/sharepoint.py`
- Modify: `connectors/base.py` (`source_for` handles `sharepoint`), `config.py` (`SHAREPOINT_CLIENT_ID`, `SHAREPOINT_CLIENT_SECRET`, `SHAREPOINT_TENANT`, each defaulting to the `MICROSOFT_*` value), `.env.example`, `README.md`, `tests/test_connectors.py`

**Interfaces:**
- `SharePointSource(tenant: str, client_id: str, client_secret: str, site: str, folder_path: str, http: httpx.Client | None = None)`; `site` looks like `"contoso.sharepoint.com:/sites/HR"`.
  - Token: POST `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` with `grant_type=client_credentials`, `scope=https://graph.microsoft.com/.default`; cache until expiry.
  - Site id: `GET https://graph.microsoft.com/v1.0/sites/{site}` → `id`.
  - List: `GET https://graph.microsoft.com/v1.0/sites/{site_id}/drive/root:/{folder_path}:/children`; follow `@odata.nextLink`; recurse into items that have `folder` (depth 5); `version = eTag`.
  - Download: `GET https://graph.microsoft.com/v1.0/sites/{site_id}/drive/items/{id}/content` (follow redirects).
- Docs: the app registration needs **application** permission `Sites.Read.All` (or `Sites.Selected`) with admin consent; it can be the same registration as SSO.

- [ ] **Step 1:** Tests with `httpx.MockTransport`: `test_sharepoint_token_list_paginate_recurse_download` (asserts the client-credentials body, two pages, one subfolder, and a 302 → content download); `test_sharepoint_auth_failure_marks_sync_failed` (token endpoint 401 → `sync_connector` result `last_status == "failed"` and `last_error` mentions authentication).
- [ ] **Step 2:** Run → FAIL; implement.
- [ ] **Step 3 — verify:** pytest all pass; `README.md` "Status" table updated for Phase 3; the connector setup steps added to README.
- [ ] **Step 4:** Commit `feat: sharepoint connector`.

---

## After both parts

- Run everything: `ruff check . && python -m pytest tests -q && python eval/eval_runner.py --offline --baseline eval/baseline_ci.json --check`, then `cd frontend && npm run lint && npm test && npm run build && npm run e2e`.
- If any retrieval code changed, ask the user before running the full Groq eval (`python eval/eval_runner.py --check`).
- Update the `README.md` Status table and API reference for the new endpoints.
- Report to the user: what was built, the test and eval results (with numbers), anything not verified (for example the Render deploy or real Drive/SharePoint accounts), and what they need to provide (Render account, Google service-account JSON, SharePoint app permission + admin consent).
