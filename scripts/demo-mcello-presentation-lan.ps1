param(
  [string]$LanAddress,
  [string]$DemoHost,
  [switch]$ReuseLocalBackend,
  [switch]$NoSslip
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$arguments = @{}
if ($LanAddress) { $arguments.LanAddress = $LanAddress }
if ($DemoHost) { $arguments.DemoHost = $DemoHost }
if ($ReuseLocalBackend) { $arguments.ReuseLocalBackend = $true }
if ($NoSslip) { $arguments.NoSslip = $true }

Write-Host ''
Write-Host '=== Mcello Presentation LAN Wrapper ===' -ForegroundColor Yellow
Write-Host 'Preparing the existing private LAN runtime first; Builder fixtures are installed immediately afterwards.'

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

Write-Host ''
Write-Host '=== BUILDER PRESENTATION READY ===' -ForegroundColor Green
Write-Host 'Use the customer URL printed above and append: ?presentation=mcello&reset=1'
Write-Host 'The presentation URL gives the browser a clean cart and visible demo label.'
Write-Host 'On smartphone/tablet the Builder remains landscape-only; portrait shows the rotate experience.'
