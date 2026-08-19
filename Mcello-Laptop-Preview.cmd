@echo off
setlocal
cd /d "%~dp0"

echo.
echo ===============================================
echo   MCELLO LAPTOP PREVIEW
echo ===============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [FEHLER] Node.js wurde nicht gefunden.
  echo Mcello benoetigt Node.js 22 oder neuer.
  echo Installiere Node.js und starte diese Datei danach erneut.
  echo.
  pause
  exit /b 1
)

node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"
if errorlevel 1 (
  echo [FEHLER] Deine Node.js-Version ist zu alt.
  node --version
  echo Benoetigt wird Node.js 22 oder neuer.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\gsap\package.json" (
  echo Lokale Abhaengigkeiten fehlen - installiere sie einmalig ...
  call npm install --ignore-scripts --package-lock=false
  if errorlevel 1 (
    echo.
    echo [FEHLER] npm install ist fehlgeschlagen.
    pause
    exit /b 1
  )
)

echo Starte Mcello Configurator Device Lab ...
echo.
call npm run preview:mcello:laptop
set EXIT_CODE=%ERRORLEVEL%

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [FEHLER] Mcello Laptop Preview wurde mit Code %EXIT_CODE% beendet.
  pause
)

exit /b %EXIT_CODE%
