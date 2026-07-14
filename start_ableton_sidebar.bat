@echo off
REM Launches the ACE-Step engine + the Ableton sidebar sidecar in their own
REM windows. Close the windows to stop them.
cd /d "%~dp0"

REM --- Engine (GTX 1070-safe settings; mirrors .env) ---
start "ACE-Step Engine (8001)" cmd /k ^
 "set ACESTEP_DTYPE=float32&& set ACESTEP_INIT_LLM=false&& set ACESTEP_OFFLOAD_DIT_TO_CPU=true&& set ACESTEP_QUANTIZATION=auto&& .venv\Scripts\python.exe -m acestep.api_server --host 127.0.0.1 --port 8001"

REM --- Sidebar sidecar (serves the UI at http://127.0.0.1:8765) ---
start "ACE Sidebar (8765)" cmd /k ^
 "cd ableton-sidebar\sidecar&& node main.js"

echo.
echo Engine starting on http://127.0.0.1:8001 (first generation loads models ~5 min)
echo Sidebar UI:        http://127.0.0.1:8765
echo.
pause
