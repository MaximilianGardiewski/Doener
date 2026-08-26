# Supabase Factory

Reusable control plane for provisioning and operating isolated self-hosted Supabase projects without Supabase Cloud management credentials.

> Bootstrap location: this package currently lives inside the Doener/BusinessWebFactory monorepo so the proven self-host implementation and repository CI can exercise it. The package boundary is extraction-friendly; the target is a dedicated Factory service after the real-host deployment contract is proven.

## Reviewed baseline — 2026-08-26

- official Supabase self-host release `self-hosted/v0.8.0`
- exact reviewed upstream commit `241bb11c0627f2981746d37033f57dbfa81d29b0`
- PostgreSQL 17 for new projects
- Envoy default gateway
- Docker Compose production runtime; Supabase CLI local-dev is not used as production hosting
- Supabase CLI `2.115.0` pinned for migration/logical-backup operations
- modern `sb_publishable_*` / `sb_secret_*` API keys plus ES256/JWKS material
- MCP TypeScript SDK v2 / MCP 2026-07-28 transport
- preferred public edge: Cloudflare Tunnel with static wildcard ingress and a loopback-only Caddy host router
- Caddy direct wildcard HTTPS remains an independent fallback
- no `supabase login`, `supabase link`, hosted project ref, Platform Management API, or Supabase Cloud access-token dependency in project lifecycle operations

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
- https://supabase.com/docs/guides/self-hosting/enable-mcp
- https://supabase.com/docs/reference/cli/supabase-db-push
- https://supabase.com/docs/guides/self-hosting/restore-from-platform
- https://developers.cloudflare.com/tunnel/
- https://developers.cloudflare.com/tunnel/routing/
- https://developers.cloudflare.com/tunnel/advanced/local-management/configuration-file/
- https://developers.cloudflare.com/dns/manage-dns-records/reference/wildcard-dns-records/

## Why Factory exists

Supabase documents one self-hosted deployment as a **single project**. Self-hosting does not provide the hosted platform's multi-project lifecycle, managed backups/PITR, branching, Platform Management API, or full operations layer. Factory supplies that missing layer.

Preferred public-edge path:

```text
Internet
  |
  v
Cloudflare DNS / TLS / WAF / DDoS
  |
  v
Cloudflare Tunnel (outbound-only cloudflared)
  |  static wildcard ingress
  v
127.0.0.1:18080  loopback Caddy host router
  |
  +-- project-a.supabase.example.com -> 127.0.0.1:18001 -> Envoy A
  +-- project-b.supabase.example.com -> 127.0.0.1:18002 -> Envoy B
  +-- project-c.supabase.example.com -> 127.0.0.1:18003 -> Envoy C
```

Factory control path:

```text
ChatGPT / Codex / CLI / MCP client
              |
       authenticated MCP
              |
       FactoryAgentApi
      authz + audit boundary
              |
    FactoryServiceComposition
              |
  +-----------+---------------------------+
  | Project control plane                 |
  | Migrations                            |
  | Encrypted backup + off-host S3        |
  | Storage DR mirror                     |
  | WAL-G PITR                            |
  | Restore drill                         |
  | Supabase release upgrade              |
  | PostgreSQL 15 -> 17 upgrade           |
  | Public health                         |
  +-----------+---------------------------+
              |
    isolated self-hosted Supabase stacks
```

## Implemented V1

### Project lifecycle and Docker isolation

- declarative profiles: `minimal`, `webapp`, `realtime`, `full`, `production-critical`
- idempotent desired-state planning/reconciliation
- exact self-host release + upstream commit pinning
- host placement/capacity and unique project Envoy ports
- project-scoped Compose, Realtime identity and secret namespaces
- Envoy bound to `127.0.0.1:<unique-port>`
- PostgreSQL/Supavisor and Studio kept private
- unused services removed through deterministic Compose overrides
- Docker Compose >= 2.24.4 required for the V1 override contract

### Secrets and Cloud independence

- replaceable `SecretStore`
- AES-256-GCM local encrypted SecretStore
- generated DB/API/JWT credentials never appear in agent-facing records
- central `cloudless-env.ts` deny policy actively removes Supabase Cloud project-management variables before direct self-hosted DB commands
- CI rejects `supabase login`, `supabase link`, `sbp_`, and any `SUPABASE_ACCESS_TOKEN` reference outside that single defensive deny-policy file

### Runtime and Auth

- official Supabase key-generation utilities
- modern publishable/secret key model plus asymmetric signing material
- email, phone and anonymous signup disabled by default
- JWT expiry capped at 604800 seconds
- production email Auth requires explicit SMTP routing
- SMTP credentials are SecretRefs only
- production phone Auth fails closed until an SMS-provider binding exists
- development may explicitly use the local mail path

### Migrations

Provisioning is schema-neutral. Application migrations are a separate controlled lifecycle:

```text
factory.migrations.plan
  -> verify placement + pinned Supabase CLI
  -> optional exact source Git SHA / clean tracked tree
  -> strip Cloud-management variables
  -> supabase db push --db-url ... --dry-run

factory.migrations.apply
  -> explicit APPLY_MIGRATIONS
  -> fresh dry-run
  -> supabase db push --db-url ...
  -> migration-history verification
```

### Complete encrypted project backup

Portable database backup uses Supabase-aware dumps:

```text
roles.sql   <- supabase db dump --role-only
schema.sql  <- supabase db dump
data.sql    <- supabase db dump --use-copy --data-only
```

A verified Factory backup also covers `pgsodium_root.key`, encrypted `.env`, Factory runtime state/config, Storage and PITR when policy requires them.

`LocalEncryptedBackupArtifactStore` creates AES-256-GCM authenticated `.sbf` bundles with SHA-256 verification. Plaintext packaging is constrained to `/dev/shm` in local Linux V1.

`S3EncryptedBackupArtifactStore` adds durable off-host storage:

- only encrypted `.sbf` bytes leave the host
- S3 credentials enter AWS CLI only via environment variables
- the remote object is immediately downloaded again
- SHA-256 and AES-GCM authentication are reverified
- local encrypted staging copy is removed after the successful remote roundtrip
- restore can materialize directly from the off-host artifact

### Persistent backup catalog

`BackupCatalog` provides stable lookup by `projectId + backupId`.

- memory and JSON-file implementations
- persistent JSON catalog uses atomic temp-write + rename and mode `0600`
- accepts only already verified and encrypted backup records
- stores artifact/storage/PITR references and version metadata, not secret values
- restore/verify calls no longer require an agent to pass internal backup records around

### Storage disaster-recovery mirror

`RcloneS3StorageBackupProvider` treats live Storage and DR Storage as different resources.

- source and target may be different S3-compatible providers
- credentials exist only in a mode-0600 `/dev/shm` config
- immutable `<base>/<project>/<backup-id>` target
- `rclone copy --checksum --metadata --immutable`
- immediate `rclone check --one-way --download`
- deterministic remote inventory hash for later verification

### WAL/PITR

`WalGPitrProvider` implements a real recoverability gate:

1. resolve private project DB
2. create named PostgreSQL restore point
3. force `pg_switch_wal()`
4. capture current LSN
5. verified WAL-G base backup
6. confirm it via `backup-list`
7. run `wal-show`
8. accept checkpoint only when WAL archive is gap-free and reports `OK`

DB/S3 credentials remain environment-only.

### Restore drills

`DisposableRestoreDrillController` accepts only verified encrypted backups and restores to explicitly disposable targets.

Database order:

1. roles
2. schema
3. `SET session_replication_role = replica`
4. data

Storage and health/integrity must verify; target and staging are removed even on failure.

### Preferred Cloudflare Tunnel edge

`CloudflareTunnelEdgeProvider` is the preferred public edge when the Factory domain is hosted on Cloudflare.

One-time infrastructure setup:

```text
*.supabase.example.com  CNAME  <TUNNEL-UUID>.cfargotunnel.com
```

The Factory-owned locally-managed tunnel then stays static:

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /etc/cloudflared/<TUNNEL-UUID>.json
ingress:
  - hostname: "*.supabase.example.com"
    service: "http://127.0.0.1:18080"
  - service: http_status:404
```

Important design choices:

- the wildcard DNS record is configured **once**
- the dedicated tunnel credential is configured **once**
- no Cloudflare API token is required during normal `factory.project.create`
- no Cloudflare configuration API call is made per project
- `cloudflared` is **not restarted** when projects are added, so existing WebSocket/Realtime connections are not intentionally dropped
- tunnel config always has a catch-all `404`
- Factory refuses to overwrite a cloudflared config it does not own
- `cloudflared tunnel ingress validate` verifies the generated tunnel configuration
- tunnel connector activity is checked before a project edge is accepted

`CloudflareCaddyRouterProvider` uses Caddy only as a loopback HTTP host router:

```text
cloudflared -> http://127.0.0.1:18080
                         |
                         +-- host A -> Envoy 18001
                         +-- host B -> Envoy 18002
```

Caddy does **not** own public ACME/TLS in this mode; public TLS terminates at Cloudflare. Per-project changes only add/remove a local host route and use Caddy's graceful config reload.

### Direct Caddy wildcard fallback

The previous provider remains available for Cloudflare-independent hosts:

```text
*.supabase.example.com -> Factory host IP
```

- `WildcardDnsVerifier` confirms DNS resolves to the expected host
- `CaddyReverseProxyBindingProvider` owns public TLS/ACME
- only loopback Envoy upstreams are accepted
- no per-project DNS API token is required after the wildcard record exists

### End-to-end health

Container liveness alone is not `HEALTHY`.

Factory verifies:

- `/auth/v1/health` + publishable key -> `200`
- `/rest/v1/` + secret key -> `200`
- `/rest/v1/` without key -> `401`
- HTTPS boundary
- privileged probes never follow redirects

In Cloudflare mode this public probe is also the final proof that wildcard DNS, Cloudflare edge, Tunnel, loopback router and Envoy all resolve to the intended project.

### Supabase release upgrades

Normal self-host release upgrades remain separate from PostgreSQL major upgrades:

```text
factory.upgrade.plan
  -> verify target tag + exact reviewed commit
  -> update.sh --dry-run --to <release>

factory.upgrade.apply
  -> explicit APPLY_SUPABASE_UPGRADE
  -> fresh preview
  -> fresh verified encrypted Factory backup
  -> update.sh --to <release> --yes
  -> reapply Factory overlays
  -> run.sh pull + recreate
  -> final health/integrity verification
```

### PostgreSQL 15 -> 17

`Postgres15To17UpgradeController` wraps Supabase's official `utils/upgrade-pg17.sh` with stricter automation gates:

- only 15 -> 17
- Supabase release changes must be separate
- current image must be PG15
- stale `data.bak.pg15` blocks a new attempt
- hard free-space gate: at least `2 * DB data size + 5 GiB`
- `timescaledb`, `plv8`, `plcoffee`, `plls` cause fail-closed instead of automatic drop
- fresh verified encrypted Factory backup required
- runs official PG17 migration script
- verifies PG17 server version
- requires preserved PG15 data + pgsodium rollback material
- final Factory health/integrity verification

Rollback material is deliberately retained after success until a separate explicit cleanup.

### Agent authorization and audit

`FactoryAgentApi` is the transport-neutral agent boundary.

- role/permission authorization before handler execution
- tool definitions mark mutating/destructive behavior
- Docker executors and SecretStore are never exposed as tools
- audit stores principal/request/tool/project/outcome metadata only
- tool arguments and outputs are never written to audit
- internal handler errors are flattened before agent exposure
- file audit log is JSONL mode `0600`

### Service composition

`FactoryServiceComposition` wires real agent handlers to existing lifecycle controllers:

- project plan/create/get/list/reconcile
- health
- migration plan/apply
- backup create + automatic catalog persistence
- backup verify when verifier is configured
- restore drill by `projectId + backupId`
- Supabase release upgrade plan/apply
- PostgreSQL 17 plan/apply

Controller approval literals are preserved. Unsupported/destructive capabilities are **not invented**: absent handlers remain `TOOL_NOT_CONFIGURED`.

### Authenticated MCP v2 transport

Factory has a real MCP 2026-07-28 / SDK-v2 transport.

- `createMcpHandler(...)` + `McpServer.registerTool(...)`
- only configured Factory handlers appear in `tools/list`
- Zod-v4 input schemas validate Factory manifests and operation payloads at the MCP boundary
- MCP annotations expose read-only/destructive semantics
- `FactoryMcpAuthenticator` is replaceable
- current private deployment authenticator uses SecretStore-backed bearer tokens with SHA-256 digest comparison + `timingSafeEqual`
- strict Host validation
- optional strict browser-Origin allowlist
- authentication occurs before MCP protocol handling
- stateless JSON response mode
- Node server mount binds only to `127.0.0.1` or `::1`

In Cloudflare deployments the MCP endpoint can use the same outbound-only Tunnel architecture. Cloudflare Access/Managed OAuth can later be layered in front of the existing Factory authenticator without exposing the MCP origin directly.

The MCP contract is verified with a **real MCP v2 client** using Streamable HTTP: connect, `tools/list`, annotations, tool call, authenticated principal and audit propagation all run in CI.

### Host readiness preflight

`FactoryHostPreflight` is a non-mutating readiness probe for a real deployment host.

It checks:

- Git
- Docker
- Docker Compose >= 2.24.4
- exact Supabase CLI `2.115.0`
- Caddy
- optional/required `cloudflared`
- AWS CLI
- rclone
- optional/required WAL-G
- system DNS resolver
- writable `/dev/shm`

Cloudflare Tunnel deployments set `cloudflared: true`; the direct Caddy fallback does not require it.

The report is machine-readable and intentionally does **not** install packages. Installation can then use the actual host distribution/package manager instead of assuming one.

## Core invariants

1. One logical project owns one isolated Supabase runtime and credential namespace.
2. Shared infrastructure is allowed only below that isolation boundary.
3. Desired state is idempotent; repeated calls converge instead of duplicate.
4. Supabase Cloud project-management credentials are absent from deployment, migration, backup and upgrade execution.
5. Agent-facing APIs expose status/references, not secret values.
6. Production PostgreSQL and Studio remain private.
7. Production public health requires HTTPS and working Envoy/Auth/REST key enforcement.
8. Production Storage uses an S3-compatible backend when enabled.
9. Backup, Storage replication and PITR are independent verifiable capabilities.
10. PITR fails closed when WAL continuity cannot be proven.
11. Moving upstream `master` is never deployed; releases and commits are pinned.
12. PG major upgrades preserve rollback material until explicit cleanup.
13. Supabase's internal self-hosted MCP remains private infrastructure; it is not the public Factory MCP.
14. MCP never exposes SecretStore or raw host execution.
15. Cloudflare mode uses one dedicated static Factory tunnel; project creation does not mutate Cloudflare's configuration API or restart `cloudflared`.
16. Cloudflare Tunnel mode keeps Caddy on loopback as a graceful host router; direct Caddy mode remains an independent fallback.

## Current validation

On PR #103 / `feat/supabase-factory-v1`, the dedicated `Supabase Factory` gate passes:

- monorepo TypeScript typecheck
- **98/98 Factory contract/integration tests**
- **0 failures / 0 skipped**
- Cloud-management-dependency guard

The suite includes real AES-GCM/off-host backup roundtrips, restore behavior, WAL/PITR gates, PG15->17 gates, both edge modes, Cloudflare no-per-project-token/no-restart contracts, agent auth/audit, service composition, host preflight, and a real MCP-v2 client roundtrip.

Self-host Release and Mcello Preview are also exercised on every branch update; the normal repository CI independently covers the wider application/build/browser-smoke surface.

## Remaining deployment work

The core Factory V1 architecture and lifecycle primitives are implemented. Remaining work is deliberately narrower:

1. **Real-host Cloudflare E2E:** create/bind one dedicated Factory Tunnel, create the one-time wildcard CNAME, run `FactoryHostPreflight({ cloudflared: true })`, provision a disposable project, verify the real Cloudflare/Tunnel/Caddy/Envoy HTTPS path, migrate, backup off-host, restore-drill, then destroy the disposable test project.
2. **Bootstrap/install packaging:** consume the preflight report and install missing Docker/CLI/Caddy/cloudflared/AWS CLI/rclone/WAL-G prerequisites using the target host's real Linux distribution.
3. **Production MCP authentication:** keep the current SecretStore bearer mode for private trusted use or layer Cloudflare Access Managed OAuth / another OAuth provider over the `FactoryMcpAuthenticator` seam for broader remote access.
4. **Optional Supabase Auth providers:** add OAuth/SMS bindings only for projects that require them; SMTP is already implemented.
5. **Destructive lifecycle completion:** live `restore.apply`, `project.destroy`, and key-rotation handlers remain intentionally fail-closed until their rollback/approval contracts are implemented and tested.
6. **Extraction:** move Factory into its own repository/service after the real-host E2E deployment contract is proven.
