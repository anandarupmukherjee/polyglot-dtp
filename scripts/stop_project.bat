@echo off
setlocal

REM Wrapper to stop the project on Windows without changing system policy
REM Passes all arguments to the PowerShell script (e.g., -Clean)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop_project.ps1" %*

endlocal

