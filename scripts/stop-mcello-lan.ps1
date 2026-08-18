param(
  [Parameter(Mandatory = $true)]
  [string]$LanAddress
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not $IsWindows) {
  throw 'The Mcello LAN cleanup command targets Windows.'
}
if (-not (Test-IsAdministrator)) {
  throw 'Start PowerShell 7 as Administrator to remove the temporary Mcello LAN firewall rules.'
}

Push-Location $repoRoot
try {
  Write-Host 'Stopping Mcello LAN presentation proxy...' -ForegroundColor Cyan
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'scripts[\\/]mcello-lan-proxy\.mjs' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

  Write-Host 'Removing temporary LAN firewall rules...' -ForegroundColor Cyan
  & "$PSScriptRoot/configure-mcello-lan-firewall.ps1" -LanAddress $LanAddress -Remove

  Write-Host 'Stopping disposable local Supabase stack...' -ForegroundColor Cyan
  npx --yes supabase@latest stop --no-backup

  Write-Host ''
  Write-Host 'Mcello LAN demo network exposure is closed.' -ForegroundColor Green
  Write-Host 'If the separate Mcello preview PowerShell window is still open, close it manually.'
  Write-Host 'You can now turn off Windows Mobile Hotspot.'
} finally {
  Pop-Location
}
