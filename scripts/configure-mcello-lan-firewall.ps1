param(
  [Parameter(Mandatory = $true)]
  [string]$LanAddress,
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$groupName = 'Mcello LAN Demo'

function Test-PrivateIPv4([string]$Value) {
  $parsed = $null
  if (-not [System.Net.IPAddress]::TryParse($Value, [ref]$parsed)) { return $false }
  if ($parsed.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { return $false }
  $bytes = $parsed.GetAddressBytes()
  return $bytes[0] -eq 10 -or
    ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or
    ($bytes[0] -eq 192 -and $bytes[1] -eq 168)
}

if (-not (Test-PrivateIPv4 $LanAddress)) {
  throw 'LanAddress must be an RFC1918 private IPv4 address.'
}

Get-NetFirewallRule -Group $groupName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue

if ($Remove) {
  Write-Host 'Mcello LAN demo firewall rules removed.' -ForegroundColor Green
  exit 0
}

New-NetFirewallRule `
  -DisplayName 'Mcello Demo Web' `
  -Group $groupName `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 80 `
  -LocalAddress $LanAddress `
  -RemoteAddress LocalSubnet `
  -Profile Any | Out-Null

New-NetFirewallRule `
  -DisplayName 'Mcello Demo Supabase Realtime' `
  -Group $groupName `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 54321 `
  -LocalAddress $LanAddress `
  -RemoteAddress LocalSubnet `
  -Profile Any | Out-Null

Write-Host "Mcello LAN demo firewall ready for $LanAddress (TCP 80 + 54321, LocalSubnet only)." -ForegroundColor Green
