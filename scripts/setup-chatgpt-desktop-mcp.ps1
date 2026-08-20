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
  Registers the local bridge with the ChatGPT desktop app.

  ChatGPT desktop, Codex CLI and the IDE extension share one Codex host and one
  MCP configuration, and that host accepts a loopback Streamable HTTP server
  directly. ChatGPT *web* does not -- its own documentation says a local MCP
  server cannot be connected directly, which is what the Secure MCP Tunnel is
  for. So this path needs no tunnel, no public URL and no particular plan tier.

  It points at the allowlist proxy on $Port, never at the upstream on $Port + 1:
  the upstream still executes hidden tools when called by name.
#>

function Write-Step { param([Parameter(Mandatory)][string]$Message)
    Write-Host ""; Write-Host "==> $Message" -ForegroundColor Cyan }

$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
$ConfigFile = Join-Path $CodexHome 'config.toml'
$McpUrl = "http://127.0.0.1:$Port/mcp"
$Header = "[mcp_servers.$ServerName]"

$Block = @(
    $Header,
    "# Doener / Gemini Notebook bridge -- managed by scripts/setup-chatgpt-desktop-mcp.ps1",
    "# Points at the allowlist-enforcing proxy. Never point this at $($Port + 1):",
    "# that is the raw upstream, which executes tools it hides from tools/list.",
    "url = `"$McpUrl`"",
    "# mode: $Mode"
) -join "`n"

if ($Print) {
    Write-Host $Block
    exit 0
}

Write-Host 'Doener / ChatGPT desktop (Codex host) MCP registration' -ForegroundColor Green
Write-Host "Config: $ConfigFile"
Write-Host "Server: $ServerName -> $McpUrl"

New-Item -ItemType Directory -Path $CodexHome -Force | Out-Null

$Existing = if (Test-Path $ConfigFile) { Get-Content $ConfigFile -Raw } else { '' }
if ($null -eq $Existing) { $Existing = '' }

# Idempotent by construction: find our own table and replace it wholesale,
# leaving every other table in the file untouched. A TOML table runs until the
# next table header at column 0.
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

# Back up before the first edit: this file belongs to the Codex host, not to us.
if ((Test-Path $ConfigFile) -and -not (Test-Path "$ConfigFile.doener-backup")) {
    Copy-Item $ConfigFile "$ConfigFile.doener-backup"
    Write-Host "    backup: $ConfigFile.doener-backup"
}

Set-Content -Path $ConfigFile -Value $Updated -Encoding utf8 -NoNewline
Write-Host "    written" -ForegroundColor Green

Write-Host ''
Write-Host 'Registered.' -ForegroundColor Green
Write-Host ''
Write-Host 'Next:'
Write-Host "  1. Start the bridge:   npm run research:chatgpt:bg"
Write-Host "  2. Restart the ChatGPT desktop app so it re-reads $ConfigFile"
Write-Host "  3. The server appears as '$ServerName' with these tools:"
Write-Host "     server_info, notebook_list, notebook_get, notebook_describe,"
Write-Host "     source_describe, source_get_content"
Write-Host ''
Write-Host 'If anything beyond those six appears, stop the bridge and report it.' -ForegroundColor Yellow
