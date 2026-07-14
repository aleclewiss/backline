@echo off
REM Launches the Backline desktop app. The app starts the sidecar itself if
REM it isn't running; the sidecar relaunches the ACE-Step engine as needed.
cd /d "%~dp0shell"
start "" npm start
