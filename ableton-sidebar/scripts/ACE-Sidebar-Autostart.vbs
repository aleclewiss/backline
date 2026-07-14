' Launches autostart.ps1 completely hidden (no console flash at login).
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""D:\ACE-Step-1.5\ableton-sidebar\scripts\autostart.ps1""", 0, False
