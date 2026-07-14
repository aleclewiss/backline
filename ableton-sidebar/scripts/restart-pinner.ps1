# Stops any running pin-sidebar watcher and starts a fresh one.
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'pin\-sidebar\.ps1' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false }
Start-Sleep -Milliseconds 500
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList `
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "$PSScriptRoot\pin-sidebar.ps1"
