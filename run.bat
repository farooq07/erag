@echo off
REM ============================================================
REM  DocuMind - one-click launcher for Windows
REM  Double-click this file, then open http://localhost:8000
REM ============================================================
setlocal

cd /d "%~dp0"

echo.
echo ===== DocuMind launcher =====
echo.

REM --- 1. Check .env exists (needs your GROQ_API_KEY) ---
if not exist ".env" (
    echo [!] No .env file found. Creating one from .env.example ...
    copy ".env.example" ".env" >nul
    echo [!] Open .env and paste your GROQ_API_KEY, then run this again.
    notepad .env
    pause
    exit /b 1
)

REM --- 2. Install Python deps ---
echo [1/3] Installing Python dependencies ...
pip install -r requirements.txt -q
if errorlevel 1 (
    echo [X] pip install failed. Is Python installed and on PATH?
    pause
    exit /b 1
)

REM --- 3. Always build the frontend (picks up latest code) ---
echo [2/3] Building frontend ...
pushd frontend
call npm install --silent
call npm run build
popd
if errorlevel 1 (
    echo [X] Frontend build failed. Is Node.js installed?
    pause
    exit /b 1
)

REM --- 4. Launch server ---
echo [3/3] Starting server ...
echo.
echo     Open your browser at:  http://localhost:8000
echo     Press Ctrl+C to stop.
echo.
python -m uvicorn main:app --host 0.0.0.0 --port 8000

endlocal
