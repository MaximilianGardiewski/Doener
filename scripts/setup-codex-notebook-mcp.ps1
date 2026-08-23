[CmdletBinding()]
param(
    [ValidateSet('readonly', 'query')]
    [string]$Mode = 'readonly',

    [ValidateRange(1024, 65535)]
    [int]$Port = 8000,

    [string]$ServerName = 'gemini_notebook',

    [switch]$Remove,
    [switch]$Print
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

<#
  Registers the local Gemini Notebook MCP with Codex local surfaces only.

  Codex CLI, Codex desktop and the IDE extension read %USERPROFILE%\.codex\config.toml
  (or CODEX_HOME). This configuration DOES NOT make an MCP server available to
  ordinary ChatGPT conversations in the ChatGPT desktop/web app.

  ChatGPT must use the dedicated Secure MCP Tunnel / Custom App path documented
  in docs/chatgpt-notebook-mcp.md.

  This script points Codex at the allowlist proxy on $Port, never at the raw
  upstream on $Port + 1.
#>

function Write-Step {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
$ConfigFile = Join-Path $CodexHome 'config.toml'
$McpUrl = "http://127.0.0.1:$Port/mcp"
$Header = "[mcp_servers.$ServerName]"

$Block = @(
    $Header,
    '# Doener / Gemini Notebook bridge -- managed by scripts/setup-codex-notebook-mcp.ps1',
    '# Codex-only registration. This does not expose the server to normal ChatGPT chats.',
    "# Points at the allowlist-enforcing proxy. Never point this at $($Port + 1).",
    "url = `"$McpUrl`"",
    "# mode: $Mode"
) -join "`n"

if ($Print) {
    Write-Host $Block
    exit 0
}

Write-Host 'Doener / Codex ↔ Gemini Notebook MCP registration' -ForegroundColor Green
Write-Host "Config: $ConfigFile"
Write-Host "Server: $ServerName -> $McpUrl"

New-Item -ItemType Directory -Path $CodexHome -Force | Out-Null

$Existing = if (Test-Path $ConfigFile) { Get-Content $ConfigFile -Raw } else { '' }
if ($null -eq $Existing) { $Existing = '' }

$Pattern = "(?ms)^\[mcp_servers\.$([regex]::Escape($ServerName))\].*?(?=^\[|\z)"
$Had = [regex]::IsMatch($Existing, $Pattern)

if ($Remove) {
    if (-not $Had) {
        Write-Host "Nothing to remove: $ServerName is not registered." -ForegroundColor Yellow
        exit 0
    }

    $Updated = [regex]::Replace($Existing, $Pattern, '').TrimEnd() + "`n"
    Set-Content -Path $ConfigFile -Value $Updated -Encoding utf8 -NoNewline
    Write-Host "Removed $ServerName from $ConfigFile" -ForegroundColor Green
    exit 0
}

if ($Had) {
    $Updated = [regex]::Replace($Existing, $Pattern, ($Block + "`n`n"))
    Write-Step "Updating existing [mcp_servers.$ServerName] entry"
}
else {
    $Prefix = if ([string]::IsNullOrWhiteSpace($Existing)) { '' } else { $Existing.TrimEnd() + "`n`n" }
    $Updated = $Prefix + $Block + "`n"
    Write-Step "Adding [mcp_servers.$ServerName] entry"
}

if ((Test-Path $ConfigFile) -and -not (Test-Path "$ConfigFile.doener-backup")) {
    Copy-Item $ConfigFile "$ConfigFile.doener-backup"
    Write-Host "    backup: $ConfigFile.doener-backup"
}

Set-Content -Path $ConfigFile -Value $Updated -Encoding utf8 -NoNewline
Write-Host '    written' -ForegroundColor Green

Write-Host ''
Write-Host 'Registered for Codex.' -ForegroundColor Green
Write-Host ''
Write-Host 'Next:'
Write-Host '  1. Start the bridge:   npm run research:chatgpt:bg'
Write-Host '  2. Restart the Codex surface that should use the MCP server.'
Write-Host "  3. Confirm '$ServerName' exposes only the expected allowlisted tools."
Write-Host ''
Write-Host 'Important: normal ChatGPT chats do NOT read this Codex MCP registration.' -ForegroundColor Yellow
Write-Host 'For ChatGPT use the Secure MCP Tunnel / Custom App flow instead.' -ForegroundColor Yellow
