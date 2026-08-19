param(
  [string]$RepoRoot,
  [switch]$NoBrowser,
  [ValidateRange(1024, 65535)]
  [int]$Port = 4173,
  [switch]$SkipInstall,
  [switch]$NoCleanup,
  [switch]$KeepBrowserState
)

$ErrorActionPreference = 'Stop'

function Test-DoenerRepoRoot {
  param([Parameter(Mandatory = $true)][string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
  try {
    $resolved = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
  } catch {
    return $false
  }

  return (Test-Path -LiteralPath (Join-Path $resolved 'package.json')) -and
    (Test-Path -LiteralPath (Join-Path $resolved 'apps\mcello\public\index.html'))
}

function Test-LaptopPreviewReady {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-DoenerRepoRoot -Path $Path)) { return $false }
  if (-not (Test-Path -LiteralPath (Join-Path $Path 'scripts\preview-mcello-laptop.mjs'))) { return $false }

  try {
    $packageJson = Get-Content -LiteralPath (Join-Path $Path 'package.json') -Raw | ConvertFrom-Json
    return [string]$packageJson.scripts.'preview:mcello:laptop' -eq 'node scripts/preview-mcello-laptop.mjs'
  } catch {
    return $false
  }
}

function Resolve-McelloRepoRoot {
  param([string]$ExplicitRoot)

  if ($ExplicitRoot) {
    if (-not (Test-DoenerRepoRoot -Path $ExplicitRoot)) {
      throw "-RepoRoot '$ExplicitRoot' ist kein gültiger Doener/Mcello-Repo-Ordner. Erwartet werden package.json und apps\mcello\public\index.html."
    }
    return (Resolve-Path -LiteralPath $ExplicitRoot).Path
  }

  $candidates = New-Object System.Collections.Generic.List[string]
  $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)

  function Add-Candidate([string]$Candidate) {
    if ([string]::IsNullOrWhiteSpace($Candidate)) { return }
    if ($seen.Add($Candidate)) { $candidates.Add($Candidate) }
  }

  Add-Candidate (Get-Location).Path
  Add-Candidate $PSScriptRoot
  Add-Candidate 'C:\McelloDemo'
  Add-Candidate 'C:\Doener'
  Add-Candidate 'C:\AI\Doener'
  Add-Candidate 'C:\AI\Projects\Doener'
  Add-Candidate 'C:\Codex\Doener'
  Add-Candidate 'C:\Claude Code\Doener'
  if ($env:USERPROFILE) {
    Add-Candidate (Join-Path $env:USERPROFILE 'Doener')
    Add-Candidate (Join-Path $env:USERPROFILE 'source\repos\Doener')
  }

  foreach ($base in @('C:\AI', 'C:\Codex', 'C:\Claude Code')) {
    if (-not (Test-Path -LiteralPath $base)) { continue }
    foreach ($child in @(Get-ChildItem -LiteralPath $base -Directory -ErrorAction SilentlyContinue)) {
      Add-Candidate $child.FullName
      foreach ($grandChild in @(Get-ChildItem -LiteralPath $child.FullName -Directory -ErrorAction SilentlyContinue)) {
        Add-Candidate $grandChild.FullName
      }
    }
  }

  foreach ($candidate in $candidates) {
    if (Test-DoenerRepoRoot -Path $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  throw @"
Kein Doener/Mcello-Repository wurde gefunden.
Das Script darf außerhalb des Repos liegen, benötigt aber den echten Projektordner.

Beispiel:
  .\Mcello-Laptop-Preview.ps1 -RepoRoot 'C:\McelloDemo'

Gesucht wurde u. a. in C:\McelloDemo, C:\AI und C:\Codex.
"@
}

function Require-Command {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Hint
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name wurde nicht gefunden. $Hint"
  }
}

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath wurde mit Exit-Code $LASTEXITCODE beendet."
  }
}

function Get-NodeMajorVersion {
  $raw = (& node -p "process.versions.node.split('.')[0]")
  if ($LASTEXITCODE -ne 0 -or -not $raw) {
    throw 'Die installierte Node.js-Version konnte nicht gelesen werden.'
  }
  return [int]$raw.Trim()
}

function Get-ListeningProcessIds {
  param([Parameter(Mandatory = $true)][int]$LocalPort)

  if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    return @(
      Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    )
  }

  $pattern = "^\s*TCP\s+\S+:$LocalPort\s+\S+\s+LISTENING\s+(\d+)\s*$"
  $ids = foreach ($line in (& netstat -ano -p tcp 2>$null)) {
    if ($line -match $pattern) { [int]$Matches[1] }
  }
  return @($ids | Sort-Object -Unique)
}

function Stop-StaleMcelloPreview {
  param([Parameter(Mandatory = $true)][int]$LocalPort)

  $listenerIds = @(Get-ListeningProcessIds -LocalPort $LocalPort)
  if ($listenerIds.Count -eq 0) {
    Write-Host "Port $LocalPort ist frei." -ForegroundColor DarkGray
    return
  }

  foreach ($ownerPid in $listenerIds) {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerPid" -ErrorAction SilentlyContinue
    $commandLine = [string]$processInfo.CommandLine
    $looksLikeMcelloPreview = $commandLine -match 'preview-mcello-laptop\.mjs' -or
      ($commandLine -match 'preview:mcello:laptop' -and $commandLine -match 'npm')

    if (-not $looksLikeMcelloPreview) {
      $name = if ($processInfo.Name) { $processInfo.Name } else { 'unbekannter Prozess' }
      throw "Port $LocalPort ist durch $name (PID $ownerPid) belegt. Der Prozess gehört nicht eindeutig zur Mcello Laptop Preview und wird deshalb NICHT beendet. Nutze -Port <andererPort> oder beende ihn manuell."
    }

    Write-Host "Beende alte Mcello Laptop Preview (PID $ownerPid) ..." -ForegroundColor Yellow
    Stop-Process -Id $ownerPid -Force -ErrorAction Stop
  }

  foreach ($attempt in 1..30) {
    if (@(Get-ListeningProcessIds -LocalPort $LocalPort).Count -eq 0) {
      Write-Host "Alter Preview-Prozess entfernt; Port $LocalPort ist wieder frei." -ForegroundColor Green
      return
    }
    Start-Sleep -Milliseconds 100
  }

  throw "Port $LocalPort wurde nach dem Beenden der alten Mcello Preview nicht rechtzeitig freigegeben."
}

function Clear-GeneratedPreviewState {
  param([Parameter(Mandatory = $true)][string]$Root)

  $generatedPaths = @(
    (Join-Path $Root 'dist'),
    (Join-Path $Root '.tmp\mcello-laptop-preview')
  )

  foreach ($target in $generatedPaths) {
    if (-not (Test-Path -LiteralPath $target)) { continue }
    Write-Host "Entferne alten generierten Preview-Stand: $target" -ForegroundColor DarkYellow
    Remove-Item -LiteralPath $target -Recurse -Force
  }

  Write-Host 'Generierte Preview-Ausgaben sind sauber. GSAP-Vendor-Dateien werden beim Build ebenfalls frisch ersetzt.' -ForegroundColor DarkGray
}

$repoRoot = Resolve-McelloRepoRoot -ExplicitRoot $RepoRoot
$deviceLabUrl = "http://127.0.0.1:$Port/configurator-preview.html?presentation=mcello"
$directUrl = "http://127.0.0.1:$Port/?presentation=mcello#bestellen"

Push-Location $repoRoot
try {
  Write-Host ''
  Write-Host '===============================================' -ForegroundColor DarkYellow
  Write-Host '  MCELLO LAPTOP PREVIEW' -ForegroundColor Yellow
  Write-Host '===============================================' -ForegroundColor DarkYellow
  Write-Host ''
  Write-Host "Repository: $repoRoot" -ForegroundColor Green
  Write-Host 'Lokale Read-only Vorschau: Konfigurator + FoodStage + GSAP.' -ForegroundColor Cyan
  Write-Host 'Kein Supabase, Docker, Cloudflare oder Lovable erforderlich.'
  Write-Host ''

  if (-not (Test-LaptopPreviewReady -Path $repoRoot)) {
    throw @"
Das Doener-Repository wurde gefunden, aber die aktuelle Laptop-Preview-Runtime fehlt.
Führe im Repo aus:
  git pull
und starte dieses Script danach erneut.
"@
  }

  Require-Command 'node' 'Installiere Node.js 22 oder neuer.'
  Require-Command 'npm' 'npm wird zusammen mit Node.js installiert.'

  $nodeMajor = Get-NodeMajorVersion
  if ($nodeMajor -lt 22) {
    throw "Node.js $nodeMajor ist zu alt. Mcello benötigt Node.js 22 oder neuer."
  }

  Write-Host "Node.js: $(& node --version)" -ForegroundColor DarkGray

  $gsapPackage = Join-Path $repoRoot 'node_modules\gsap\package.json'
  if (-not (Test-Path -LiteralPath $gsapPackage)) {
    if ($SkipInstall) {
      throw 'Lokale npm-Abhängigkeiten fehlen und -SkipInstall wurde gesetzt.'
    }

    Write-Host "Lokale Abhängigkeiten fehlen - installiere sie einmalig in $repoRoot ..." -ForegroundColor Cyan
    Invoke-Native 'npm' 'install' '--ignore-scripts' '--package-lock=false'
  }

  if (-not $NoCleanup) {
    Write-Host ''
    Write-Host 'Clean Start: räume alte Preview-Reste auf ...' -ForegroundColor Cyan
    Stop-StaleMcelloPreview -LocalPort $Port
    Clear-GeneratedPreviewState -Root $repoRoot
  } else {
    Write-Host 'Cleanup wurde mit -NoCleanup übersprungen.' -ForegroundColor Yellow
  }

  Write-Host ''
  Write-Host 'Starte Mcello Configurator Device Lab ...' -ForegroundColor Green
  Write-Host "Device Lab: $deviceLabUrl"
  Write-Host "Direkt:     $directUrl"
  if ($KeepBrowserState) {
    Write-Host 'Browser-State: behalten (-KeepBrowserState).' -ForegroundColor Yellow
  } else {
    Write-Host 'Browser-State: alter Mcello-Warenkorb + Session-State werden beim ersten Laden zurückgesetzt.' -ForegroundColor DarkGray
  }
  Write-Host ''
  Write-Host 'Beenden: Strg+C oder dieses PowerShell-Fenster schließen.' -ForegroundColor DarkGray
  Write-Host ''

  $previousPort = $env:PORT
  $previousNoBrowser = $env:MCELLO_NO_BROWSER
  $previousResetBrowserState = $env:MCELLO_RESET_BROWSER_STATE
  $env:PORT = [string]$Port
  $env:MCELLO_RESET_BROWSER_STATE = if ($KeepBrowserState) { '0' } else { '1' }

  if ($NoBrowser) {
    $env:MCELLO_NO_BROWSER = '1'
  } else {
    Remove-Item Env:MCELLO_NO_BROWSER -ErrorAction SilentlyContinue
  }

  try {
    Invoke-Native 'npm' 'run' 'preview:mcello:laptop'
  } finally {
    if ($null -eq $previousPort) { Remove-Item Env:PORT -ErrorAction SilentlyContinue } else { $env:PORT = $previousPort }
    if ($null -eq $previousNoBrowser) { Remove-Item Env:MCELLO_NO_BROWSER -ErrorAction SilentlyContinue } else { $env:MCELLO_NO_BROWSER = $previousNoBrowser }
    if ($null -eq $previousResetBrowserState) { Remove-Item Env:MCELLO_RESET_BROWSER_STATE -ErrorAction SilentlyContinue } else { $env:MCELLO_RESET_BROWSER_STATE = $previousResetBrowserState }
  }
} catch {
  Write-Host ''
  Write-Host '[FEHLER] Mcello Laptop Preview konnte nicht gestartet werden.' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host ''
  Write-Host 'Falls das Repo nicht automatisch gefunden wird, nutze z. B.:' -ForegroundColor Yellow
  Write-Host "  .\Mcello-Laptop-Preview.ps1 -RepoRoot 'C:\McelloDemo'" -ForegroundColor Yellow
  exit 1
} finally {
  Pop-Location
}
