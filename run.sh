#!/usr/bin/env bash
# ============================================================
#  DocuMind - one-click launcher for macOS / Linux / Git Bash
#  Run:  ./run.sh   then open http://localhost:8000
# ============================================================
set -e
cd "$(dirname "$0")"

echo
echo "===== DocuMind launcher ====="
echo

# 1. Ensure .env exists (needs GROQ_API_KEY)
if [ ! -f ".env" ]; then
    echo "[!] No .env found. Creating from .env.example ..."
    cp .env.example .env
    echo "[!] Edit .env and paste your GROQ_API_KEY, then run again."
    exit 1
fi

# 2. Python deps
echo "[1/3] Installing Python dependencies ..."
pip install -r requirements.txt -q

# 3. Build frontend if needed
if [ ! -f "frontend/dist/index.html" ]; then
    echo "[2/3] Building frontend (first run only) ..."
    (cd frontend && npm install && npm run build)
else
    echo "[2/3] Frontend already built - skipping."
fi

# 4. Launch
echo "[3/3] Starting server ..."
echo
echo "    Open your browser at:  http://localhost:8000"
echo "    Press Ctrl+C to stop."
echo
exec python -m uvicorn main:app --host 0.0.0.0 --port 8000
