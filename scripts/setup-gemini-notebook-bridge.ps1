[CmdletBinding()]
param(
    [switch]$InstallUv,
    [switch]$Upgrade,
    [switch]$SkipLogin,
    [switch]$SkipDoctor
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# 0.9.5 was pinned here but is not resolvable: it exists as a GitHub release and
# was never published to PyPI, so `uv tool install notebooklm-mcp-cli==0.9.5`
# fails on any machine without a warm cache. Verified against the PyPI index --
# 0.9.4 and 0.9.6 are present, 0.9.5 and 0.9.7 are absent.
#
# 0.9.13 is the current release. The 14 tool groups and all 43 tool names are
# unchanged since 0.9.4 (checked against the extracted 0.9.13 wheel), so the
# ChatGPT allowlist keeps exactly the same meaning across this bump.
$PinnedVersion = '0.9.13'
$PinnedPackage = "notebooklm-mcp-cli==$PinnedVersion"

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
Set-Location $RepoRoot

Write-Host "Doener / Gemini Notebook research bridge setup" -ForegroundColor Green
Write-Host "Repo: $RepoRoot"
Write-Host "Pinned bridge version for first install: $PinnedVersion"

if (-not (Test-Command 'uv')) {
    if (-not $InstallUv) {
        Write-Host ""
        Write-Host "uv is not installed." -ForegroundColor Yellow
        Write-Host "Install it first with:"
        Write-Host "  winget install --id=astral-sh.uv -e"
        Write-Host ""
        Write-Host "Or rerun this script with -InstallUv to install uv through winget."
        exit 2
    }

    if (-not (Test-Command 'winget')) {
        throw "uv is missing and winget is unavailable. Install uv manually from https://docs.astral.sh/uv/ and rerun."
    }

    Write-Step "Installing uv"
    & winget install --id=astral-sh.uv -e --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "winget failed to install uv (exit $LASTEXITCODE)."
    }

    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')
    if (-not (Test-Command 'uv')) {
        throw "uv was installed but is not visible in this PowerShell process. Open a new PowerShell and rerun the script."
    }
}

$UvToolBin = (& uv tool dir --bin).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($UvToolBin)) {
    throw "Unable to resolve the uv tool executable directory."
}

if (-not (($env:Path -split ';') -contains $UvToolBin)) {
    $env:Path = "$UvToolBin;$env:Path"
}

if (-not (Test-Command 'claude')) {
    Write-Host ""
    Write-Host "Warning: Claude Code was not found on PATH." -ForegroundColor Yellow
    Write-Host "The Gemini package can still be prepared, but the repo subagent is intended for Claude Code."
}

$HasNlm = Test-Command 'nlm'
$HasMcp = Test-Command 'notebooklm-mcp'

if (-not ($HasNlm -and $HasMcp)) {
    Write-Step "Installing Gemini Notebook CLI + MCP $PinnedVersion"
    & uv tool install $PinnedPackage
    if ($LASTEXITCODE -ne 0) {
        throw "uv failed to install $PinnedPackage (exit $LASTEXITCODE)."
    }
}
elseif ($Upgrade) {
    Write-Step "Upgrading Gemini Notebook CLI + MCP to the current release"
    & uv tool upgrade notebooklm-mcp-cli
    if ($LASTEXITCODE -ne 0) {
        throw "uv failed to upgrade notebooklm-mcp-cli (exit $LASTEXITCODE)."
    }
}
else {
    Write-Step "Gemini Notebook CLI + MCP already available"
    & nlm --version
}

if (-not (Test-Command 'nlm') -or -not (Test-Command 'notebooklm-mcp')) {
    throw "Expected commands 'nlm' and 'notebooklm-mcp' are not available after installation."
}

if (-not $SkipLogin) {
    Write-Step "Authenticating Gemini Notebook"
    Write-Host "A browser window may open. Authentication state is stored in your user profile, not in this repository."
    & nlm login
    if ($LASTEXITCODE -ne 0) {
        throw "Gemini Notebook login failed (exit $LASTEXITCODE)."
    }
}

Write-Step "Checking authentication"
& nlm login --check
if ($LASTEXITCODE -ne 0) {
    throw "Gemini Notebook authentication check failed. Run 'nlm login' and retry."
}

if (-not $SkipDoctor) {
    Write-Step "Running Gemini Notebook diagnostics"
    & nlm doctor
    if ($LASTEXITCODE -ne 0) {
        throw "nlm doctor reported a failure (exit $LASTEXITCODE)."
    }
}

Write-Step "Smoke-testing notebook access"
& nlm notebook list
if ($LASTEXITCODE -ne 0) {
    throw "Unable to list Gemini Notebooks (exit $LASTEXITCODE)."
}

Write-Host ""
Write-Host "Bridge ready." -ForegroundColor Green
Write-Host ""
Write-Host "Important:"
Write-Host "  - No project/user MCP entry was added to Claude Code."
Write-Host "  - .claude/agents/research-director.md starts notebooklm-mcp only inside that subagent."
Write-Host "  - Gemini credentials remain outside the repository."
Write-Host ""
Write-Host "Next test from Claude Code in this repo:"
Write-Host '  /gemini-notebook-research Check the current Mcello landscape-only decision with existing notebook evidence; do not implement anything.'
