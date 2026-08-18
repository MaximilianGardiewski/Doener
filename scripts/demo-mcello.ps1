param(
  [switch]$NoBrowser,
  [switch]$ReuseLocalBackend
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$publicUrl = 'http://127.0.0.1:4173/?presentation=mcello&reset=1'
$kdsUrl = 'http://127.0.0.1:4173/kds.html'
$opsUrl = 'http://127.0.0.1:4173/ops.html'
$adminUrl = 'http://127.0.0.1:4173/admin.html'
$healthUrl = 'http://127.0.0.1:4173/api/health'

function Require-Command([string]$Name, [string]$Hint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required. $Hint"
  }
}

function Test-McelloHealth {
  try {
    $response = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 2
    return [bool]$response.ok
  } catch {
    return $false
  }
}

Require-Command 'node' 'Install Node.js 22 or newer.'
Require-Command 'npm' 'Install Node.js 22 or newer.'
Require-Command 'docker' 'Install and start Docker Desktop or another Docker-compatible runtime.'
Require-Command 'pwsh' 'PowerShell 7 is recommended for the presentation launcher.'

Push-Location $repoRoot
try {
  Write-Host ''
  Write-Host '=== Mcello Presentation Launcher ===' -ForegroundColor Yellow
  Write-Host 'Local development only. No production deployment and no paid messaging provider will be used.'
  Write-Host ''

  if (-not $ReuseLocalBackend) {
    Write-Host 'Preparing a fresh local Supabase demo state...' -ForegroundColor Cyan
    & "$PSScriptRoot/dev-supabase.ps1"
  } else {
    if (-not (Test-Path '.env.local')) {
      throw 'Cannot reuse the local backend because .env.local is missing. Run without -ReuseLocalBackend first.'
    }
    Write-Host 'Reusing the existing local backend state.' -ForegroundColor Cyan
  }

  Write-Host 'Installing localhost-only Pizza + Döner/Yufka presentation Builder fixtures...' -ForegroundColor Cyan
  node scripts/import-mcello-presentation-builders.mjs

  Write-Host 'Preparing localhost-only presentation shop state...' -ForegroundColor Cyan
  node scripts/prepare-mcello-demo.mjs

  if (-not (Test-McelloHealth)) {
    $escapedRoot = $repoRoot.Replace("'", "''")
    $previewCommand = "Set-Location -LiteralPath '$escapedRoot'; npm run preview:mcello"
    Write-Host 'Starting Mcello preview in a separate PowerShell window...' -ForegroundColor Cyan
    Start-Process -FilePath 'pwsh' -ArgumentList @('-NoExit', '-NoProfile', '-Command', $previewCommand) | Out-Null
  } else {
    Write-Host 'Mcello preview is already responding; keeping the running instance.' -ForegroundColor Cyan
  }

  Write-Host 'Waiting for Mcello health check...' -ForegroundColor Cyan
  $ready = $false
  foreach ($attempt in 1..45) {
    if (Test-McelloHealth) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) {
    throw "Mcello did not become ready at $healthUrl within 45 seconds. Check the preview PowerShell window for errors."
  }

  $health = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 3
  if ($health.backend -ne 'local-supabase-ready') {
    throw "Mcello is running, but the backend reports '$($health.backend)' instead of local-supabase-ready."
  }
  if (-not $health.localKdsStaff) {
    throw 'Mcello is running, but the local KDS staff session is not configured.'
  }

  Write-Host ''
  Write-Host 'Mcello demo is ready.' -ForegroundColor Green
  Write-Host "Customer: $publicUrl"
  Write-Host "KDS:      $kdsUrl"
  Write-Host "Ops:      $opsUrl"
  Write-Host "Admin:    $adminUrl"
  Write-Host ''
  Write-Host 'Local presentation shop state: force_open. This applies only to the disposable localhost Supabase stack.'
  Write-Host 'The customer presentation starts with a clean local cart and keeps a visible presentation-only label.'
  Write-Host 'Presentation Builders: Pizza Mcello toppings + Döner/Yufka sauces (Curry, Knoblauch, Scharf).'
  Write-Host 'Recommended presentation: Customer page -> configure Pizza -> configure Döner/Yufka -> cart -> WhatsApp DEV key -> KDS accept -> Ready -> customer status.'
  Write-Host 'The local DEV key is shown in the checkout. It does not send a real WhatsApp message and never falls back to SMS.'
  Write-Host ''

  if (-not $NoBrowser) {
    Write-Host 'Opening customer presentation and KDS...' -ForegroundColor Cyan
    Start-Process $publicUrl | Out-Null
    Start-Sleep -Milliseconds 700
    Start-Process $kdsUrl | Out-Null
  }

  Write-Host 'After the presentation, close the preview PowerShell window and run:'
  Write-Host '  npx --yes supabase@latest stop'
} finally {
  Pop-Location
}
