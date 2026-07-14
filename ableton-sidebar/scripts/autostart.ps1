# Starts the ACE-Step engine (8001) and the sidebar sidecar (8765) hidden,
# skipping anything already running. Safe to run repeatedly.
# Logs: ableton-sidebar\logs\{engine,sidecar}.{out,err}.log

$root = 'D:\ACE-Step-1.5'
$logs = Join-Path $root 'ableton-sidebar\logs'
New-Item -ItemType Directory -Force $logs | Out-Null

function Test-Port($port) {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $ok = $c.ConnectAsync('127.0.0.1', $port).Wait(1500) -and $c.Connected
        $c.Close()
        return $ok
    } catch { return $false }
}

# --- Sidecar (UI at http://127.0.0.1:8765) ---
if (-not (Test-Port 8765)) {
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if ($node) {
        Start-Process -FilePath $node -ArgumentList 'main.js' `
            -WorkingDirectory (Join-Path $root 'ableton-sidebar\sidecar') `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $logs 'sidecar.out.log') `
            -RedirectStandardError (Join-Path $logs 'sidecar.err.log')
    }
}

# (window manager retired 2026-07-07 — panel is a plain window now)

# --- Engine (http://127.0.0.1:8001) ---
if (-not (Test-Port 8001)) {
    $env:ACESTEP_DTYPE = 'float32'
    $env:ACESTEP_INIT_LLM = 'auto'      # LM enabled: required for realistic sound (HQ mode)
    $env:ACESTEP_LM_OFFLOAD_TO_CPU = 'true'
    $env:ACESTEP_OFFLOAD_DIT_TO_CPU = 'true'
    $env:ACESTEP_QUANTIZATION = 'auto'  # without this: unquantized DiT -> swap-thrash -> 1h loops
    $env:ACESTEP_QUANTIZATION = 'auto'
    Start-Process -FilePath (Join-Path $root '.venv\Scripts\python.exe') `
        -ArgumentList '-m', 'acestep.api_server', '--host', '127.0.0.1', '--port', '8001' `
        -WorkingDirectory $root `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'engine.out.log') `
        -RedirectStandardError (Join-Path $logs 'engine.err.log')
}
