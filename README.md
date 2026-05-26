# 📚 Office RAG — AI Document Assistant

> Chat with your office documents using AI. Ask questions, get instant answers with source citations. Everything runs locally — no data ever leaves your machine.

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-000000?style=for-the-badge)
![Groq](https://img.shields.io/badge/Groq-FF6B35?style=for-the-badge)
![ChromaDB](https://img.shields.io/badge/ChromaDB-7B2D8B?style=for-the-badge)

---

## ✨ Features

| Feature | Description |
|---|---|
| 💬 **Multi-turn Memory** | Remembers context across follow-up questions — ask "tell me more" without repeating yourself |
| ⚡ **Fast Responses** | Powered by Groq's LLM API (llama-3.1-8b-instant) for near-instant streaming answers |
| 🔍 **Hybrid Search** | BM25 keyword + vector search fused via Reciprocal Rank Fusion (RRF) for best of both worlds |
| 📎 **Smart Citations** | Every answer shows expandable source cards with file name, page number, and full chunk text |
| 🧠 **Auto-Summary** | One-click AI summary for each uploaded document — instantly know what's inside |
| 🎙️ **Voice Input** | Speak your questions via the browser's Web Speech API (Chrome/Edge) |
| 🔍 **OCR Support** | Scanned PDFs are detected and processed via Tesseract OCR (graceful fallback if not installed) |
| 📂 **Cross-doc Queries** | Ask questions that span multiple documents simultaneously |
| 🔒 **Privacy First** | Documents never leave your machine. Only small matched text snippets reach Groq |
| 🗂️ **Multi-format** | PDF, Word (.docx/.doc), Excel (.xlsx), PowerPoint (.pptx), Markdown, TXT |
| 🔄 **Deduplication** | Re-uploading unchanged files skips re-ingestion automatically (SHA-256 hash) |
| 🌗 **Beautiful Dark UI** | NexChat-inspired design with black background, indigo accents, icon-only sidebar |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        YOUR MACHINE                         │
│                                                             │
│  ┌──────────────┐      ┌───────────────────────────────┐    │
│  │  React UI    │ ←──► │      FastAPI Backend           │    │
│  │  Port 5173   │      │      Port 8000 (SSE stream)    │    │
│  └──────────────┘      └──────────┬────────────────────┘    │
│                                   │                         │
│              ┌────────────────────┼──────────────┐          │
│              ▼                    ▼              ▼          │
│      ┌──────────────┐  ┌──────────────┐  ┌────────────────┐ │
│      │  ChromaDB    │  │    Ollama    │  │    Uploads     │ │
│      │  (vectors)   │  │ nomic-embed  │  │  (your docs)   │ │
│      └──────────────┘  └──────────────┘  └────────────────┘ │
│              │                                               │
│              ▼  BM25 + Vector → RRF Fusion                  │
└──────────────────────────────┬──────────────────────────────┘
                               │ Only matched text snippets (~500 words)
                               ▼
                      ┌─────────────────┐
                      │   Groq API      │
                      │ llama-3.1-8b    │
                      └─────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React + Vite + Tailwind CSS | Chat UI with streaming |
| **Backend** | FastAPI + Uvicorn | REST API + SSE token streaming |
| **LLM** | Groq (llama-3.1-8b-instant) | Fast AI responses |
| **Embeddings** | nomic-embed-text via Ollama | Local vector generation (768-dim) |
| **Vector Store** | ChromaDB | Semantic similarity search |
| **Keyword Search** | BM25 (rank-bm25) | Keyword + exact match retrieval |
| **Reranking** | Reciprocal Rank Fusion (RRF) | Fuse BM25 + vector results |
| **PDF parsing** | PyMuPDF | Extract text from PDFs |
| **OCR** | Tesseract + pdf2image | Scanned PDF text extraction |
| **Word parsing** | python-docx | Extract text from .docx |
| **Excel parsing** | openpyxl | Extract data from .xlsx |
| **Voice input** | Web Speech API | Browser-native mic transcription |

---

## ⚙️ Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- [Ollama](https://ollama.com/download/windows) installed and running
- Free [Groq API key](https://console.groq.com)
- *(Optional)* [Tesseract OCR](https://github.com/UB-Mannheim/tesseract/wiki) for scanned PDF support

---

### Step 1 — Install Ollama & pull embedding model

Download and install Ollama from https://ollama.com/download/windows, then run:

```powershell
ollama pull nomic-embed-text
```

> `nomic-embed-text` (~274 MB) generates embeddings locally — your documents are **never** sent to any embedding server.

---

### Step 2 — Clone & install Python backend

```powershell
git clone https://github.com/farooq07/erag.git
cd erag

python -m venv .venv
.venv\Scripts\Activate.ps1

pip install -r requirements.txt
```

---

### Step 3 — Configure environment

Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key_here
```

Get your free key at → https://console.groq.com/keys

---

### Step 4 — Install frontend dependencies

```powershell
cd frontend
npm install
```

---

### Step 5 — (Optional) Install Tesseract for OCR

For scanned PDF support, install Tesseract on Windows:
1. Download from https://github.com/UB-Mannheim/tesseract/wiki
2. Install to default path (`C:\Program Files\Tesseract-OCR\`)
3. Also install [Poppler for Windows](https://github.com/oschwartz10612/poppler-windows/releases) and add it to PATH

> Without Tesseract, the app still works — scanned PDFs will simply return less text. Regular PDFs are unaffected.

---

## 🚀 Running the App

You need **two terminals** running simultaneously:

**Terminal 1 — Backend:**
```powershell
cd erag
.venv\Scripts\Activate.ps1
python main.py
```

**Terminal 2 — Frontend:**
```powershell
cd erag/frontend
npm run dev
```

Open your browser at **http://localhost:5173** 🎉

---

## 📖 How to Use

### Uploading Documents
1. Click the **folder icon** in the sidebar or the **+** button
2. Drag & drop or browse to select files (PDF, Word, Excel, PPT, TXT)
3. Files are chunked, embedded and stored locally
4. Click the ✨ **sparkle icon** next to any file to see its AI-generated summary

### Chatting
- Type a question and press **Enter** (or **Shift+Enter** for a new line)
- Click the **mic icon** 🎙️ to use voice input (Chrome/Edge only)
- Ask follow-up questions naturally — context is remembered across the conversation
- Click **"N sources"** under any answer to expand source cards with exact page references

### Example Questions
```
What is the annual leave policy?
How many sick days do employees get?
Summarize the Q3 financial report
What are the working hours and overtime rules?
List all HR policies across all documents
Compare the leave policies in the two uploaded documents
```

---

## 📁 Project Structure

```
erag/
├── main.py              # FastAPI backend — endpoints + SSE streaming
├── rag.py               # Hybrid retrieval (BM25+vector RRF) + LLM chain
├── ingest.py            # Document parsing + OCR + embedding pipeline
├── config.py            # All configuration (models, paths, chunk settings)
├── requirements.txt     # Python dependencies
├── .env                 # API keys — gitignored, never committed
├── data/
│   ├── uploads/         # Your uploaded documents (gitignored)
│   └── chroma_db/       # Local vector index (gitignored)
└── frontend/
    ├── src/
    │   ├── App.jsx                # Root state + API calls + streaming
    │   ├── components/
    │   │   ├── Sidebar.jsx        # File panel + auto-summary + settings
    │   │   ├── ChatPanel.jsx      # Chat UI + voice input + message list
    │   │   └── Message.jsx        # Message bubbles + source citation cards
    │   └── index.css              # Tailwind + custom animations
    ├── package.json
    └── vite.config.js
```

---

## 🔒 Security & Privacy

| What | Where it stays |
|---|---|
| Your uploaded files | On your machine in `data/uploads/` |
| Document embeddings | On your machine in `data/chroma_db/` |
| Text sent to Groq | ~500 words of matched snippets per query only |
| Your Groq API key | In `.env` (gitignored — never committed) |

**For fully offline/sensitive documents**: switch to local-only mode in `config.py`:

```python
LLM_PROVIDER = "ollama"
LLM_MODEL = "qwen2.5:3b"   # or llama3.2, mistral, etc.
```

Then pull the model:
```powershell
ollama pull qwen2.5:3b
```

---

## 🔧 Configuration

Edit `config.py` to customize:

```python
# LLM provider — "groq" (fast) or "ollama" (fully local)
LLM_PROVIDER = "groq"
GROQ_MODEL = "llama-3.1-8b-instant"    # Groq model name
LLM_MODEL = "qwen2.5:3b"               # Ollama fallback model

# Embedding model (must be pulled in Ollama)
EMBED_MODEL = "nomic-embed-text"

# Chunking settings
CHUNK_SIZE = 800       # Characters per chunk
CHUNK_OVERLAP = 120    # Overlap between adjacent chunks
TOP_K = 5              # Number of chunks retrieved per query
```

---

## 🐛 Troubleshooting

**Backend not reachable / "Could not reach backend"**
```powershell
cd erag && .venv\Scripts\Activate.ps1 && python main.py
# Verify it's running at http://localhost:8000/documents
```

**Port 8000 already in use**
```powershell
Get-NetTCPConnection -LocalPort 8000 | Select-Object OwningProcess
Stop-Process -Id <PID> -Force
```

**Ollama not found / embedding errors**
```powershell
ollama list          # Should show nomic-embed-text
ollama serve         # Start Ollama if not running
```

**Groq 404 / model not found**
- Make sure `GROQ_API_KEY` is set in `.env`
- Valid Groq model names: `llama-3.1-8b-instant`, `llama-3.3-70b-versatile`, `mixtral-8x7b-32768`
- You can change the model live in the **Settings** panel in the sidebar

**Voice input not working**
- Voice requires Chrome or Edge (Firefox doesn't support Web Speech API)
- Allow microphone permissions when the browser prompts

**OCR not working on scanned PDFs**
- Install Tesseract from https://github.com/UB-Mannheim/tesseract/wiki
- Install Poppler and add its `bin/` folder to your system PATH
- Without these, scanned PDFs fall back to PyMuPDF (may return empty text)

**Slow responses**
- Use the smallest Groq model: `llama-3.1-8b-instant`
- Reduce `TOP_K` in `config.py` (e.g. `TOP_K = 3`)

---

## 📄 License

MIT License — free to use, modify and distribute.

---

<div align="center">
  Built with ❤️ using React · FastAPI · Groq · Ollama · ChromaDB
</div>
