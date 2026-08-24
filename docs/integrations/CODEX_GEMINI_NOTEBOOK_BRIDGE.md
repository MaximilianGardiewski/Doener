# Codex ↔ Gemini Notebook Bridge

## Scope

This integration is **Codex-only**. It registers the local Gemini Notebook MCP in the Codex MCP configuration (`%USERPROFILE%\.codex\config.toml`, or `CODEX_HOME`).

It does **not** make the MCP server available to ordinary ChatGPT conversations in the ChatGPT desktop or web app.

For ChatGPT, use the separate Secure MCP Tunnel / Custom App path documented in [`../chatgpt-notebook-mcp.md`](../chatgpt-notebook-mcp.md).

## Architecture

```text
Codex CLI / Codex desktop / Codex IDE extension
                  |
                  | local MCP config
                  v
       %USERPROFILE%\.codex\config.toml
                  |
                  v
       http://127.0.0.1:8000/mcp
                  |
                  v
       allowlist-enforcing proxy
                  |
                  v
       notebooklm-mcp on :8001
                  |
                  v
          Gemini Notebook
```

The Codex entry always points to port `8000`, the enforcing proxy. Port `8001` is the raw upstream and must never be registered directly.

## Register

Start the bridge first:

```powershell
npm run research:chatgpt:bg
```

Then register it for Codex:

```powershell
npm run research:codex:register
```

Restart the Codex surface that should use the MCP server.

## Remove

```powershell
npm run research:codex:remove
```

## Security

The same read-first allowlist is used as the ChatGPT bridge:

- `server_info`
- `notebook_list`
- `notebook_get`
- `notebook_describe`
- `source_describe`
- `source_get_content`

The proxy is the enforcement boundary. Upstream NotebookLM tool-gating alone is not treated as a security boundary because hidden tools can still be callable by name upstream.

## Important distinction

`~/.codex/config.toml` is a Codex configuration surface. A normal ChatGPT chat does not automatically inherit MCP servers registered there.

Therefore:

- **Codex local surfaces** → direct loopback MCP is valid.
- **ChatGPT normal chats** → use a Custom App connected through Secure MCP Tunnel for a private/local server.
