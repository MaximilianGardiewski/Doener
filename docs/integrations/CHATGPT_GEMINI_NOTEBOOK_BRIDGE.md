# ChatGPT ↔ Gemini Notebook Bridge

## Status

V1, single-user, read-first bridge for Doener.

The bridge reuses the same local `notebooklm-mcp-cli` installation and Google browser session as the Claude Code integration. It does **not** copy Google cookies to a VPS or expose the Gemini Notebook MCP directly to the public internet.

## Architecture

```text
ChatGPT custom app
        |
        | OpenAI Secure MCP Tunnel
        v
local tunnel client
        |
        | private loopback
        v
127.0.0.1:8000/mcp
        |
        v
notebooklm-mcp
        |
        v
Gemini Notebook
```

ChatGPT cannot connect directly to a local `stdio`/localhost MCP. The local server therefore runs Streamable HTTP on loopback and must be reached through an authenticated OpenAI-supported tunnel or another properly authenticated remote MCP gateway.

## Security model

- MCP binds to `127.0.0.1` only.
- Never set `NOTEBOOKLM_ALLOW_EXTERNAL_BIND=1` for this workflow.
- Never expose port 8000 through a raw public tunnel.
- Google session state remains in the local user profile.
- The runtime hides **all** upstream tool groups and re-enables an explicit allowlist.
- Default mode is `readonly`.
- No source writes, deletes, notebook deletes, sharing, Studio generation, Drive mutation, research import, automation, or account switching are exposed.

## Tool profiles

### `readonly` (default)

Exposes only:

- `server_info`
- `notebook_list`
- `notebook_get`
- `notebook_describe`
- `source_describe`
- `source_get_content`

Use this profile for the safest ChatGPT connection and read/fetch-style research.

### `query`

Adds:

- `notebook_query`
- `notebook_query_start`
- `notebook_query_status`
- `chat_list`
- `chat_get`
- `chat_export`

This lets ChatGPT ask Gemini Notebook synthesized questions while still withholding destructive and broader mutating tools. Note that Notebook queries can persist chat history in Gemini Notebook, so this is not as strictly read-only as the default profile.

## Local setup

First prepare the shared Gemini Notebook installation if not already done:

```powershell
npm run setup:research
```

Start the safest profile in the foreground:

```powershell
npm run research:chatgpt
```

Or in the background:

```powershell
npm run research:chatgpt:bg
```

Start query mode:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/start-gemini-notebook-chatgpt-mcp.ps1 -Mode query
```

Stop a background instance:

```powershell
npm run research:chatgpt:stop
```

Diagnostics:

```powershell
npm run research:chatgpt:doctor
```

The local endpoints are:

```text
MCP:    http://127.0.0.1:8000/mcp
Health: http://127.0.0.1:8000/health
```

## ChatGPT connection

OpenAI currently requires ChatGPT custom MCP apps to use a remote MCP connection. For a private/local server, use OpenAI Secure MCP Tunnel when that feature is available for the relevant account/workspace.

In ChatGPT developer-mode app creation:

1. Create a custom app.
2. Choose the tunnel/private MCP connection option.
3. Point the tunnel client at `http://127.0.0.1:8000/mcp`.
4. Scan tools.
5. Confirm that only the expected allowlisted tools appear.
6. Keep the app private while testing.
7. Test notebook listing before enabling query mode.

Do not approve a tool scan that unexpectedly includes delete/share/studio/source-write/research-import actions. Stop the bridge and inspect the upstream MCP version/tool gating instead.

## Current ChatGPT plan limitation

As of August 2026, OpenAI documents full custom MCP support for Business and Enterprise/Edu. Pro can use custom MCPs with read/fetch permissions in developer mode. Plus is not currently documented as supporting developer-mode custom MCP apps.

Therefore this repo-side bridge can be fully prepared and tested locally on any machine, but activation inside the ChatGPT UI depends on the account/workspace having custom MCP access.

## Deep Research

OpenAI documents that ChatGPT Deep Research can use custom apps for read/fetch actions, not write actions. The `readonly` profile is intentionally the default for this reason.

## Failure behavior

If the third-party Gemini Notebook internal API changes:

1. The ChatGPT bridge should fail closed.
2. Do not expose additional tools as a workaround.
3. Run `npm run doctor:research`.
4. Re-authenticate with `nlm login` if needed.
5. Upgrade the shared package deliberately rather than automatically.

## Relationship to Claude Code bridge

Both integrations share:

- the same `notebooklm-mcp-cli` installation;
- the same local Gemini Notebook authentication;
- the same canonical project notebook (`Doener — Project Research`);
- the same principle that Git/tests/project docs/measured behavior remain source of truth.

Claude Code uses an isolated local `stdio` MCP inside `research-director`. ChatGPT uses a loopback Streamable HTTP MCP plus an authenticated remote/tunnel boundary.
