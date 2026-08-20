<#
.SYNOPSIS
    Starts the local Gemini Notebook MCP bridge and connects it to ChatGPT
    through the official OpenAI Secure MCP Tunnel.

.DESCRIPTION
    Two processes have to be alive at once for ChatGPT to see the bridge:

        notebooklm-mcp  (loopback Streamable HTTP on 127.0.0.1:<Port>/mcp)
                |
        tunnel-client run   (outbound to OpenAI; no inbound port is opened)

    This script owns both. The bridge keeps its own PID file via
    start-gemini-notebook-chatgpt-mcp.ps1; the tunnel gets one here, so either
    can be stopped without orphaning the other.

    Secrets never appear in the repository, in a log, in the console or in a
    process argument. The runtime API key is read with -AsSecureString, stored
    DPAPI-encrypted under .research-cache (gitignored, and decryptable only by
    this Windows user on this machine), and handed to the child process through
    its environment only.

.NOTES
    Verified against tunnel-client v0.0.12 (github.com/openai/tunnel-client):
    CONTROL_PLANE_TUNNEL_ID, CONTROL_PLANE_API_KEY and MCP_SERVER_URL are the
    real variable names, and the daemon must stay running for discovery and for
    every tool call.
#>
[CmdletBinding()]
param(
    [ValidateSet('readonly', 'query')]
    [string]$Mode = 'readonly',

    [ValidateRange(1024, 65535)]
    [int]$Port = 8000,

    [switch]$Stop,
    [switch]$DoctorOnly,
    [switch]$Reconfigure
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-Command { param([Parameter(Mandatory)][string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue) }
function Write-Step { param([Parameter(Mandatory)][string]$Message)
    Write-Host ""; Write-Host "==> $Message" -ForegroundColor Cyan }

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $RepoRoot

$CacheDir = Join-Path $RepoRoot '.research-cache/chatgpt-tunnel'
$ConfigFile = Join-Path $CacheDir 'config.json'
$KeyFile = Join-Path $CacheDir 'runtime-key.dpapi'
$PidFile = Join-Path $CacheDir 'tunnel.pid'
$StdoutFile = Join-Path $CacheDir 'tunnel.out.log'
$StderrFile = Join-Path $CacheDir 'tunnel.err.log'

$McpUrl = "http://127.0.0.1:$Port/mcp"
# tunnel-client's own diagnostics listener; default per its documentation.
$TunnelHealthBase = if ($env:HEALTH_LISTEN_ADDR) { "http://$($env:HEALTH_LISTEN_ADDR)" } else { 'http://127.0.0.1:8080' }

# ---------------------------------------------------------------- stop ------
if ($Stop) {
    if (Test-Path $PidFile) {
        $StoredPid = (Get-Content $PidFile -Raw).Trim()
        if ($StoredPid -match '^\d+$') {
            $Process = Get-Process -Id ([int]$StoredPid) -ErrorAction SilentlyContinue
            if ($null -ne $Process) {
                Write-Step "Stopping tunnel-client (PID $StoredPid)"
                Stop-Process -Id ([int]$StoredPid) -Force
            }
        }
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
    else {
        Write-Host 'No tunnel PID file exists.' -ForegroundColor Yellow
    }

    Write-Step 'Stopping local bridge'
    & pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-gemini-notebook-chatgpt-mcp.ps1') -Stop
    Write-Host 'Stopped.' -ForegroundColor Green
    exit 0
}

# ------------------------------------------------------- prerequisites ------
if (-not (Test-Command 'tunnel-client')) {
    throw "tunnel-client is not on PATH. Run 'npm run research:chatgpt:setup' first."
}

New-Item -ItemType Directory -Path $CacheDir -Force | Out-Null

# ------------------------------------------------------------ config -------
# The tunnel id is an identifier, not a secret, so it lives in plain JSON.
$TunnelId = $null
if ((Test-Path $ConfigFile) -and -not $Reconfigure) {
    $TunnelId = (Get-Content $ConfigFile -Raw | ConvertFrom-Json).tunnelId
}

while ([string]::IsNullOrWhiteSpace($TunnelId) -or $TunnelId -notmatch '^tunnel_[0-9a-f]{32}$') {
    if (-not [string]::IsNullOrWhiteSpace($TunnelId)) {
        Write-Host "That does not look like a tunnel id (expected tunnel_ plus 32 hex characters)." -ForegroundColor Yellow
    }
    Write-Host ''
    Write-Host 'Create or open a tunnel at:' -ForegroundColor Yellow
    Write-Host '  https://platform.openai.com/settings/organization/tunnels'
    $TunnelId = (Read-Host 'Tunnel ID').Trim()
}

@{ tunnelId = $TunnelId; mcpUrl = $McpUrl; mode = $Mode } |
    ConvertTo-Json | Set-Content -Path $ConfigFile -Encoding utf8

# ------------------------------------------------------------ secret -------
# ConvertFrom-SecureString uses DPAPI: the ciphertext is bound to this user
# account on this machine, so a copied file is useless elsewhere.
if ((-not (Test-Path $KeyFile)) -or $Reconfigure) {
    Write-Host ''
    Write-Host 'Create a runtime API key (needs Tunnels: Read + Use) at:' -ForegroundColor Yellow
    Write-Host '  https://platform.openai.com/settings/organization/api-keys'
    Write-Host 'Do NOT use an admin key here.' -ForegroundColor Yellow
    $Secure = Read-Host 'Runtime API key' -AsSecureString
    if ($Secure.Length -eq 0) { throw 'No runtime API key entered.' }
    ConvertFrom-SecureString -SecureString $Secure | Set-Content -Path $KeyFile -Encoding ascii
    Write-Host 'Stored encrypted for this user on this machine.' -ForegroundColor Green
}

$SecureKey = Get-Content $KeyFile -Raw | ConvertTo-SecureString
$PlainKey = [System.Net.NetworkCredential]::new('', $SecureKey).Password

try {
    # Child processes inherit this; it is never written to disk or echoed.
    $env:CONTROL_PLANE_TUNNEL_ID = $TunnelId
    $env:CONTROL_PLANE_API_KEY = $PlainKey
    $env:MCP_SERVER_URL = $McpUrl

    if ($DoctorOnly) {
        Write-Step 'tunnel-client doctor'
        & tunnel-client doctor
        exit $LASTEXITCODE
    }

    # ------------------------------------------------------ local bridge ----
    Write-Step "Ensuring the local bridge is running ($Mode)"
    & pwsh -NoProfile -ExecutionPolicy Bypass `
        -File (Join-Path $PSScriptRoot 'start-gemini-notebook-chatgpt-mcp.ps1') `
        -Mode $Mode -Port $Port -Background
    if ($LASTEXITCODE -ne 0) { throw "The local bridge failed to start (exit $LASTEXITCODE)." }

    Write-Step 'Verifying the bridge and its tool allowlist'
    & node (Join-Path $RepoRoot 'scripts/check-chatgpt-notebook-mcp.mjs') --url $McpUrl --mode $Mode
    if ($LASTEXITCODE -ne 0) {
        throw 'The bridge did not pass its own checks. Refusing to expose it through the tunnel.'
    }

    # ----------------------------------------------------------- tunnel -----
    if (Test-Path $PidFile) {
        $ExistingPid = (Get-Content $PidFile -Raw).Trim()
        if ($ExistingPid -match '^\d+$' -and $null -ne (Get-Process -Id ([int]$ExistingPid) -ErrorAction SilentlyContinue)) {
            throw "A tunnel is already running with PID $ExistingPid. Use -Stop first."
        }
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $StdoutFile, $StderrFile -Force -ErrorAction SilentlyContinue

    Write-Step 'Starting tunnel-client'
    $Tunnel = Start-Process -FilePath (Get-Command tunnel-client).Source `
        -ArgumentList @('run') -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $StdoutFile -RedirectStandardError $StderrFile
    Set-Content -Path $PidFile -Value $Tunnel.Id -Encoding ascii

    $Ready = $false
    for ($Attempt = 0; $Attempt -lt 40; $Attempt++) {
        Start-Sleep -Milliseconds 400
        if ($Tunnel.HasExited) {
            $ErrorText = if (Test-Path $StderrFile) { Get-Content $StderrFile -Raw } else { '' }
            Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
            throw "tunnel-client exited with code $($Tunnel.ExitCode). $ErrorText"
        }
        try {
            $Probe = Invoke-WebRequest -Uri "$TunnelHealthBase/readyz" -TimeoutSec 2
            if ($Probe.StatusCode -eq 200) { $Ready = $true; break }
        }
        catch { }
    }

    if (-not $Ready) {
        Stop-Process -Id $Tunnel.Id -Force -ErrorAction SilentlyContinue
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        throw "tunnel-client started but $TunnelHealthBase/readyz never returned 200. See $StderrFile"
    }

    Write-Host ''
    Write-Host 'ChatGPT Gemini Notebook tunnel ready.' -ForegroundColor Green
    Write-Host "  Bridge:     $McpUrl  (mode: $Mode)"
    Write-Host "  Tunnel PID: $($Tunnel.Id)"
    Write-Host "  Diagnostics: $TunnelHealthBase/ui"
    Write-Host "  Logs:       $StdoutFile"
    Write-Host ''
    Write-Host 'Both processes must stay running for ChatGPT to reach the bridge.'
    Write-Host 'Stop both with: npm run research:chatgpt:tunnel:stop'
}
finally {
    # Clear the plaintext key from this process as early as possible.
    $PlainKey = $null
    $env:CONTROL_PLANE_API_KEY = $null
    [System.GC]::Collect()
}
