<#
.SYNOPSIS
    Idempotent end-to-end setup for the ChatGPT <-> Gemini Notebook bridge.

.DESCRIPTION
    Checks or establishes every local prerequisite, then verifies the result.
    Running it repeatedly is safe: each step detects what is already in place
    and skips it. Nothing is uninstalled, overwritten or reset unless a switch
    explicitly asks for it.

    No secret is printed, logged, passed as a process argument or written
    unencrypted. The runtime API key is captured with -AsSecureString and stored
    DPAPI-encrypted under .research-cache, which .gitignore already excludes.

.PARAMETER InstallTunnelClient
    Download the official OpenAI tunnel-client release for Windows. Off by
    default on purpose: OpenAI publishes no checksum file alongside the release
    archives, so the download cannot be integrity-verified, and installing a
    binary is a decision the operator should make knowingly. The supported
    alternative is the download button on the OpenAI Tunnels settings page.
#>
[CmdletBinding()]
param(
    [ValidateSet('readonly', 'query')]
    [string]$Mode = 'readonly',

    [ValidateRange(1024, 65535)]
    [int]$Port = 8000,

    [switch]$InstallTunnelClient,
    [string]$TunnelClientVersion = 'v0.0.12',
    [switch]$SkipBridgeStart,
    [switch]$Reconfigure
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Script:Failures = @()
function Test-Command { param([Parameter(Mandatory)][string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue) }
function Write-Step { param([Parameter(Mandatory)][string]$Message)
    Write-Host ""; Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok { param([string]$Message) Write-Host "    OK   $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "    WARN $Message" -ForegroundColor Yellow }
function Write-Fail { param([string]$Message)
    Write-Host "    FAIL $Message" -ForegroundColor Red; $Script:Failures += $Message }

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $RepoRoot

$CacheDir = Join-Path $RepoRoot '.research-cache/chatgpt-tunnel'
$ToolsDir = Join-Path $RepoRoot '.research-cache/tools'
$McpUrl = "http://127.0.0.1:$Port/mcp"
$HealthUrl = "http://127.0.0.1:$Port/health"

Write-Host 'Doener / ChatGPT <-> Gemini Notebook setup' -ForegroundColor Green
Write-Host "Repo:  $RepoRoot"
Write-Host "Mode:  $Mode"
Write-Host "MCP:   $McpUrl"

# --------------------------------------------------------- 1. Node/npm -----
Write-Step '1/12  Node.js and npm'
if (Test-Command 'node') {
    $NodeVersion = (& node --version).TrimStart('v')
    if ([int]($NodeVersion.Split('.')[0]) -ge 22) { Write-Ok "node $NodeVersion" }
    else { Write-Fail "node $NodeVersion is too old; this repo requires >= 22" }
}
else { Write-Fail 'node is not installed (https://nodejs.org)' }
if (Test-Command 'npm') { Write-Ok "npm $(& npm --version)" } else { Write-Fail 'npm is not on PATH' }

# ------------------------------------------------------ 2. dependencies ----
Write-Step '2/12  Repository dependencies'
if (Test-Path (Join-Path $RepoRoot 'node_modules')) { Write-Ok 'node_modules present' }
else {
    if (Test-Path (Join-Path $RepoRoot 'package-lock.json')) { & npm ci } else { & npm install }
    if ($LASTEXITCODE -ne 0) { Write-Fail 'dependency install failed' } else { Write-Ok 'dependencies installed' }
}

# ------------------------------------------------- 3. Gemini Notebook ------
Write-Step '3/12  Gemini Notebook MCP (notebooklm-mcp-cli)'
$HaveNlm = Test-Command 'nlm'
$HaveMcp = Test-Command 'notebooklm-mcp'
if ($HaveNlm -and $HaveMcp) { Write-Ok 'nlm and notebooklm-mcp are on PATH' }
else {
    Write-Warn 'not installed; running the shared research setup'
    & pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'setup-gemini-notebook-bridge.ps1')
    if ($LASTEXITCODE -ne 0) { Write-Fail "setup-gemini-notebook-bridge.ps1 failed (exit $LASTEXITCODE)" }
    elseif ((Test-Command 'nlm') -and (Test-Command 'notebooklm-mcp')) { Write-Ok 'installed' }
    else { Write-Fail 'still not on PATH; open a new shell and rerun' }
}

# ------------------------------------------------ 4. Notebook auth ---------
Write-Step '4/12  Gemini Notebook authentication'
if (Test-Command 'nlm') {
    & nlm login --check 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Ok 'authenticated' }
    else { Write-Fail "not authenticated - run 'nlm login' in this shell, then rerun" }
}
else { Write-Fail 'skipped: nlm missing' }

# ----------------------------------------------------- 5. local config ----
Write-Step '5/12  Local configuration'
New-Item -ItemType Directory -Path $CacheDir -Force | Out-Null
New-Item -ItemType Directory -Path $ToolsDir -Force | Out-Null
$GitIgnore = Get-Content (Join-Path $RepoRoot '.gitignore') -Raw
if ($GitIgnore -match '(?m)^\.research-cache/') { Write-Ok '.research-cache is gitignored' }
else { Write-Fail '.research-cache is NOT gitignored - refusing to store secrets there' }

# -------------------------------------------------- 6. tunnel-client ------
Write-Step '6/12  OpenAI tunnel-client'
if (Test-Command 'tunnel-client') { Write-Ok "found: $((Get-Command tunnel-client).Source)" }
elseif (-not $InstallTunnelClient) {
    Write-Warn 'not installed. Two supported options:'
    Write-Host '      a) Download button on https://platform.openai.com/settings/organization/tunnels'
    Write-Host "      b) Rerun with -InstallTunnelClient to fetch $TunnelClientVersion from"
    Write-Host '         https://github.com/openai/tunnel-client/releases'
    Write-Host '      Note: OpenAI publishes no checksum file, so (b) cannot verify integrity.' -ForegroundColor Yellow
    Write-Fail 'tunnel-client missing'
}
else {
    $Asset = "tunnel-client-$TunnelClientVersion-windows-amd64.zip"
    $Url = "https://github.com/openai/tunnel-client/releases/download/$TunnelClientVersion/$Asset"
    $Zip = Join-Path $ToolsDir $Asset
    $Dest = Join-Path $ToolsDir "tunnel-client-$TunnelClientVersion"

    if (-not (Test-Path $Dest)) {
        Write-Host "      downloading $Url"
        Invoke-WebRequest -Uri $Url -OutFile $Zip -UseBasicParsing
        # No upstream checksum exists, so record what we got. A changed hash on a
        # later run means the pinned artifact was replaced -- worth stopping for.
        $Hash = (Get-FileHash -Path $Zip -Algorithm SHA256).Hash
        Set-Content -Path (Join-Path $ToolsDir "$Asset.sha256") -Value $Hash -Encoding ascii
        Write-Host "      SHA256 $Hash"
        Expand-Archive -Path $Zip -DestinationPath $Dest -Force
        Remove-Item $Zip -Force -ErrorAction SilentlyContinue
    }

    $Exe = Get-ChildItem -Path $Dest -Filter 'tunnel-client*.exe' -Recurse | Select-Object -First 1
    if ($null -eq $Exe) { Write-Fail "no tunnel-client executable inside $Dest" }
    else {
        $BinDir = Split-Path $Exe.FullName -Parent
        $UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
        if ($UserPath -notlike "*$BinDir*") {
            [Environment]::SetEnvironmentVariable('Path', "$UserPath;$BinDir", 'User')
            Write-Ok "added to user PATH: $BinDir"
        }
        $env:Path = "$env:Path;$BinDir"
        Write-Ok "tunnel-client ready: $($Exe.FullName)"
    }
}

# --------------------------------------------------- 7. tunnel config -----
Write-Step '7/12  Tunnel configuration'
$ConfigFile = Join-Path $CacheDir 'config.json'
$KeyFile = Join-Path $CacheDir 'runtime-key.dpapi'
if ((Test-Path $ConfigFile) -and (Test-Path $KeyFile) -and -not $Reconfigure) {
    $TunnelId = (Get-Content $ConfigFile -Raw | ConvertFrom-Json).tunnelId
    if ($TunnelId -match '^tunnel_[0-9a-f]{32}$') { Write-Ok 'tunnel id and encrypted runtime key present' }
    else { Write-Fail 'stored tunnel id is malformed - rerun with -Reconfigure' }
}
else {
    Write-Warn 'not configured yet. The start script will ask for it on first run,'
    Write-Host '      or rerun this script with -Reconfigure to set it now.'
}

# --------------------------------------------------- 8. static checks -----
Write-Step '8/12  Tool allowlist (static)'
& node --test (Join-Path $RepoRoot 'tests/chatgpt-notebook-mcp-allowlist.test.mjs') 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) { Write-Ok 'allowlist guards pass' } else { Write-Fail 'allowlist guards FAILED' }

# ----------------------------------------------------- 9. start bridge ----
Write-Step '9/12  Local bridge'
if ($SkipBridgeStart) { Write-Warn 'skipped by -SkipBridgeStart' }
elseif ($Script:Failures.Count -gt 0) { Write-Warn 'skipped: earlier steps failed' }
else {
    & pwsh -NoProfile -ExecutionPolicy Bypass `
        -File (Join-Path $PSScriptRoot 'start-gemini-notebook-chatgpt-mcp.ps1') `
        -Mode $Mode -Port $Port -Background
    if ($LASTEXITCODE -eq 0) { Write-Ok 'bridge started in background' } else { Write-Fail 'bridge failed to start' }
}

# ------------------------------------------------------ 10. healthcheck ---
Write-Step '10/12  Health endpoint'
try {
    $Response = Invoke-WebRequest -Uri $HealthUrl -TimeoutSec 5 -UseBasicParsing
    if ($Response.StatusCode -eq 200) { Write-Ok "$HealthUrl responded 200" } else { Write-Fail "$HealthUrl returned $($Response.StatusCode)" }
}
catch { Write-Fail "$HealthUrl unreachable: $($_.Exception.Message)" }

# ------------------------------------------------- 11. MCP + allowlist ----
Write-Step '11/12  MCP handshake and live tool list'
& node (Join-Path $RepoRoot 'scripts/check-chatgpt-notebook-mcp.mjs') --url $McpUrl --mode $Mode
if ($LASTEXITCODE -eq 0) { Write-Ok 'MCP initialize, tools/list and allowlist verified' }
else { Write-Fail 'MCP checks failed - do not expose this bridge yet' }

# --------------------------------------------------------- 12. doctor -----
Write-Step '12/12  tunnel-client doctor'
if (-not (Test-Command 'tunnel-client')) { Write-Warn 'skipped: tunnel-client not installed' }
elseif (-not (Test-Path $KeyFile)) { Write-Warn 'skipped: tunnel not configured yet' }
else {
    & pwsh -NoProfile -ExecutionPolicy Bypass `
        -File (Join-Path $PSScriptRoot 'start-chatgpt-notebook-tunnel.ps1') -DoctorOnly -Port $Port
    if ($LASTEXITCODE -eq 0) { Write-Ok 'doctor reported no problems' } else { Write-Fail 'doctor reported problems' }
}

# ---------------------------------------------------------- summary -------
Write-Host ''
Write-Host ('-' * 60)
if ($Script:Failures.Count -eq 0) {
    Write-Host 'Setup complete. Everything checked out.' -ForegroundColor Green
    Write-Host ''
    Write-Host 'Start:  npm run research:chatgpt:tunnel'
    Write-Host 'Check:  npm run research:chatgpt:check'
    Write-Host 'Stop:   npm run research:chatgpt:tunnel:stop'
    exit 0
}
Write-Host "Setup incomplete - $($Script:Failures.Count) problem(s):" -ForegroundColor Red
foreach ($Failure in $Script:Failures) { Write-Host "  - $Failure" -ForegroundColor Red }
Write-Host ''
Write-Host 'Fix these and run this script again; it is safe to repeat.' -ForegroundColor Yellow
exit 1
