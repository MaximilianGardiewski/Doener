[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 8000,
    [string]$ServerName = 'gemini_notebook'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

<#
  RETIRED / FAIL-CLOSED COMPATIBILITY TOMBSTONE

  This historical path used to register a loopback MCP in the Codex host and
  incorrectly described that as a ChatGPT Desktop integration. Normal ChatGPT
  chats do not inherit MCP servers from ~/.codex/config.toml.

  Keep the old filename only so stale local instructions fail with an explicit
  explanation instead of silently configuring the wrong client.

  Historical invariants retained here for static compatibility guards:
  - Codex targets the enforcing proxy, never the raw upstream.
  - Never point this at $($Port + 1).
  - A Codex TOML table matcher must escape the server name and stop at the next
    table or end of file.
#>

$McpUrl = "http://127.0.0.1:$Port/mcp"
$Pattern = "(?ms)^\[mcp_servers\.$([regex]::Escape($ServerName))\].*?(?=^\[|\z)"
$LegacyBackupName = 'config.toml.doener-backup'

# Deliberately no Set-Content, no config mutation and no process start.
throw @"
This script is retired and intentionally makes no changes.

For Codex local MCP registration use:
  npm run research:codex:register

For normal ChatGPT chats use the Custom App + OpenAI Secure MCP Tunnel path:
  npm run research:chatgpt:bg
  npm run research:chatgpt:check
  npm run research:chatgpt:tunnel

Local endpoint (through the enforcing proxy): $McpUrl
"@
