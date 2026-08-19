param(
  [switch]$NoBrowser,
  [ValidateRange(1024, 65535)]
  [int]$Port = 4173,
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$deviceLabUrl = "http://127.0.0.1:$Port/configurator-preview.html?presentation=mcello"
$directUrl = "http://127.0.0.1:$Port/?presentation=mcello#bestellen"

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

Push-Location $repoRoot
try {
  Write-Host ''
  Write-Host '===============================================' -ForegroundColor DarkYellow
  Write-Host '  MCELLO LAPTOP PREVIEW' -ForegroundColor Yellow
  Write-Host '===============================================' -ForegroundColor DarkYellow
  Write-Host ''
  Write-Host 'Lokale Read-only Vorschau: Konfigurator + FoodStage + GSAP.' -ForegroundColor Cyan
  Write-Host 'Kein Supabase, Docker, Cloudflare oder Lovable erforderlich.'
  Write-Host ''

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

    Write-Host 'Lokale Abhängigkeiten fehlen - installiere sie einmalig ...' -ForegroundColor Cyan
    Invoke-Native 'npm' 'install' '--ignore-scripts' '--package-lock=false'
  }

  Write-Host ''
  Write-Host 'Starte Mcello Configurator Device Lab ...' -ForegroundColor Green
  Write-Host "Device Lab: $deviceLabUrl"
  Write-Host "Direkt:     $directUrl"
  Write-Host ''
  Write-Host 'Beenden: Strg+C oder dieses PowerShell-Fenster schließen.' -ForegroundColor DarkGray
  Write-Host ''

  $previousPort = $env:PORT
  $previousNoBrowser = $env:MCELLO_NO_BROWSER
  $env:PORT = [string]$Port
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
  }
} catch {
  Write-Host ''
  Write-Host '[FEHLER] Mcello Laptop Preview konnte nicht gestartet werden.' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host ''
  Write-Host 'Tipp: Führe zuerst "git pull" im Doener-Ordner aus und starte das Script danach erneut.' -ForegroundColor Yellow
  exit 1
} finally {
  Pop-Location
}
