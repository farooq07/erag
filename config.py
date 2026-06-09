import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).parent
DATA_DIR = ROOT / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
CHROMA_DIR = DATA_DIR / "chroma_db"

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)

OLLAMA_BASE_URL = "http://127.0.0.1:11434"
EMBED_MODEL = "nomic-embed-text"

# LLM provider: "groq" or "ollama"
LLM_PROVIDER = "groq"
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = "llama-3.1-8b-instant"   # fast + smart
LLM_MODEL = "qwen2.5:3b"              # fallback if groq off

CHUNK_SIZE = 800
CHUNK_OVERLAP = 120
TOP_K = 5

COLLECTION_NAME = "office_docs"

# ── Advanced retrieval feature flags ────────────────────────────────────
# Toggle each independently. All default ON.
QUERY_REWRITE_ENABLED = True   # LLM rewrites/expands the query before retrieval
HYDE_ENABLED = True            # Hypothetical Document Embeddings for vector search
RERANKER_ENABLED = True        # Cross-encoder reranks fused results
CRAG_ENABLED = True            # Corrective-RAG: filter low-relevance chunks + warn

CRAG_THRESHOLD = 0.3           # Min relevance score (0-1) to keep a chunk
CRAG_MIN_CHUNKS = 2            # Below this many surviving chunks → low-confidence
RERANK_POOL = 10               # How many fused candidates the reranker sees
RERANKER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"

GROUNDING_CHECK_ENABLED = True # Post-gen faithfulness check; adds ~1s after answer

SUPPORTED_EXTS = {".pdf", ".docx", ".doc", ".txt", ".md", ".xlsx", ".pptx"}

# Departments — used to categorise uploads and scope retrieval.
DEPARTMENTS = ["HR", "Accounts", "Finance", "IT", "Legal", "Operations", "General"]
DEFAULT_DEPARTMENT = "General"

# Role-based access — demo users live in users.json next to this file.
# In production this is where SSO / SAML / OAuth identity hooks in.
USERS_FILE = ROOT / "users.json"
