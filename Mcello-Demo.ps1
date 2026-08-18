param(
  [string]$Workspace = 'C:\AI\Doener',
  [ValidateSet('Menu', 'Prepare', 'Desktop', 'Lan')]
  [string]$Mode = 'Menu'
)

$ErrorActionPreference = 'Stop'
$RepositoryUrl = 'https://github.com/MaximilianGardiewski/Doener.git'

function Write-BootstrapStatus([string]$Label, [string]$Message, [ConsoleColor]$Color = [ConsoleColor]::Gray) {
  Write-Host ('[{0,-10}] {1}' -f $Label, $Message) -ForegroundColor $Color
}

function Refresh-ProcessPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Require-Winget {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'winget wurde nicht gefunden. Installiere/aktualisiere zuerst den Microsoft App Installer und starte Mcello-Demo.ps1 danach erneut.'
  }
}

function Install-WingetPackage([string]$Id, [string]$Name) {
  Require-Winget
  Write-BootstrapStatus 'INSTALL' "$Name fehlt und wird jetzt über winget installiert ..." Yellow
  & winget install --id $Id -e --accept-package-agreements --accept-source-agreements --silent
  if ($LASTEXITCODE -ne 0) {
    throw "$Name konnte über winget nicht installiert werden (Exit $LASTEXITCODE)."
  }
  Refresh-ProcessPath
}

if ($env:OS -ne 'Windows_NT') {
  throw 'Mcello-Demo.ps1 ist für Windows 11 / PowerShell ausgelegt.'
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor DarkGray
Write-Host ' MCELLO DEMO BOOTSTRAP' -ForegroundColor Yellow
Write-Host ' richtet PowerShell/Git/Repo ein und startet das Control Center' -ForegroundColor Gray
Write-Host '============================================================' -ForegroundColor DarkGray
Write-Host ''

if ($PSVersionTable.PSVersion.Major -lt 7) {
  if (-not (Get-Command pwsh -ErrorAction SilentlyContinue)) {
    Install-WingetPackage 'Microsoft.PowerShell' 'PowerShell 7'
  }
  $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
  if (-not $pwsh) {
    throw 'PowerShell 7 wurde installiert, ist aber in dieser Sitzung noch nicht auffindbar. Terminal schließen und Mcello-Demo.ps1 erneut starten.'
  }
  Write-BootstrapStatus 'RESTART' 'Starte das Bootstrap automatisch unter PowerShell 7 neu ...' Cyan
  $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-Workspace', $Workspace, '-Mode', $Mode)
  & $pwsh.Source @arguments
  exit $LASTEXITCODE
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Install-WingetPackage 'Git.Git' 'Git'
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git ist nach der Installation noch nicht verfügbar. Terminal schließen und erneut starten.'
}
Write-BootstrapStatus 'OK' "Git: $((git --version) -join '')" Green

$Workspace = [IO.Path]::GetFullPath($Workspace)
$parent = Split-Path -Parent $Workspace
if (-not (Test-Path $parent)) {
  Write-BootstrapStatus 'FOLDER' "Erstelle Basisordner $parent" Cyan
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
}

if (-not (Test-Path $Workspace)) {
  Write-BootstrapStatus 'CLONE' "Klone Doener nach $Workspace ..." Cyan
  & git clone $RepositoryUrl $Workspace
  if ($LASTEXITCODE -ne 0) { throw "git clone ist mit Exit $LASTEXITCODE fehlgeschlagen." }
} elseif (-not (Test-Path (Join-Path $Workspace '.git'))) {
  $entries = @(Get-ChildItem -LiteralPath $Workspace -Force -ErrorAction SilentlyContinue)
  if ($entries.Count -gt 0) {
    throw "Der Zielordner $Workspace existiert, ist aber kein Git-Repository und nicht leer. Ich lösche dort bewusst nichts."
  }
  Write-BootstrapStatus 'CLONE' 'Zielordner ist leer; klone Doener ...' Cyan
  & git clone $RepositoryUrl $Workspace
  if ($LASTEXITCODE -ne 0) { throw "git clone ist mit Exit $LASTEXITCODE fehlgeschlagen." }
} else {
  Write-BootstrapStatus 'OK' "Repository vorhanden: $Workspace" Green
}

$controlCenter = Join-Path $Workspace 'scripts\demo-mcello-control-center.ps1'
if (-not (Test-Path $controlCenter)) {
  Write-BootstrapStatus 'UPDATE' 'Control Center fehlt lokal. Aktualisiere main einmal per Fast-Forward ...' Cyan
  Push-Location $Workspace
  try {
    & git fetch origin main
    if ($LASTEXITCODE -ne 0) { throw 'git fetch origin main ist fehlgeschlagen.' }
    & git switch main
    if ($LASTEXITCODE -ne 0) { throw 'git switch main ist fehlgeschlagen.' }
    & git pull --ff-only origin main
    if ($LASTEXITCODE -ne 0) { throw 'git pull --ff-only origin main ist fehlgeschlagen.' }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path $controlCenter)) {
  throw "Control Center wurde im Repository nicht gefunden: $controlCenter"
}

Write-BootstrapStatus 'START' "Öffne Mcello Control Center ($Mode) ..." Cyan
& $controlCenter -Workspace $Workspace -Mode $Mode
exit $LASTEXITCODE
