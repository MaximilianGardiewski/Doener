# Quick Service — ChatGPT-first, domainless bootstrap

Purpose: run Supabase Factory on one Linux host without writing custom TypeScript and without requiring a domain, Cloudflare DNS zone, Cloudflare management API, Cloudflare OAuth token, Wrangler session, or Supabase Cloud management credentials.

This is the **bootstrap / development / real-host E2E** path. Cloudflare Quick Tunnels are not accepted as the production edge.

## Resulting topology

```text
ChatGPT / compatible MCP client
              |
              | HTTPS + Bearer
              v
https://<random>.trycloudflare.com/mcp
              |
        Quick Tunnel
              |
              v
Factory MCP 127.0.0.1:18787
              |
              v
       Supabase Factory
              |
       +------+------+
       |             |
    Project A     Project B
    Envoy :18001 Envoy :18002
       |             |
 Quick Tunnel    Quick Tunnel
       |             |
       v             v
random HTTPS    random HTTPS
```

There are two separate edge concerns:

1. the optional **management Quick Tunnel** exposes Factory MCP to a remote MCP client;
2. every development/staging Supabase project receives its own anonymous Quick Tunnel directly to its loopback Envoy port.

No Cloudflare management credential is used by either path.

## One-time bootstrap

From the repository root:

```bash
sudo npm --workspace @business-web/supabase-factory run bootstrap:quick
```

Defaults:

- configuration secrets: `/etc/supabase-factory`
- persistent Factory state: `/var/lib/supabase-factory`
- isolated project roots: `/srv/supabase-factory/projects`

Bootstrap creates, only when missing:

- `/etc/supabase-factory/master-key` — 32-byte AES key encoded as hex
- `/etc/supabase-factory/mcp-token` — high-entropy MCP bearer token

Both files are mode `0600`; the config and data directories are mode `0700`.

Bootstrap is idempotent and never overwrites existing secrets. If encrypted Factory state already exists but the master-key file is missing, bootstrap **fails** and asks for the original key instead of creating an unusable replacement.

## Start locally only

```bash
sudo npm --workspace @business-web/supabase-factory run serve:quick
```

Expected secret-free startup output:

```json
{"status":"READY","loopbackMcpUrl":"http://127.0.0.1:18787/mcp"}
```

Factory MCP remains loopback-only.

## Start with a temporary public MCP endpoint

For ChatGPT/remote-MCP E2E without a domain:

```bash
sudo FACTORY_EXPOSE_MCP_QUICK=true \
  npm --workspace @business-web/supabase-factory run serve:quick
```

Expected shape:

```json
{
  "status": "READY",
  "loopbackMcpUrl": "http://127.0.0.1:18787/mcp",
  "publicMcpUrl": "https://<random>.trycloudflare.com/mcp"
}
```

The bearer value is intentionally **not** printed. It remains in `/etc/supabase-factory/mcp-token` and is also stored only inside Factory's encrypted SecretStore for server-side comparison.

A compatible remote MCP client can use:

- endpoint: the printed `publicMcpUrl`
- authorization: `Bearer <value from /etc/supabase-factory/mcp-token>`

The MCP server itself still binds only to `127.0.0.1`; Cloudflare is the outbound transport.

## Daily agent flow

Once the remote MCP client is connected, normal project operations no longer require Cloudflare or Docker commands from the user:

```text
"Create a development Supabase project called mcello-dev"
        |
        v
factory.project.create
        |
        v
Factory allocates a persistent port
        |
        v
self-hosted Supabase starts
        |
        v
anonymous Quick Tunnel URL is captured
        |
        v
Auth/REST public health is checked
```

Migration tools are wired by the single-host composition as well. Backup/restore/upgrade handlers remain fail-closed until their real storage/PITR/rollback dependencies are configured.

## Required host capabilities for this quick service

The service preflight requires:

- Git
- Docker
- Docker Compose >= 2.24.4
- Supabase CLI exactly `2.115.0`
- `cloudflared`
- systemd (`systemctl`)
- journald (`journalctl`)

It does **not** require Caddy, wildcard DNS, AWS CLI, rclone or WAL-G for the core project/migration service.

## Optional configuration

All secret values stay in files. Non-secret settings may use environment variables:

| Variable | Default |
| --- | --- |
| `FACTORY_DATA_DIR` | `/var/lib/supabase-factory` |
| `FACTORY_PROJECT_ROOT` | `/srv/supabase-factory/projects` |
| `FACTORY_MASTER_KEY_FILE` | `/etc/supabase-factory/master-key` |
| `FACTORY_MCP_TOKEN_FILE` | `/etc/supabase-factory/mcp-token` |
| `FACTORY_HOST_ID` | `local` |
| `FACTORY_GATEWAY_PORT_START` | `18001` |
| `FACTORY_GATEWAY_PORT_END` | `18100` |
| `FACTORY_MAX_PROJECTS` | `100` |
| `FACTORY_MCP_PORT` | `18787` |
| `FACTORY_MCP_PATH` | `/mcp` |
| `FACTORY_EXPOSE_MCP_QUICK` | `false` |
| `FACTORY_MCP_ALLOWED_HOSTS` | none beyond local/detected Quick host |
| `FACTORY_MCP_ALLOWED_ORIGINS` | none |

## Security boundaries

- MCP bearer and Factory master key never appear in command-line arguments.
- The public Quick endpoint does not make the Node MCP listener public; it remains loopback-only.
- Strict Host validation automatically includes only the current generated TryCloudflare hostname plus local hosts.
- Browser `Origin` headers are rejected unless explicitly allowlisted.
- Tool arguments/outputs are not written to Factory audit logs.
- Secrets remain encrypted at rest.
- Unsupported destructive tools remain `TOOL_NOT_CONFIGURED`.

## Quick Tunnel limitations

Cloudflare documents Quick Tunnels as a testing/development feature. Current documented constraints include random hostnames, no SLA, a 200 in-flight-request hard limit, and no SSE. Factory MCP uses stateless JSON request/response transport, but the overall Quick Service is still considered temporary bootstrap infrastructure.

A host restart or new `cloudflared` process can change the public URL. A remote MCP app may therefore need its endpoint updated after such a restart.

Production should use a stable edge such as the already-implemented named Cloudflare Tunnel + wildcard domain, or the Cloudflare-independent Caddy edge, while keeping the same Factory MCP/control-plane core.
