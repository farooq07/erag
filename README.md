# 📚 Office RAG — AI Document Assistant

> Chat with your office documents using AI. Ask questions, get instant answers with source citations. Everything runs locally — no data ever leaves your machine.

![Stack](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-000000?style=for-the-badge)
![Groq](https://img.shields.io/badge/Groq-FF6B35?style=for-the-badge)

---

## ✨ Features

- 💬 **Chat with documents** — Ask natural language questions about your PDFs, Word docs, Excel files, PPTs and TXT files
- ⚡ **Fast responses** — Powered by Groq's LLM API (llama-3.1-8b-instant) for near-instant answers
- 🔒 **Privacy first** — Documents never leave your machine. Only small matched text snippets reach Groq
- 📎 **Source citations** — Every answer shows which file and page it came from
- 🔄 **Smart deduplication** — Re-uploading unchanged files skips re-ingestion automatically
- 🗂️ **Multi-format support** — PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), Markdown, TXT
- 🌗 **Beautiful dark UI** — NexChat-inspired design with indigo accents

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    YOUR MACHINE                         │
│                                                         │
│  ┌──────────────┐      ┌─────────────────────────────┐  │
│  │  React UI    │ ←──► │   FastAPI Backend           │  │
│  │  Port 5173   │      │   Port 8000                 │  │
│  └──────────────┘      └──────────┬──────────────────┘  │
│                                   │                     │
│              ┌────────────────────┼──────────────┐      │
│              ▼                    ▼              ▼      │
│      ┌──────────────┐  ┌─────────────┐  ┌─────────────┐ │
│      │  ChromaDB    │  │   Ollama    │  │  Uploads    │ │
│      │  (vectors)   │  │ (embeddings)│  │  (your docs)│ │
│      └──────────────┘  └─────────────┘  └─────────────┘ │
└──────────────────────────────────┬──────────────────────┘
                                   │ Only text snippets
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
| **Frontend** | React + Vite + Tailwind CSS | Chat UI |
| **Backend** | FastAPI + Uvicorn | REST API + SSE streaming |
| **LLM** | Groq (llama-3.1-8b-instant) | Fast AI responses |
| **Embeddings** | nomic-embed-text via Ollama | Local vector generation |
| **Vector Store** | ChromaDB | Semantic document search |
| **PDF parsing** | PyMuPDF | Extract text from PDFs |
| **Word parsing** | python-docx | Extract text from .docx |
| **Excel parsing** | openpyxl | Extract text from .xlsx |

---

## ⚙️ Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- [Ollama](https://ollama.com/download/windows) installed
- Free [Groq API key](https://console.groq.com)

---

### Step 1 — Install Ollama & pull embedding model

Download Ollama from https://ollama.com/download/windows, install it, then run:

```powershell
ollama pull nomic-embed-text
```

> **Note:** `nomic-embed-text` (~274 MB) handles local embeddings. Your documents are embedded on your machine — never sent to any server.

---

### Step 2 — Python backend

```powershell
# Clone the repo
git clone https://github.com/farooq07/erag.git
cd erag

# Create virtual environment
python -m venv .venv
.venv\Scripts\Activate.ps1

# Install dependencies
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

### Step 4 — React frontend

```powershell
cd frontend
npm install
```

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

1. **Upload documents** — Click the folder icon in the sidebar → drag and drop or click to browse
2. **Ingest** — Files are automatically chunked, embedded and stored locally
3. **Ask questions** — Type your question in the chat input and press Enter
4. **View sources** — Click "N sources" under any answer to see the exact file and page

### Example questions
```
What is the annual leave policy?
How many sick days do employees get?
Summarize the Q3 financial report
What are the office working hours?
List all HR policies mentioned in the documents
```

---

## 📁 Project Structure

```
erag/
├── main.py              # FastAPI backend (API + streaming)
├── rag.py               # Retrieval + Groq LLM chain
├── ingest.py            # Document parsing + embedding pipeline
├── config.py            # Configuration (models, paths, settings)
├── requirements.txt     # Python dependencies
├── .env                 # API keys (gitignored)
├── data/
│   ├── uploads/         # Your uploaded documents (gitignored)
│   └── chroma_db/       # Vector index (gitignored)
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── components/
    │   │   ├── Sidebar.jsx     # File upload + navigation
    │   │   ├── ChatPanel.jsx   # Chat interface
    │   │   └── Message.jsx     # Message bubbles + sources
    │   └── index.css
    ├── package.json
    └── vite.config.js
```

---

## 🔒 Security & Privacy

| What | Where it goes |
|---|---|
| Your PDF/Word/Excel files | Stays on your machine in `data/uploads/` |
| Document embeddings | Stays on your machine in `data/chroma_db/` |
| Text chunks sent to Groq | ~500 words per query (matched snippets only) |
| Your API key | Stays in `.env` file (gitignored) |

**For highly sensitive documents** (legal, medical, classified): switch to local-only mode by setting `LLM_PROVIDER = "ollama"` in `config.py` and pulling a local model:

```powershell
ollama pull qwen2.5:3b
```

---

## 🔧 Configuration

Edit `config.py` to customize:

```python
# Switch between Groq (fast) and Ollama (local-only)
LLM_PROVIDER = "groq"          # "groq" or "ollama"
GROQ_MODEL = "llama-3.1-8b-instant"   # Groq model name
LLM_MODEL = "qwen2.5:3b"       # Ollama fallback model

# Chunking settings
CHUNK_SIZE = 800               # Characters per chunk
CHUNK_OVERLAP = 120            # Overlap between chunks
TOP_K = 5                      # Number of chunks retrieved per query
```

---

## 🐛 Troubleshooting

**Backend not reachable**
```powershell
# Make sure backend is running
cd erag && .venv\Scripts\Activate.ps1 && python main.py
```

**Ollama not found**
```powershell
# Check Ollama is running
ollama list
# Should show nomic-embed-text
```

**Groq 404 model not found**
- Make sure `GROQ_API_KEY` is set in `.env`
- Use valid Groq model names: `llama-3.1-8b-instant`, `llama-3.3-70b-versatile`, `mixtral-8x7b-32768`

**Slow responses**
- Switch to a smaller Groq model: `llama-3.1-8b-instant` (fastest)
- Or reduce `TOP_K` in `config.py` to retrieve fewer chunks

---

## 📄 License

MIT License — free to use, modify and distribute.

---

<div align="center">
  Built with ❤️ using React, FastAPI, Groq & Ollama
</div>
