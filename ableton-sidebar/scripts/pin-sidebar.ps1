# Sesh window manager.
#  - Drawer: the Sesh panel docks to the right screen edge; opens/closes on
#    request only (Ctrl+Alt+G, sliver click, UI Hide button).
#  - Direct drag: pulling a sound card in the UI spawns a small ghost label
#    that follows the cursor; releasing over the Ableton window adds the
#    clip to the selected track (Live API insert). Releasing anywhere else
#    cancels. No corner widgets.
#  - Keepalive: revives engine/sidecar via autostart.ps1 if they die.
# Runs hidden; started by autostart.ps1; single instance via mutex.

$mutex = New-Object System.Threading.Mutex($false, 'ACE_Sidebar_Pin')
try { if (-not $mutex.WaitOne(0)) { exit } }
catch [System.Threading.AbandonedMutexException] { <# prior instance killed; we own it #> }

$W = 500      # drawer width
$SLIVER = 10  # visible width when tucked

$LOG = 'D:\ACE-Step-1.5\ableton-sidebar\logs\pinner.log'
function Log([string]$msg) {
    try { Add-Content -Path $LOG -Value ("{0:HH:mm:ss.fff} {1}" -f (Get-Date), $msg) } catch { }
}
Log 'pinner started (direct-drag edition)'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class Win32 {
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hgt, uint flags);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")]
    public static extern bool RegisterHotKey(IntPtr h, int id, uint mods, uint vk);
    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vk);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr h, int cmd);
    public struct RECT { public int L, T, R, B; }
    public struct POINT { public int X, Y; }
}

public class HotkeyWindow : NativeWindow {
    public Action OnHotkey;
    public HotkeyWindow() {
        CreateHandle(new CreateParams());
        Win32.RegisterHotKey(Handle, 1, 0x2 | 0x1, 0x47); // Ctrl+Alt+G
    }
    protected override void WndProc(ref Message m) {
        if (m.Msg == 0x0312 && OnHotkey != null) OnHotkey();
        base.WndProc(ref m);
    }
}
'@ -ReferencedAssemblies System.Windows.Forms

$HWND_TOPMOST = [IntPtr](-1)
$SWP_NOACTIVATE = 0x10
$SWP_SHOWWINDOW = 0x40
$SW_HIDE = 0

$script:expanded = $false
$script:known = [IntPtr]::Zero
$script:clickArmed = $true
$script:lastKeepalive = Get-Date
$script:pollSkip = 0

# drag state
$script:dragActive = $false
$script:dragOutputId = $null

function Get-WorkArea { [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea }

function Find-Panel {
    $h = [Win32]::FindWindow($null, 'Sesh')
    if ($h -eq [IntPtr]::Zero) { $h = [Win32]::FindWindow($null, 'ACE Sidebar') }
    return $h
}

function Find-LiveRect {
    $p = Get-Process | Where-Object { $_.ProcessName -like 'Ableton*' -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if (-not $p) { return $null }
    $r = New-Object Win32+RECT
    if ([Win32]::GetWindowRect($p.MainWindowHandle, [ref]$r)) { return $r }
    return $null
}

# ---------- ghost label that follows the cursor during a drag ----------
$ghost = New-Object System.Windows.Forms.Form
$ghost.FormBorderStyle = 'None'
$ghost.ShowInTaskbar = $false
$ghost.StartPosition = 'Manual'
$ghost.BackColor = [System.Drawing.Color]::FromArgb(28, 28, 26)
$ghost.Size = New-Object System.Drawing.Size(200, 30)
$ghostLabel = New-Object System.Windows.Forms.Label
$ghostLabel.Dock = 'Fill'
$ghostLabel.TextAlign = 'MiddleCenter'
$ghostLabel.Font = New-Object System.Drawing.Font('Segoe UI', 8.5)
$ghostLabel.ForeColor = [System.Drawing.Color]::White
$ghost.Controls.Add($ghostLabel)
$null = $ghost.Handle

function Show-Ghost([string]$name) {
    $n = $name
    if ($n.Length -gt 26) { $n = $n.Substring(0, 24) + '..' }
    $ghostLabel.Text = $n
    Move-Ghost
    # show without stealing focus (focus loss would end the user's gesture)
    [Win32]::SetWindowPos($ghost.Handle, $HWND_TOPMOST, $ghost.Left, $ghost.Top, $ghost.Width, $ghost.Height, ($SWP_NOACTIVATE -bor $SWP_SHOWWINDOW)) | Out-Null
}

function Move-Ghost {
    $p = New-Object Win32+POINT
    [Win32]::GetCursorPos([ref]$p) | Out-Null
    [Win32]::SetWindowPos($ghost.Handle, $HWND_TOPMOST, ($p.X + 14), ($p.Y + 10), $ghost.Width, $ghost.Height, $SWP_NOACTIVATE) | Out-Null
}

function Hide-Ghost { [Win32]::ShowWindow($ghost.Handle, $SW_HIDE) | Out-Null }

function Post-Insert([string]$outputId) {
    try {
        $req = [System.Net.WebRequest]::Create("http://127.0.0.1:8765/api/outputs/$outputId/insert")
        $req.Method = 'POST'
        $req.ContentLength = 0
        $req.Timeout = 3000
        $resp = $req.GetResponse()
        $resp.Close()
        Log "insert ok: $outputId"
        return $true
    } catch {
        Log "insert FAILED: $outputId $($_.Exception.Message)"
        return $false
    }
}

# ---------- drawer ----------
function Set-Drawer([IntPtr]$h, [bool]$open, [bool]$activate) {
    $wa = Get-WorkArea
    $targetX = if ($open) { $wa.Right - $W } else { $wa.Right - $SLIVER }
    $r = New-Object Win32+RECT
    [Win32]::GetWindowRect($h, [ref]$r) | Out-Null
    for ($i = 1; $i -le 4; $i++) {
        $x = [int]($r.L + ($targetX - $r.L) * $i / 4)
        [Win32]::SetWindowPos($h, $HWND_TOPMOST, $x, $wa.Top, $W, $wa.Height, $SWP_NOACTIVATE) | Out-Null
        Start-Sleep -Milliseconds 15
    }
    $script:expanded = $open
    if ($open -and $activate) { [Win32]::SetForegroundWindow($h) | Out-Null }
}

function Poll-WinMgr {
    try {
        $req = [System.Net.WebRequest]::Create('http://127.0.0.1:8765/api/winmgr/poll')
        $req.Timeout = 250
        $resp = $req.GetResponse()
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $body = $reader.ReadToEnd()
        $resp.Close()
        return $body | ConvertFrom-Json
    } catch { return $null }
}

$hot = New-Object HotkeyWindow
$hot.OnHotkey = {
    $h = Find-Panel
    if ($h -ne [IntPtr]::Zero) { Set-Drawer $h (-not $script:expanded) $true }
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 30   # fast: the ghost must track the cursor smoothly
$timer.Add_Tick({
    # ---- active drag: follow cursor, act on release ----
    if ($script:dragActive) {
        $down = ([Win32]::GetAsyncKeyState(0x01) -band 0x8000) -ne 0
        if ($down) {
            Move-Ghost
            return
        }
        # released
        Hide-Ghost
        $script:dragActive = $false
        $p = New-Object Win32+POINT
        [Win32]::GetCursorPos([ref]$p) | Out-Null
        $wa = Get-WorkArea
        $panelW = if ($script:expanded) { $W } else { $SLIVER }
        $overPanel = $p.X -ge ($wa.Right - $panelW)
        $liveRect = Find-LiveRect
        $overLive = $liveRect -and $p.X -ge $liveRect.L -and $p.X -le $liveRect.R -and $p.Y -ge $liveRect.T -and $p.Y -le $liveRect.B
        if ($overLive -and -not $overPanel -and $script:dragOutputId) {
            Post-Insert $script:dragOutputId | Out-Null
        } else {
            Log 'drag released outside Live - cancelled'
        }
        $script:dragOutputId = $null
        return
    }

    # ---- housekeeping at a slower cadence (every ~10th tick) ----
    $script:pollSkip++
    if ($script:pollSkip -lt 10) { return }
    $script:pollSkip = 0

    if (((Get-Date) - $script:lastKeepalive).TotalSeconds -gt 90) {
        $script:lastKeepalive = Get-Date
        Start-Process powershell.exe -WindowStyle Hidden -ArgumentList `
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "$PSScriptRoot\autostart.ps1"
    }

    $cmd = Poll-WinMgr
    if ($cmd -and $cmd.file -and $cmd.outputId) {
        # a card pull just started in the UI; adopt the gesture if the
        # button is still held
        $down = ([Win32]::GetAsyncKeyState(0x01) -band 0x8000) -ne 0
        if ($down) {
            $script:dragActive = $true
            $script:dragOutputId = $cmd.outputId
            Show-Ghost $cmd.name
            Log "drag started: $($cmd.name)"
        }
    }

    $h = Find-Panel
    if ($h -eq [IntPtr]::Zero) { $script:known = [IntPtr]::Zero; return }

    if ($cmd -and $cmd.drawer) {
        $open = switch ($cmd.drawer) {
            'expand' { $true } 'collapse' { $false } default { -not $script:expanded }
        }
        Set-Drawer $h $open $false
    }

    $wa = Get-WorkArea
    if ($h -ne $script:known) {
        [Win32]::SetWindowPos($h, $HWND_TOPMOST, $wa.Right - $SLIVER, $wa.Top, $W, $wa.Height, $SWP_NOACTIVATE) | Out-Null
        $script:known = $h
        $script:expanded = $false
    }

    # Click on the tucked sliver -> expand.
    if (-not $script:expanded) {
        $down = ([Win32]::GetAsyncKeyState(0x01) -band 0x8000) -ne 0
        if ($down -and $script:clickArmed) {
            $p = New-Object Win32+POINT
            [Win32]::GetCursorPos([ref]$p) | Out-Null
            if ($p.X -ge ($wa.Right - $SLIVER) -and $p.Y -ge $wa.Top -and $p.Y -le $wa.Bottom) {
                Set-Drawer $h $true $true
            }
        }
        $script:clickArmed = -not $down
    }
})
$timer.Start()
[System.Windows.Forms.Application]::Run()
