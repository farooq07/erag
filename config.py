import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).parent
DATA_DIR = Path(os.getenv("DOCUMIND_DATA_DIR", ROOT / "data"))
UPLOADS_DIR = DATA_DIR / "uploads"
CHROMA_DIR = DATA_DIR / "chroma_db"

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)

OLLAMA_BASE_URL = "http://127.0.0.1:11434"
EMBED_MODEL = "nomic-embed-text"

# LLM provider: "groq" or "ollama"
LLM_PROVIDER = "groq"
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")   # fast + smart
LLM_MODEL = "qwen2.5:3b"              # fallback if groq off
LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "2"))

CHUNK_SIZE = 800
CHUNK_OVERLAP = 120
TOP_K = 5

COLLECTION_NAME = "office_docs"

# ── Advanced retrieval feature flags ────────────────────────────────────
# Toggle each independently. All default ON.
QUERY_REWRITE_ENABLED = True   # LLM rewrites/expands the query before retrieval
# Off: on the eval set HyDE gave identical retrieval scores but cost one model
# call and ~0.9s per question (see eval/README.md).
HYDE_ENABLED = False           # Hypothetical Document Embeddings for vector search
RERANKER_ENABLED = True        # Cross-encoder reranks fused results
CRAG_ENABLED = True            # Corrective-RAG: filter low-relevance chunks + warn

CRAG_THRESHOLD = 0.3           # Chunks beyond the top CRAG_MIN_CHUNKS need this reranker score (0-1)
CRAG_MIN_CHUNKS = 2            # Always keep this many top-ranked chunks
# Warn "low confidence" when even the best chunk scores below this. On the eval set
# 0.02 flags 4/52 answerable questions and 5/6 unanswerable ones.
CRAG_LOW_CONFIDENCE = 0.02
RERANK_POOL = 20               # How many fused candidates the reranker sees
POOL_PER_RETRIEVER = 5         # Each retriever's top hits always reach the reranker
RERANKER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"

GROUNDING_CHECK_ENABLED = True # Post-gen faithfulness check; adds ~1s after answer

SUPPORTED_EXTS = {".pdf", ".docx", ".doc", ".txt", ".md", ".xlsx", ".pptx"}
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "50")) * 1024 * 1024

# ── Security ─────────────────────────────────────────────────────────────
# Comma-separated list of origins allowed to call the API from a browser.
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:8000,http://localhost:5173").split(",")
    if o.strip()
]

# Models a client may request. Anything else is rejected with 400.
ALLOWED_MODELS = {
    m.strip()
    for m in os.getenv(
        "ALLOWED_MODELS",
        "openai/gpt-oss-20b,openai/gpt-oss-120b,qwen/qwen3.8-27b",
    ).split(",")
    if m.strip()
} | {GROQ_MODEL, LLM_MODEL}

MAX_QUESTION_CHARS = 4000
MAX_HISTORY_TURNS = 20

# Departments — used to categorise uploads and scope retrieval.
DEPARTMENTS = ["HR", "Accounts", "Finance", "IT", "Legal", "Operations", "General"]
DEFAULT_DEPARTMENT = "General"

# Role-based access — demo users live in users.json next to this file.
# In production this is where SSO / SAML / OAuth identity hooks in.
USERS_FILE = ROOT / "users.json"

# ── Post-generation grounding check ─────────────────────────────────────
GROUNDING_CHECK_ENABLED = True

# ── Audit log ────────────────────────────────────────────────────────────
# Legacy JSONL log; imported into the audit_events table on first start.
AUDIT_LOG_PATH = DATA_DIR / "audit.jsonl"

# ── Auth / sessions ──────────────────────────────────────────────────────
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "15"))
REFRESH_TOKEN_DAYS = int(os.getenv("REFRESH_TOKEN_DAYS", "14"))
PASSWORD_RESET_MINUTES = 30
LOCKOUT_THRESHOLD = 5          # failed logins before the account locks
LOCKOUT_MINUTES = 15
# "auto" = Secure cookie only when the request arrived over HTTPS (directly or
# via X-Forwarded-Proto); force with "true"/"false".
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "auto").lower()
# Public URL of the app, used in password-reset emails.
APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:8000").rstrip("/")

# ── Single sign-on (OpenID Connect) ──────────────────────────────────────
# A provider is enabled when both its client id and secret are set. Register
# this redirect URI with the provider:
#   {APP_BASE_URL}/api/auth/sso/<google|microsoft>/callback
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
MICROSOFT_CLIENT_ID = os.getenv("MICROSOFT_CLIENT_ID", "")
MICROSOFT_CLIENT_SECRET = os.getenv("MICROSOFT_CLIENT_SECRET", "")
# Your Entra tenant id (recommended: only your org can sign in), or
# "organizations" / "common" for multi-tenant apps.
MICROSOFT_TENANT = os.getenv("MICROSOFT_TENANT", "organizations")
# Comma-separated email domains allowed to sign in with SSO (empty = any).
SSO_ALLOWED_DOMAINS = {
    d.strip().lower().lstrip("@") for d in os.getenv("SSO_ALLOWED_DOMAINS", "").split(",") if d.strip()
}
# Create an account (Staff, General) on first SSO login. When false, an admin
# must create the user first and SSO only links to it.
SSO_AUTO_SIGNUP = os.getenv("SSO_AUTO_SIGNUP", "true").lower() == "true"

# ── Email (password reset) ───────────────────────────────────────────────
# Without SMTP_HOST, emails are printed to the server log (dev mode).
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "DocuMind <no-reply@localhost>")

# ── Database ─────────────────────────────────────────────────────────────
# SQLite for zero-setup local dev; set a postgresql+psycopg:// URL in production.
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{(DATA_DIR / 'documind.db').as_posix()}")

# ── Background ingestion ─────────────────────────────────────────────────
# Run the ingest worker inside the API process. Set to false when running
# workers separately (`python -m jobs`).
INGEST_WORKER_ENABLED = os.getenv("INGEST_WORKER_ENABLED", "true").lower() == "true"
INGEST_MAX_ATTEMPTS = 3

# ── Demo corpus ──────────────────────────────────────────────────────────
DEMO_DIR = ROOT / "demo"
DEMO_CORPUS = [
    ("HR_Leave_Policy.md",        "HR"),
    ("Finance_Q3_2024_Report.md", "Finance"),
    ("IT_Security_Policy.md",     "IT"),
    ("Legal_NDA_Template.md",     "Legal"),
    ("Operations_SOPs.md",        "Operations"),
    ("Company_Handbook.md",       "General"),
]
