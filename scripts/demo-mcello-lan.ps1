param(
  [string]$LanAddress,
  [string]$DemoHost,
  [switch]$ReuseLocalBackend,
  [switch]$NoSslip
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$localHealthUrl = 'http://127.0.0.1:4173/api/health'
$proxyPort = 80

function Require-Command([string]$Name, [string]$Hint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required. $Hint"
  }
}

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-PrivateIPv4([string]$Value) {
  $parsed = $null
  if (-not [System.Net.IPAddress]::TryParse($Value, [ref]$parsed)) { return $false }
  if ($parsed.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { return $false }
  $bytes = $parsed.GetAddressBytes()
  return $bytes[0] -eq 10 -or
    ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or
    ($bytes[0] -eq 192 -and $bytes[1] -eq 168)
}

function Find-HotspotAddress {
  $adapters = @(Get-NetAdapter -IncludeHidden -ErrorAction SilentlyContinue | Where-Object {
    $_.Status -eq 'Up' -and $_.InterfaceDescription -match 'Wi-Fi Direct Virtual Adapter'
  })
  foreach ($adapter in $adapters) {
    $addresses = @(Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue)
    foreach ($address in $addresses) {
      if (Test-PrivateIPv4 $address.IPAddress) { return $address.IPAddress }
    }
  }
  return $null
}

function Test-McelloHealth {
  try {
    $response = Invoke-RestMethod -Uri $localHealthUrl -Method Get -TimeoutSec 2
    return [bool]$response.ok
  } catch {
    return $false
  }
}

function Wait-ForHotspotAddress {
  $detected = Find-HotspotAddress
  if ($detected) { return $detected }

  Write-Host 'Windows Mobile Hotspot is not active yet.' -ForegroundColor Yellow
  Write-Host 'Opening Settings. Turn on Mobile hotspot and keep this terminal open.'
  Start-Process 'ms-settings:network-mobilehotspot' | Out-Null
  foreach ($attempt in 1..120) {
    Start-Sleep -Seconds 1
    $detected = Find-HotspotAddress
    if ($detected) { return $detected }
  }
  throw 'No active Windows Mobile Hotspot adapter was detected within 120 seconds. You can also pass -LanAddress manually.'
}

function Resolve-PreferredHost([string]$Address, [string]$RequestedHost) {
  if ($RequestedHost) {
    if ($RequestedHost -notmatch '^[A-Za-z0-9.-]+$' -or $RequestedHost.Contains('..')) {
      throw 'DemoHost must be a plain DNS hostname without protocol, port or path.'
    }
    $resolved = @(Resolve-DnsName -Name $RequestedHost -Type A -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress })
    if (-not ($resolved.IPAddress -contains $Address)) {
      Write-Warning "DemoHost '$RequestedHost' does not currently resolve to hotspot address $Address from this laptop. The direct-IP fallback will still work."
    }
    return $RequestedHost
  }

  if (-not $NoSslip) {
    $magicHost = "mcello.$($Address.Replace('.', '-')).sslip.io"
    $resolved = @(Resolve-DnsName -Name $magicHost -Type A -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress })
    if ($resolved.IPAddress -contains $Address) {
      return $magicHost
    }
  }

  return $Address
}

if (-not $IsWindows) {
  throw 'The Mcello LAN presentation launcher targets Windows 11 Mobile Hotspot.'
}
if (-not (Test-IsAdministrator)) {
  throw 'Start PowerShell 7 as Administrator for the LAN demo. The launcher creates two temporary LocalSubnet firewall rules (TCP 80 and 54321).'
}

Require-Command 'node' 'Install Node.js 22 or newer.'
Require-Command 'npm' 'Install Node.js 22 or newer.'
Require-Command 'docker' 'Install and start Docker Desktop or another Docker-compatible runtime.'
Require-Command 'pwsh' 'PowerShell 7 is required.'
Require-Command 'Resolve-DnsName' 'Windows DNS tools are required.'

Push-Location $repoRoot
try {
  Write-Host ''
  Write-Host '=== Mcello Multi-Device LAN Presentation ===' -ForegroundColor Yellow
  Write-Host 'Laptop = local webspace + hotspot | iPad = Mcello/KDS | phone = customer.'
  Write-Host 'Demo-only. No production deployment, no managed backend and no paid messaging provider.'
  Write-Host ''

  if ($LanAddress) {
    if (-not (Test-PrivateIPv4 $LanAddress)) {
      throw 'LanAddress must be an RFC1918 private IPv4 address.'
    }
  } else {
    $LanAddress = Wait-ForHotspotAddress
  }
  Write-Host "Hotspot/LAN address: $LanAddress" -ForegroundColor Green

  if (-not $ReuseLocalBackend) {
    Write-Host 'Preparing a fresh local Supabase demo state...' -ForegroundColor Cyan
    & "$PSScriptRoot/dev-supabase.ps1"
  } else {
    if (-not (Test-Path '.env.local')) {
      throw 'Cannot reuse the local backend because .env.local is missing. Run without -ReuseLocalBackend first.'
    }
    Write-Host 'Reusing the existing local backend state.' -ForegroundColor Cyan
  }

  Write-Host 'Preparing localhost-only presentation shop state...' -ForegroundColor Cyan
  node scripts/prepare-mcello-demo.mjs

  Write-Host 'Opening only the two LAN ports required by the demo...' -ForegroundColor Cyan
  & "$PSScriptRoot/configure-mcello-lan-firewall.ps1" -LanAddress $LanAddress

  $preferredHost = Resolve-PreferredHost -Address $LanAddress -RequestedHost $DemoHost
  $preferredBaseUrl = "http://$preferredHost"
  $directBaseUrl = "http://$LanAddress"

  if (-not (Test-McelloHealth)) {
    $escapedRoot = $repoRoot.Replace("'", "''")
    $escapedPublicBaseUrl = $preferredBaseUrl.Replace("'", "''")
    $previewCommand = "`$env:MCELLO_PUBLIC_BASE_URL='$escapedPublicBaseUrl'; Set-Location -LiteralPath '$escapedRoot'; npm run preview:mcello"
    Write-Host 'Starting loopback-only Mcello application runtime...' -ForegroundColor Cyan
    Start-Process -FilePath 'pwsh' -ArgumentList @('-NoExit', '-NoProfile', '-Command', $previewCommand) | Out-Null
  } else {
    Write-Host 'Mcello application runtime is already responding; reusing it.' -ForegroundColor Cyan
  }

  Write-Host 'Waiting for Mcello application health...' -ForegroundColor Cyan
  $ready = $false
  foreach ($attempt in 1..45) {
    if (Test-McelloHealth) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) {
    throw "Mcello did not become ready at $localHealthUrl within 45 seconds."
  }

  $health = Invoke-RestMethod -Uri $localHealthUrl -Method Get -TimeoutSec 3
  if ($health.backend -ne 'local-supabase-ready' -or -not $health.localKdsStaff) {
    throw 'Mcello application runtime is up, but local Supabase/KDS staff is not fully ready.'
  }

  $proxyHealthUrl = "http://$LanAddress/__mcello_lan_health"
  $proxyReady = $false
  try {
    $proxyHealth = Invoke-RestMethod -Uri $proxyHealthUrl -Method Get -TimeoutSec 2
    $proxyReady = $proxyHealth.ok -eq $true -and $proxyHealth.mode -eq 'mcello-lan-demo'
  } catch {
    $proxyReady = $false
  }

  if (-not $proxyReady) {
    $escapedRoot = $repoRoot.Replace("'", "''")
    $escapedLanAddress = $LanAddress.Replace("'", "''")
    $proxyCommand = "`$env:MCELLO_LAN_ADDRESS='$escapedLanAddress'; Set-Location -LiteralPath '$escapedRoot'; node scripts/mcello-lan-proxy.mjs"
    Write-Host 'Starting LAN presentation proxy on TCP 80...' -ForegroundColor Cyan
    Start-Process -FilePath 'pwsh' -ArgumentList @('-NoExit', '-NoProfile', '-Command', $proxyCommand) | Out-Null
  }

  foreach ($attempt in 1..30) {
    try {
      $proxyHealth = Invoke-RestMethod -Uri $proxyHealthUrl -Method Get -TimeoutSec 2
      if ($proxyHealth.ok -eq $true -and $proxyHealth.mode -eq 'mcello-lan-demo') {
        $proxyReady = $true
        break
      }
    } catch {
      $proxyReady = $false
    }
    Start-Sleep -Seconds 1
  }
  if (-not $proxyReady) {
    throw "Mcello LAN proxy did not become reachable at $proxyHealthUrl. Check port 80 and the proxy PowerShell window."
  }

  Write-Host ''
  Write-Host '=== PRESENTATION READY ===' -ForegroundColor Green
  Write-Host 'Connect iPad and phone to the Windows Mobile Hotspot.'
  Write-Host ''
  Write-Host 'PHONE / CUSTOMER' -ForegroundColor Yellow
  Write-Host "  $preferredBaseUrl/"
  if ($preferredHost -ne $LanAddress) {
    Write-Host "  Fallback: $directBaseUrl/"
  }
  Write-Host ''
  Write-Host 'IPAD / Mcello STAFF' -ForegroundColor Yellow
  Write-Host "  KDS:   $preferredBaseUrl/kds.html"
  Write-Host "  Ops:   $preferredBaseUrl/ops.html"
  Write-Host "  Admin: $preferredBaseUrl/admin.html"
  Write-Host ''
  Write-Host 'Live path: phone order -> WhatsApp DEV key -> order appears on iPad KDS -> accept -> ready -> phone status updates.'
  Write-Host 'Realtime sessions are rewritten only at the LAN presentation proxy; the Mcello app runtime itself remains bound to 127.0.0.1.'
  Write-Host 'The local Supabase stack remains disposable and the shop is force_open only for this demo.'
  Write-Host ''
  Write-Host 'After the presentation run:'
  Write-Host "  pwsh -NoProfile -File scripts/stop-mcello-lan.ps1 -LanAddress $LanAddress"
} finally {
  Pop-Location
}
