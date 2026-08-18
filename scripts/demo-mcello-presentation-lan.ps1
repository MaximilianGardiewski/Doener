param(
  [string]$LanAddress,
  [string]$DemoHost,
  [switch]$ReuseLocalBackend,
  [switch]$NoSslip,
  [switch]$NoOpenHostViews
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$arguments = @{}
if ($LanAddress) { $arguments.LanAddress = $LanAddress }
if ($DemoHost) { $arguments.DemoHost = $DemoHost }
if ($ReuseLocalBackend) { $arguments.ReuseLocalBackend = $true }
if ($NoSslip) { $arguments.NoSslip = $true }

Write-Host ''
Write-Host '=== Mcello Presentation LAN ===' -ForegroundColor Yellow
Write-Host 'Laptop = HOST | Smartphone = CUSTOMER | Tablet = STAFF / ADMIN' -ForegroundColor White
Write-Host 'Der Laptop stellt Runtime, lokales Supabase und LAN-Proxy bereit; Vercel wird nicht verwendet.' -ForegroundColor DarkGray
Write-Host ''
Write-Host 'Preparing the tested private LAN runtime first; Builder fixtures are installed immediately afterwards.'

& "$PSScriptRoot/demo-mcello-lan.ps1" @arguments
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
  throw "Mcello LAN launcher exited with code $LASTEXITCODE."
}

Push-Location $repoRoot
try {
  Write-Host 'Installing localhost-only Pizza + Döner/Yufka presentation Builder fixtures...' -ForegroundColor Cyan
  node scripts/import-mcello-presentation-builders.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "Builder fixture import exited with code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

$hostViews = @(
  [PSCustomObject]@{ Name = 'Customer / Smartphone-Ansicht'; Url = 'http://127.0.0.1:4173/?presentation=mcello&reset=1' },
  [PSCustomObject]@{ Name = 'KDS / Staff'; Url = 'http://127.0.0.1:4173/kds.html' },
  [PSCustomObject]@{ Name = 'Ops / Staff'; Url = 'http://127.0.0.1:4173/ops.html' },
  [PSCustomObject]@{ Name = 'Admin'; Url = 'http://127.0.0.1:4173/admin.html' }
)

Write-Host ''
Write-Host '=== BUILDER PRESENTATION READY ===' -ForegroundColor Green
Write-Host ''
Write-Host 'SMARTPHONE / CUSTOMER' -ForegroundColor Yellow
Write-Host '  Nutze die oben ausgegebene PHONE / CUSTOMER LAN-Adresse und hänge an:'
Write-Host '  ?presentation=mcello&reset=1' -ForegroundColor Cyan
Write-Host ''
Write-Host 'TABLET / STAFF + ADMIN' -ForegroundColor Yellow
Write-Host '  Nutze die oben ausgegebenen KDS-, Ops- und Admin-LAN-Adressen.'
Write-Host ''
Write-Host 'LAPTOP / HOST — ALLE ANSICHTEN' -ForegroundColor Yellow
foreach ($view in $hostViews) {
  Write-Host ("  {0,-30} {1}" -f $view.Name, $view.Url)
}
Write-Host ''
Write-Host 'Smartphone/Tablet Builder: Querformat. Hochformat zeigt die Rotate-Gate, Auswahl bleibt erhalten.' -ForegroundColor DarkGray
Write-Host 'Der Demo-Stack bleibt lokal/disposable. Die spätere Produktion bleibt VPS/Dedicated.' -ForegroundColor DarkGray

if (-not $NoOpenHostViews) {
  Write-Host ''
  Write-Host 'Opening all presentation views on the laptop host...' -ForegroundColor Cyan
  foreach ($view in $hostViews) {
    Start-Process $view.Url | Out-Null
    Start-Sleep -Milliseconds 300
  }
}
