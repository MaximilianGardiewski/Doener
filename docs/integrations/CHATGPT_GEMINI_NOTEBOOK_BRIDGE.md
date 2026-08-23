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
allowlist-enforcing proxy
        |
        v
127.0.0.1:8001/mcp
        |
        v
notebooklm-mcp
        |
        v
Gemini Notebook
```

ChatGPT cannot connect directly to a local `stdio`/localhost MCP. A private/local server therefore uses an authenticated OpenAI Secure MCP Tunnel (or another properly authenticated remote MCP gateway) for ChatGPT.

## ChatGPT is not Codex

A Codex MCP entry in `%USERPROFILE%\.codex\config.toml` does **not** make the server available to ordinary ChatGPT conversations.

Codex local surfaces have their own integration path documented in [`CODEX_GEMINI_NOTEBOOK_BRIDGE.md`](CODEX_GEMINI_NOTEBOOK_BRIDGE.md). ChatGPT uses the Custom App + Secure MCP Tunnel path in this document.

## Security model

- MCP binds to `127.0.0.1` only.
- Never set `NOTEBOOKLM_ALLOW_EXTERNAL_BIND=1` for this workflow.
- Never expose port 8000 through a raw public tunnel.
- Google session state remains in the local user profile.
- The raw NotebookLM upstream is isolated on port 8001.
- An allowlist-enforcing proxy owns port 8000 and blocks calls outside the profile.
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

Notebook queries can persist chat history in Gemini Notebook, so this profile is not as strictly read-only as the default profile.

## Local setup

Prepare the shared Gemini Notebook installation if needed:

```powershell
npm run setup:research
nlm login
```

Start the safest profile in the foreground:

```powershell
npm run research:chatgpt
```

Or in the background:

```powershell
npm run research:chatgpt:bg
```

Stop a background instance:

```powershell
npm run research:chatgpt:stop
```

Verify the real Streamable HTTP endpoint and enforcement boundary:

```powershell
npm run research:chatgpt:check
```

The public-to-ChatGPT local endpoint is always the proxy:

```text
MCP:      http://127.0.0.1:8000/mcp
Health:   http://127.0.0.1:8000/health
Upstream: http://127.0.0.1:8001/mcp   (internal only)
```

## ChatGPT connection

OpenAI requires ChatGPT custom MCP apps to use a remote MCP connection. For a private/local server, use Secure MCP Tunnel when available for the relevant account/workspace.

1. Start and verify the local bridge.
2. Start the Secure MCP Tunnel with `npm run research:chatgpt:tunnel`.
3. Create a ChatGPT Custom App.
4. Choose the tunnel/private MCP connection option.
5. Select the tunnel connected to `http://127.0.0.1:8000/mcp`.
6. Scan tools.
7. Confirm that only the expected allowlisted tools appear.
8. Keep the app private while testing.
9. Test `notebook_list` before enabling query mode.

Do not approve a tool scan that unexpectedly includes delete/share/studio/source-write/research-import actions.

## Failure behavior

If the third-party Gemini Notebook internal API changes:

1. Fail closed.
2. Do not expose additional tools as a workaround.
3. Run `npm run doctor:research`.
4. Re-authenticate with `nlm login` if needed.
5. Upgrade the shared package deliberately rather than automatically.

If ChatGPT says the `gemini_notebook` tool is unavailable while the local MCP check passes, troubleshoot the ChatGPT Custom App / Secure MCP Tunnel / workspace layer. Do not treat `.codex/config.toml` as a ChatGPT fix.

## Relationship to other integrations

All integrations may share the same local Gemini Notebook authentication, but their client attachment points are distinct:

```text
Claude Code -> isolated local stdio MCP
Codex       -> ~/.codex/config.toml -> loopback MCP
ChatGPT     -> Custom App -> Secure MCP Tunnel -> loopback MCP
```

Git, tests, project docs, and measured behavior remain the project source of truth regardless of which research client is used.
