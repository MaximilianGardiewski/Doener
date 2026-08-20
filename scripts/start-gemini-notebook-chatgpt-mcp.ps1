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
$StdoutFile = Join-Path $CacheDir 'server.out.log'
$StderrFile = Join-Path $CacheDir 'server.err.log'
$McpPath = '/mcp'
$HealthUrl = "http://127.0.0.1:$Port/health"
$McpUrl = "http://127.0.0.1:$Port$McpPath"

Set-Location $RepoRoot

if ($Stop) {
    if (-not (Test-Path $PidFile)) {
        Write-Host 'No ChatGPT Gemini Notebook MCP PID file exists.' -ForegroundColor Yellow
        exit 0
    }

    $StoredPid = (Get-Content $PidFile -Raw).Trim()
    if ($StoredPid -notmatch '^\d+$') {
        Remove-Item $PidFile -Force
        throw 'Invalid PID file removed.'
    }

    $Process = Get-Process -Id ([int]$StoredPid) -ErrorAction SilentlyContinue
    if ($null -ne $Process) {
        Write-Step "Stopping local Gemini Notebook MCP (PID $StoredPid)"
        Stop-Process -Id ([int]$StoredPid) -Force
    }

    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
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
    '--port', $Port.ToString(),
    '--path', $McpPath
)

if (-not $Background) {
    Write-Step 'Starting local Streamable HTTP MCP in foreground'
    Write-Host "MCP:    $McpUrl"
    Write-Host "Health: $HealthUrl"
    Write-Host 'Press Ctrl+C to stop.'
    & $Executable @Arguments
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
$Process = Start-Process \
    -FilePath $Executable \
    -ArgumentList $Arguments \
    -PassThru \
    -WindowStyle Hidden \
    -RedirectStandardOutput $StdoutFile \
    -RedirectStandardError $StderrFile

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
        $Response = Invoke-WebRequest -Uri $HealthUrl -Method Get -TimeoutSec 2
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
    throw "MCP process started but health endpoint did not become ready: $HealthUrl"
}

Write-Host ''
Write-Host 'ChatGPT Gemini Notebook MCP ready.' -ForegroundColor Green
Write-Host "PID:    $($Process.Id)"
Write-Host "MCP:    $McpUrl"
Write-Host "Health: $HealthUrl"
Write-Host "Mode:   $Mode"
Write-Host ''
Write-Host 'Next: connect this loopback MCP through an authenticated OpenAI Secure MCP Tunnel.'
Write-Host 'Do not replace 127.0.0.1 with 0.0.0.0 and do not use an unauthenticated public tunnel.'
