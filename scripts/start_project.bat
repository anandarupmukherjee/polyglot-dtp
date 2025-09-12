@echo off
setlocal

REM Wrapper to start the project on Windows without changing system policy
REM Passes all arguments to the PowerShell script (e.g., -Build)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_project.ps1" %*

endlocal

