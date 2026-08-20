[CmdletBinding()]
param(
    [ValidateSet('readonly', 'query')]
    [string]$Mode = 'readonly',

    [ValidateRange(1024, 65535)]
    [int]$Port = 8000,

    [switch]$Background,
    [switch]$Stop,
    [switch]$DoctorOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-Command {
    param([Parameter(Mandatory)][string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Write-Step {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$CacheDir = Join-Path $RepoRoot '.research-cache/chatgpt-mcp'
$PidFile = Join-Path $CacheDir 'server.pid'
$ProxyPidFile = Join-Path $CacheDir 'proxy.pid'
$StdoutFile = Join-Path $CacheDir 'server.out.log'
$StderrFile = Join-Path $CacheDir 'server.err.log'
$ProxyOutFile = Join-Path $CacheDir 'proxy.out.log'
$ProxyErrFile = Join-Path $CacheDir 'proxy.err.log'
$McpPath = '/mcp'

# Two listeners, and the split is the security boundary.
#
# notebooklm-mcp's tool gating only hides tools from tools/list -- its own source
# says "no tool is unregistered, only hidden", and a live run confirmed it:
# source_list_drive was absent from tools/list and still executed when called by
# name. Every destructive tool was reachable by anything that could speak to the
# port. So the upstream now listens on an internal port that is never tunnelled,
# and the enforcing proxy owns the port ChatGPT reaches.
$UpstreamPort = $Port + 1
$UpstreamUrl = "http://127.0.0.1:$UpstreamPort$McpPath"
$HealthUrl = "http://127.0.0.1:$Port/health"
$McpUrl = "http://127.0.0.1:$Port$McpPath"

Set-Location $RepoRoot

if ($Stop) {
    foreach ($Entry in @(@{ File = $ProxyPidFile; Name = 'allowlist proxy' }, @{ File = $PidFile; Name = 'upstream MCP' })) {
        if (-not (Test-Path $Entry.File)) { continue }
        $EntryPid = (Get-Content $Entry.File -Raw).Trim()
        if ($EntryPid -match '^\d+$') {
            $EntryProcess = Get-Process -Id ([int]$EntryPid) -ErrorAction SilentlyContinue
            if ($null -ne $EntryProcess) {
                Write-Step "Stopping $($Entry.Name) (PID $EntryPid)"
                Stop-Process -Id ([int]$EntryPid) -Force
            }
        }
        Remove-Item $Entry.File -Force -ErrorAction SilentlyContinue
    }
    Write-Host 'Stopped.' -ForegroundColor Green
    exit 0
}

Write-Host 'Doener / ChatGPT ↔ Gemini Notebook bridge' -ForegroundColor Green
Write-Host "Mode: $Mode"
Write-Host "Endpoint: $McpUrl"

foreach ($CommandName in @('nlm', 'notebooklm-mcp')) {
    if (-not (Test-Command $CommandName)) {
        throw "Required command '$CommandName' is missing. Run 'npm run setup:research' first."
    }
}

Write-Step 'Checking Gemini Notebook authentication'
& nlm login --check
if ($LASTEXITCODE -ne 0) {
    throw "Gemini Notebook authentication is not ready. Run 'nlm login' and retry."
}

if ($DoctorOnly) {
    Write-Step 'Running Gemini Notebook diagnostics'
    & nlm doctor
    if ($LASTEXITCODE -ne 0) {
        throw "nlm doctor reported a failure (exit $LASTEXITCODE)."
    }
    exit 0
}

# Fail closed: hide every upstream tool group, then re-enable only the exact
# tools needed by the ChatGPT bridge. This remains effective even if the
# upstream package adds new tools to existing groups.
$env:NOTEBOOKLM_DISABLED_GROUPS = @(
    'notebooks_read',
    'notebooks_manage',
    'sources_read',
    'sources_manage',
    'chat',
    'query_multi',
    'organization',
    'automation',
    'notes',
    'auth',
    'server',
    'sharing',
    'research',
    'studio'
) -join ','

$AllowedTools = @(
    'server_info',
    'notebook_list',
    'notebook_get',
    'notebook_describe',
    'source_describe',
    'source_get_content'
)

if ($Mode -eq 'query') {
    $AllowedTools += @(
        'notebook_query',
        'notebook_query_start',
        'notebook_query_status',
        'chat_list',
        'chat_get',
        'chat_export'
    )
}

$env:NOTEBOOKLM_ENABLED_TOOLS = $AllowedTools -join ','
$env:NOTEBOOKLM_DISABLED_TOOLS = ''

Write-Step 'Configured strict MCP tool allowlist'
Write-Host ($AllowedTools -join ', ')
Write-Host ''
Write-Host 'Security boundary:' -ForegroundColor Yellow
Write-Host '  - binds to 127.0.0.1 only'
Write-Host '  - never set NOTEBOOKLM_ALLOW_EXTERNAL_BIND here'
Write-Host '  - do not expose this endpoint through a raw public tunnel'
Write-Host '  - use an authenticated OpenAI Secure MCP Tunnel when available'

$Executable = (Get-Command notebooklm-mcp).Source
$Arguments = @(
    '--transport', 'http',
    '--host', '127.0.0.1',
    '--port', $UpstreamPort.ToString(),
    '--path', $McpPath
)

if (-not $Background) {
    Write-Step 'Starting local Streamable HTTP MCP in foreground'
    Write-Host "MCP:    $McpUrl"
    Write-Host "Health: $HealthUrl"
    Write-Host 'Press Ctrl+C to stop.'
    Write-Host "Upstream: $UpstreamUrl (internal, never tunnelled)"
    $Upstream = Start-Process -FilePath $Executable -ArgumentList $Arguments -PassThru -WindowStyle Hidden
    try {
        Start-Sleep -Seconds 2
        & node (Join-Path $RepoRoot 'scripts/mcp-allowlist-proxy.mjs') `
            --listen-port $Port --upstream $UpstreamUrl --mode $Mode
    }
    finally {
        Stop-Process -Id $Upstream.Id -Force -ErrorAction SilentlyContinue
    }
    exit $LASTEXITCODE
}

New-Item -ItemType Directory -Path $CacheDir -Force | Out-Null

if (Test-Path $PidFile) {
    $ExistingPid = (Get-Content $PidFile -Raw).Trim()
    if ($ExistingPid -match '^\d+$' -and $null -ne (Get-Process -Id ([int]$ExistingPid) -ErrorAction SilentlyContinue)) {
        throw "A bridge process is already running with PID $ExistingPid. Use -Stop first."
    }
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

Remove-Item $StdoutFile, $StderrFile -Force -ErrorAction SilentlyContinue

Write-Step 'Starting local Streamable HTTP MCP in background'
$StartProcessArgs = @{
    FilePath = $Executable
    ArgumentList = $Arguments
    PassThru = $true
    WindowStyle = 'Hidden'
    RedirectStandardOutput = $StdoutFile
    RedirectStandardError = $StderrFile
}
$Process = Start-Process @StartProcessArgs

Set-Content -Path $PidFile -Value $Process.Id -Encoding ascii

$Ready = $false
for ($Attempt = 0; $Attempt -lt 30; $Attempt++) {
    Start-Sleep -Milliseconds 300

    if ($Process.HasExited) {
        $ErrorText = if (Test-Path $StderrFile) { Get-Content $StderrFile -Raw } else { '' }
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        throw "MCP process exited early with code $($Process.ExitCode). $ErrorText"
    }

    try {
        $Response = Invoke-WebRequest -Uri "http://127.0.0.1:$UpstreamPort/health" -Method Get -TimeoutSec 2
        if ($Response.StatusCode -ge 200 -and $Response.StatusCode -lt 300) {
            $Ready = $true
            break
        }
    }
    catch {
        # Keep polling until timeout; startup can take a few seconds.
    }
}

if (-not $Ready) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    throw "Upstream MCP started but its health endpoint never answered on port $UpstreamPort."
}

# ---- enforcing proxy: the only listener the tunnel is ever pointed at -------
if (Test-Path $ProxyPidFile) {
    $ExistingProxyPid = (Get-Content $ProxyPidFile -Raw).Trim()
    if ($ExistingProxyPid -match '^\d+$' -and $null -ne (Get-Process -Id ([int]$ExistingProxyPid) -ErrorAction SilentlyContinue)) {
        Stop-Process -Id ([int]$ExistingProxyPid) -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $ProxyPidFile -Force -ErrorAction SilentlyContinue
}
Remove-Item $ProxyOutFile, $ProxyErrFile -Force -ErrorAction SilentlyContinue

Write-Step 'Starting allowlist-enforcing proxy'
$Proxy = Start-Process -FilePath (Get-Command node).Source `
    -ArgumentList @((Join-Path $RepoRoot 'scripts/mcp-allowlist-proxy.mjs'),
                    '--listen-port', $Port.ToString(),
                    '--upstream', $UpstreamUrl,
                    '--mode', $Mode) `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $ProxyOutFile -RedirectStandardError $ProxyErrFile
Set-Content -Path $ProxyPidFile -Value $Proxy.Id -Encoding ascii

$ProxyReady = $false
for ($Attempt = 0; $Attempt -lt 30; $Attempt++) {
    Start-Sleep -Milliseconds 300
    if ($Proxy.HasExited) {
        $ProxyError = if (Test-Path $ProxyErrFile) { Get-Content $ProxyErrFile -Raw } else { '' }
        Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
        Remove-Item $PidFile, $ProxyPidFile -Force -ErrorAction SilentlyContinue
        throw "Allowlist proxy exited with code $($Proxy.ExitCode). $ProxyError"
    }
    try {
        $Probe = Invoke-WebRequest -Uri $HealthUrl -Method Get -TimeoutSec 2
        if ($Probe.StatusCode -eq 200) { $ProxyReady = $true; break }
    }
    catch { }
}

if (-not $ProxyReady) {
    Stop-Process -Id $Proxy.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    Remove-Item $PidFile, $ProxyPidFile -Force -ErrorAction SilentlyContinue
    throw "Allowlist proxy started but $HealthUrl never answered."
}

Write-Host ''
Write-Host 'ChatGPT Gemini Notebook MCP ready.' -ForegroundColor Green
Write-Host "Upstream PID: $($Process.Id)  (internal, port $UpstreamPort)"
Write-Host "Proxy PID:    $($Proxy.Id)"
Write-Host "MCP:    $McpUrl"
Write-Host "Health: $HealthUrl"
Write-Host "Mode:   $Mode"
Write-Host ''
Write-Host 'Next: connect this loopback MCP through an authenticated OpenAI Secure MCP Tunnel.'
Write-Host 'Do not replace 127.0.0.1 with 0.0.0.0 and do not use an unauthenticated public tunnel.'
