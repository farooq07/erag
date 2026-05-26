# Office RAG

Chat with your office documents (PDF, Word, Excel, PPT, TXT).  
Documents are processed **100% locally** — only small text snippets reach Groq's LLM API for fast answers.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Backend | FastAPI + Uvicorn |
| LLM | Groq (llama-3.1-8b-instant) — fast cloud inference |
| Embeddings | nomic-embed-text via Ollama (local) |
| Vector DB | ChromaDB (local files) |
| Doc parsing | PyMuPDF, python-docx, openpyxl |

## Setup

### 1. Install Ollama
Download from https://ollama.com/download/windows, then:
```powershell
ollama pull nomic-embed-text
```

### 2. Get a free Groq API key
Sign up at https://console.groq.com, create a key.

### 3. Python backend
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Create a `.env` file in the root:
```
GROQ_API_KEY=your_key_here
```

### 4. React frontend
```powershell
cd frontend
npm install
```

## Run

**Terminal 1 — Backend:**
```powershell
.venv\Scripts\Activate.ps1
python main.py
```

**Terminal 2 — Frontend:**
```powershell
cd frontend
npm run dev
```

Open **http://localhost:5173**

## Usage

1. Drag PDF / Word / Excel / PPT / TXT into the sidebar
2. Click **Ingest**
3. Ask questions in the chat
4. Click **Sources** under any answer to see which file and page it came from

## Security

- Original documents stay in `data/uploads/` — never uploaded anywhere
- Only ~500 words of matched text per question sent to Groq
- Embeddings and vector index stored locally in `data/chroma_db/`
- `.env` and `data/` are gitignored
