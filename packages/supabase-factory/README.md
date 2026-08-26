# Supabase Factory

Self-hosted control plane for provisioning and operating isolated Supabase Self-Hosted projects **without Supabase Cloud management credentials**.

Factory is intended to make the normal operating surface:

```text
Maxi / operator
      |
      v
   ChatGPT
      |
      v
 Factory MCP
      |
      v
Supabase Factory
      |
      +-- isolated Supabase project A
      +-- isolated Supabase project B
      +-- isolated Supabase project C
```

The package currently lives in the Doener/BusinessWebFactory monorepo so repository CI can exercise the complete contract. It is extraction-friendly and can move into a dedicated Factory service after the real-host deployment contract is proven.

## Core independence goal

Factory does not use Supabase Cloud as a management plane.

No project lifecycle operation requires:

- `SUPABASE_ACCESS_TOKEN`
- `sbp_*`
- `supabase login`
- `supabase link`
- hosted Supabase project refs
- Supabase Platform Management API

One logical Factory project owns one isolated self-hosted Supabase runtime, database, Auth namespace, API/JWT material, migration state, Storage namespace and lifecycle state.

Shared lower-level infrastructure such as one Linux host, reverse proxy, monitoring, object-storage provider or SMTP provider is allowed below that isolation boundary.

## Reviewed baseline — 2026-08-26

- Supabase Self-Hosted release: `self-hosted/v0.8.0`
- exact reviewed upstream commit: `241bb11c0627f2981746d37033f57dbfa81d29b0`
- PostgreSQL 17 for new projects
- Envoy gateway
- Docker Compose production runtime
- Supabase CLI `2.115.0` for direct self-hosted migration/logical-backup operations
- modern `sb_publishable_*` / `sb_secret_*` API keys plus ES256/JWKS material
- MCP TypeScript SDK v2 / MCP 2026-07-28

Primary upstream references:

- https://supabase.com/docs/guides/self-hosting
- https://supabase.com/docs/guides/self-hosting/docker
- https://supabase.com/docs/guides/self-hosting/updating
- https://supabase.com/docs/guides/self-hosting/auth/config
- https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys
- https://supabase.com/docs/guides/self-hosting/postgres-upgrade-17
- https://supabase.com/docs/guides/self-hosting/self-hosted-s3
- https://supabase.com/docs/guides/self-hosting/self-hosted-envoy
- https://supabase.com/docs/guides/self-hosting/self-hosted-proxy-https
- https://supabase.com/docs/reference/cli/supabase-db-push
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
- https://developers.cloudflare.com/tunnel/

## Edge modes

Factory deliberately keeps the edge replaceable.

### 1. Domainless Cloudflare Quick Tunnel — bootstrap/dev/E2E

This is the easiest way to prove the real host without owning a domain or binding Factory to Cloudflare's management API.

```text
ChatGPT / MCP client
        |
        | HTTPS + bearer
        v
https://<random>.trycloudflare.com/mcp
        |
        v
Factory MCP on 127.0.0.1:18787
        |
        v
Supabase Factory
        |
        +-- Project A Envoy 127.0.0.1:18001
        |       |
        |       v
        |   anonymous Quick Tunnel
        |       |
        |       v
        |   https://<random>.trycloudflare.com
        |
        +-- Project B Envoy 127.0.0.1:18002
```

`CloudflareQuickTunnelController` and `CloudflareQuickTunnelRuntimeBindingProvider` provide:

- no custom domain
- no DNS zone
- no Cloudflare account requirement
- no Cloudflare API token
- no Cloudflare OAuth token
- no Wrangler session
- no Cloudflare management MCP dependency
- one Factory-owned systemd unit per development/staging project
- direct `cloudflared` routing to the project's loopback Envoy port
- random public HTTPS URL captured automatically
- actual public URL injected as Factory `publicUrl` and Supabase `SITE_URL` before runtime preparation
- isolated systemd `HOME` so an operator `~/.cloudflared/config.yaml` cannot interfere
- URL parsing only from the current systemd `InvocationID`, avoiding stale journal URLs
- no automatic `cloudflared` restart, because a new process may receive a different URL
- fail-closed behavior for `production` and `production-critical`

Cloudflare documents Quick Tunnels as testing/development infrastructure. Factory therefore never promotes this mode to production.

See:

- `docs/CLOUDFLARE_QUICK_TUNNEL.md`
- `docs/QUICK_SERVICE.md`

### 2. Stable named Cloudflare Tunnel — production option

Already implemented as a separate edge path:

```text
*.supabase.example.com
        |
        v
Cloudflare Tunnel
        |
        v
127.0.0.1:18080 Caddy host router
        |
        +-- host A -> Envoy 18001
        +-- host B -> Envoy 18002
```

The named-tunnel design uses one static wildcard ingress and one one-time tunnel credential. Normal project creation changes only the local Caddy route; it does not call Cloudflare's configuration API and does not restart `cloudflared`.

### 3. Direct Caddy wildcard HTTPS — Cloudflare-independent fallback

Factory can also operate with wildcard DNS pointing directly to the host. Caddy owns public TLS/ACME and proxies only to loopback Envoy ports.

## Quick Service: no custom TypeScript wiring

The single-host Quick Service turns the package from a library into an install-once control plane.

### Bootstrap

```bash
sudo npm --workspace @business-web/supabase-factory run bootstrap:quick
```

Defaults:

- configuration secrets: `/etc/supabase-factory`
- persistent Factory state: `/var/lib/supabase-factory`
- isolated project roots: `/srv/supabase-factory/projects`

The bootstrap creates, only when missing:

- `/etc/supabase-factory/master-key`
- `/etc/supabase-factory/mcp-token`

Secret files are mode `0600`. Bootstrap is idempotent and never overwrites an existing secret. If encrypted Factory state exists but the original master key is missing, bootstrap refuses to invent a replacement key.

### Start locally

```bash
sudo npm --workspace @business-web/supabase-factory run serve:quick
```

Expected shape:

```json
{"status":"READY","loopbackMcpUrl":"http://127.0.0.1:18787/mcp"}
```

### Start with a temporary public Factory MCP endpoint

For a domainless ChatGPT/remote-MCP E2E:

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

The bearer token is intentionally not printed. The MCP listener itself stays bound to loopback; the Quick Tunnel is outbound transport only.

## Single-host composition

`createSingleHostQuickTunnelFactory(...)` and `startSingleHostQuickTunnelFactory(...)` construct the working service from a small configuration instead of requiring handwritten dependency wiring.

The composition includes:

- `LocalHostExecutor`
- encrypted `SecretStore`
- persistent `JsonFilePlacementStore`
- `ProjectScheduler`
- `CloudflareQuickTunnelRuntimeBindingProvider`
- `DockerRuntimePreparer`
- `DockerComposeInfrastructureProvider`
- public HTTPS/Auth/REST health verification
- persistent project registry
- backup catalog
- direct self-hosted migration controller
- agent authorization
- secret-free audit log
- authenticated MCP v2 handler
- loopback Node MCP server

`JsonFilePlacementStore` persists project-to-host-to-Envoy-port assignment using atomic writes and mode `0600`, preventing port reuse after Factory restarts.

The quick composition intentionally wires only lifecycle services whose deployment dependencies are fully configured. Backup/restore/upgrade modules exist, but quick-service handlers for those remain absent until their concrete DR/storage dependencies are supplied. Missing tools fail closed as `TOOL_NOT_CONFIGURED`.

## Project lifecycle and Docker isolation

Implemented profiles:

- `minimal`
- `webapp`
- `realtime`
- `full`
- `production-critical`

Core behavior:

- idempotent desired-state planning/reconciliation
- exact Supabase release + upstream commit pinning
- stable host placement and unique Envoy ports
- project-scoped Compose and Realtime identities
- project-scoped credential namespace
- Envoy loopback binding
- PostgreSQL/Supavisor and Studio kept private
- deterministic Compose overlays
- optional services disabled when not required
- Docker Compose >= `2.24.4`

## Auth and secrets

- AES-256-GCM encrypted local SecretStore
- generated DB/API/JWT credentials never appear in agent-facing project records
- official Supabase key-generation utilities
- publishable/secret API-key model
- asymmetric signing material
- email, phone and anonymous signup disabled by default
- JWT expiry capped at 604800 seconds
- production email Auth requires explicit SMTP configuration
- SMTP credentials are SecretRefs only
- production phone Auth fails closed until an SMS provider binding exists

The central `cloudless-env.ts` deny policy removes Supabase Cloud project-management variables before direct self-hosted DB operations. CI rejects Cloud-login/link/token dependencies in Factory source.

## Migrations

Provisioning is schema-neutral. Application schema deployment is a separate lifecycle:

```text
factory.migrations.plan
  -> verify placement
  -> verify exact Supabase CLI 2.115.0
  -> optional exact source Git SHA / clean tracked tree
  -> strip Cloud-management variables
  -> supabase db push --db-url ... --dry-run

factory.migrations.apply
  -> explicit APPLY_MIGRATIONS
  -> fresh dry-run
  -> direct private db push
  -> migration-history verification
```

No `supabase link` is used.

## Backup, DR and restore primitives

The full Factory package already includes:

- Supabase-aware roles/schema/data logical dumps
- `pgsodium_root.key` preservation
- encrypted runtime configuration
- AES-256-GCM `.sbf` backup artifacts
- SHA-256 verification
- S3 off-host encrypted artifact store
- remote re-download verification
- persistent backup catalog keyed by `projectId + backupId`
- rclone S3 Storage DR mirror with checksum/download verification
- WAL-G restore points, base backup and WAL continuity gate
- disposable restore drills

Restore order follows the controlled Factory contract:

1. roles
2. schema
3. `session_replication_role=replica`
4. data
5. Storage verification
6. public health/integrity verification
7. disposable target cleanup

## Upgrades

### Supabase releases

- exact target tag and commit verification
- official `update.sh --dry-run`
- explicit `APPLY_SUPABASE_UPGRADE`
- fresh verified encrypted backup before mutation
- overlay reconciliation
- final health verification

### PostgreSQL 15 -> 17

- separate controller; never mixed with Supabase release changes
- free-space gate: `2 * DB data size + 5 GiB`
- refuses stale prior-upgrade state
- refuses unsupported removed extensions instead of silently dropping them
- fresh verified backup
- official `utils/upgrade-pg17.sh --yes`
- PG17 verification
- preserved PG15 and pgsodium rollback material

## Agent authorization and audit

`FactoryAgentApi` is the transport-neutral boundary.

- authorization occurs before handler execution
- viewer/planner/operator/administrator roles
- tool definitions mark mutating/destructive behavior
- Docker executors and SecretStore are never exposed as tools
- file audit is JSONL mode `0600`
- audit contains request/principal/tool/project/outcome metadata only
- arguments and outputs are not logged
- internal errors are flattened before agent exposure

## Authenticated MCP v2

Factory implements MCP SDK v2 / MCP 2026-07-28.

- real `McpServer.registerTool(...)`
- only configured Factory handlers appear in `tools/list`
- Zod-v4 boundary validation
- read-only/destructive annotations
- replaceable `FactoryMcpAuthenticator`
- current trusted/private mode uses SecretStore-backed bearer authentication
- SHA-256/timing-safe token comparison
- strict Host validation
- optional Origin allowlist
- authentication before MCP protocol handling
- stateless JSON request/response mode
- Node MCP listener binds loopback only

CI includes a real MCP-v2 client connection, tool discovery and tool invocation through `FactoryAgentApi` and audit.

## Host preflight

`FactoryHostPreflight` is non-mutating and returns a machine-readable readiness report.

Capabilities include:

- Git
- Docker
- Docker Compose >= `2.24.4`
- exact Supabase CLI `2.115.0`
- Caddy when the selected edge requires it
- `cloudflared` when the selected edge requires it
- systemd / journald for Quick Tunnel service management
- AWS CLI when off-host artifact storage requires it
- rclone when Storage DR requires it
- WAL-G when PITR requires it
- DNS resolver when wildcard DNS verification requires it
- writable `/dev/shm` when secure plaintext backup staging requires it

The Quick Service core profile requires Cloudflared + systemd/journal but does not require Caddy, wildcard DNS, AWS CLI, rclone, WAL-G or `/dev/shm` merely to create/migrate development projects.

## Core invariants

1. One logical project owns one isolated Supabase runtime and credential namespace.
2. Shared infrastructure exists only below the project isolation boundary.
3. Desired state is idempotent.
4. Supabase Cloud project-management credentials are absent from project lifecycle execution.
5. Agent APIs return status/references, not secret values.
6. Production PostgreSQL and Studio remain private.
7. Public `HEALTHY` requires real HTTPS/Auth/REST key-enforcement checks.
8. Backup, Storage replication and PITR are independently verifiable.
9. PITR fails closed when WAL continuity cannot be proven.
10. Moving upstream `master` is never deployed; release+commit are pinned.
11. PG major upgrades preserve rollback material until explicit cleanup.
12. Factory MCP never exposes SecretStore or raw host execution.
13. Quick Tunnels are bootstrap/dev only and are forbidden for production-critical operation.
14. Cloudflare management APIs are not part of the Quick Tunnel project lifecycle.
15. The stable Cloudflare edge and direct-Caddy edge remain replaceable production options.

## Current validation

PR #103 / `feat/supabase-factory-v1` dedicated Factory gate currently passes:

- monorepo TypeScript typecheck
- **117/117 Factory contract/integration tests**
- **0 failures**
- **0 skipped**
- Supabase Cloud management-dependency guard

The test surface includes:

- Docker isolation and runtime overlays
- secure Auth defaults
- secret storage
- persistent placement
- Cloudflare named-tunnel routing contracts
- anonymous Quick Tunnel routing and URL capture
- current-systemd-invocation parsing
- Quick Tunnel production refusal and safe cleanup
- Quick Service bootstrap secret safety/idempotence
- single-host no-custom-wiring composition
- public health
- migrations
- encrypted local/off-host backup roundtrips
- backup catalog
- Storage DR
- WAL-G PITR
- restore drills
- release upgrade and PG17 gates
- agent authorization/audit
- real MCP-v2 client roundtrip

Self-host Release and Mcello Cloudflare Preview are also green on the same validated code head. The general repository CI covers the wider monorepo/browser surface independently.

## Remaining deployment work

The library/control-plane side is now substantially complete. Remaining work is deployment proof, not another architecture rewrite:

1. run the Quick-Service preflight on the actual Ubuntu target host;
2. install only missing host prerequisites using that host's actual Linux distribution;
3. run the disposable real-host E2E: Factory MCP -> project create -> random HTTPS -> Auth/REST/Realtime -> migration;
4. connect the generated Factory MCP endpoint to the intended ChatGPT MCP client and prove a real ChatGPT tool call;
5. configure the selected off-host backup/Storage/PITR providers and wire those existing modules into the deployed service;
6. run backup + restore drill on the real host;
7. choose a stable production edge only when production is required;
8. keep live restore, project destroy and key rotation fail-closed until their explicit rollback/approval contracts are implemented and tested;
9. extract Factory into a dedicated repository/service after the real-host contract is proven.
