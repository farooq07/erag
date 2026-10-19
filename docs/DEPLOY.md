# Deploying DocuMind

Two supported paths: **Render** (managed, via `render.yaml`) or **your own server** with Docker Compose. Both run the same image.

## What a deployment consists of

| Part | Where it lives | Notes |
|---|---|---|
| Web app + API + ingest worker | one container (`Dockerfile`) | must be **one instance**: the worker runs in-process and the vector index is on local disk |
| Database (users, documents, sessions, audit log) | Postgres | migrations run automatically on startup |
| Uploaded files + vector index | persistent disk at `/app/data` | back this up together with the database |
| Embedding + reranker models | downloaded on first use (~170 MB) | cached in `/home/documind/.cache` |
| Language model | Groq API (or Ollama) | see [quota](#before-real-users) |

## Option A — Render

1. Push the repository to GitHub.
2. Render dashboard → **New → Blueprint** → choose the repository. Render reads `render.yaml` and creates the `documind` web service (Docker, 5 GB disk at `/app/data`) and the `documind-db` Postgres database. `JWT_SECRET` is generated for you; `DATABASE_URL` is wired from the database (`postgres://` URLs are converted automatically).
3. Fill in the variables marked *sync: false* in the service's **Environment** tab:
   - `GROQ_API_KEY`
   - `APP_BASE_URL` and `ALLOWED_ORIGINS` — the public URL, e.g. `https://documind.onrender.com`
   - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` — so password-reset emails are delivered
4. Deploy. The health check is `/readyz` (it checks the database). The first deploy builds the image (~10 min) and seeds the demo users and documents.
5. Verify: `python scripts/smoke_test.py https://<your-url>` should print `OK`.
6. **Change the demo passwords** (or delete the demo users) before inviting anyone: every demo account's password is in the README.

**Not yet verified on a live Render account:** whether the attached disk is writable by the container's non-root user (uid 10001). If uploads fail with "Permission denied", open the service's **Shell** and run `ls -ld /app/data`. If it's owned by root, check Render's current guidance on disk permissions for non-root Docker images rather than switching the container to root.

### Staging

Create a second Blueprint instance from the same repository (Render → New → Blueprint, choose a `staging` branch) with its own database. Point it at a separate Groq key if you have one, so testing doesn't spend production quota.

### Backups

- **Database:** Render Postgres on paid plans takes daily backups with point-in-time recovery (dashboard → database → Recovery). Free databases are deleted after 30 days — don't use them for real data.
- **Disk:** Render takes daily snapshots of persistent disks (dashboard → service → Disks). Restore the disk and the database **to the same point in time**: the database lists documents, the disk holds their files and vectors.

## Option B — your own server (Docker Compose)

```bash
cp .env.example .env              # set GROQ_API_KEY, JWT_SECRET, APP_BASE_URL, ALLOWED_ORIGINS, SMTP_*
docker compose up -d --build      # app on :8000 + Postgres
python scripts/smoke_test.py http://localhost:8000
```

Put a reverse proxy with HTTPS in front (Caddy, nginx, Traefik) and set `COOKIE_SECURE=true`. Data lives in the named volumes `appdata` (files + index), `pgdata` (database) and `models` (model cache). Back up with:

```bash
docker compose exec postgres pg_dump -U documind documind > backup-$(date +%F).sql
docker run --rm -v erag_appdata:/data -v "$PWD":/backup alpine tar czf /backup/appdata-$(date +%F).tgz -C /data .
```

## After changing chunking or embeddings

Re-index every document (keeps departments and tags):

```bash
python ingest.py --reindex                    # local
docker compose exec app python ingest.py --reindex   # compose
```

On Render, run it from the service's **Shell** tab.

## Single sign-on

Register these redirect URIs with Google / Microsoft for the public URL (see README → Single sign-on):

- `https://<your-url>/api/auth/sso/google/callback`
- `https://<your-url>/api/auth/sso/microsoft/callback`

## Before real users

- **Language-model quota.** Groq's free tier allows 1,000 requests and 200,000 tokens per day — about 100 questions for the whole company. Use a paid Groq tier (or another provider) for production; users see a clear "usage limit reached" message when the quota runs out.
- **Secrets.** `JWT_SECRET` must be set (Render generates it). Never commit `.env`.
- **Scaling.** One instance comfortably serves a small team. Running more than one requires moving the ingest worker out of the web process (`INGEST_WORKER_ENABLED=false` + `python -m jobs`) and the vector index off local disk (pgvector — roadmap Phase 1).
