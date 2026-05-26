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

SUPPORTED_EXTS = {".pdf", ".docx", ".doc", ".txt", ".md", ".xlsx", ".pptx"}
