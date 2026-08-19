@echo off
setlocal
cd /d "%~dp0"

where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0Mcello-Laptop-Preview.ps1"
  exit /b %ERRORLEVEL%
)

where powershell >nul 2>nul
if not errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Mcello-Laptop-Preview.ps1"
  exit /b %ERRORLEVEL%
)

echo [FEHLER] PowerShell wurde nicht gefunden.
echo Installiere PowerShell 7 und starte diese Datei danach erneut.
pause
exit /b 1
