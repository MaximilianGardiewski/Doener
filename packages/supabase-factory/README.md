# Supabase Factory

Reusable control plane for provisioning and operating isolated self-hosted Supabase projects without Supabase Cloud management credentials.

> Bootstrap location: this package currently lives inside the Doener/BusinessWebFactory monorepo so the proven self-host implementation and repo CI can exercise it. The package boundary remains extraction-friendly; the target is a dedicated Factory repository/service after the service-composition and transport contracts stabilize.

## Reviewed baseline — 2026-08-26

- official Supabase self-host release `self-hosted/v0.8.0`
- exact reviewed upstream commit `241bb11c0627f2981746d37033f57dbfa81d29b0`
- PostgreSQL 17 for new projects
- Envoy default gateway
- Docker Compose production runtime; Supabase CLI local-dev stack is not used as production hosting
- Supabase CLI `2.115.0` pinned for direct migration/logical-backup operations
- modern `sb_publishable_*` / `sb_secret_*` API keys plus ES256/JWKS material
- no `supabase login`, `supabase link`, hosted project ref, Platform Management API, or Supabase Cloud access-token dependency in project lifecycle operations

Primary upstream documentation:

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

## Why Factory exists

Supabase documents one self-hosted deployment as a **single project**. The self-hosted product intentionally does not provide the managed platform's organization/project lifecycle, branching, managed backups/PITR, Platform Management API or complete operations layer. Factory supplies that missing control plane.

```text
ChatGPT / Codex / CLI / MCP / API
              |
              v
       Factory Agent API
     authz + audit boundary
              |
              v
         Control Plane
  +-----------+------------+
  | Registry / Planner     |
  | Policy / Scheduler     |
  | Migration / Backup     |
  | Restore / Upgrade      |
  +-----------+------------+
              |
    Infrastructure adapters
      /       |        \
 Docker    Edge/HTTPS    DR
              |
       isolated projects
```

## Implemented V1 slices

### Project lifecycle and Docker isolation

- declarative profiles: `minimal`, `webapp`, `realtime`, `full`, `production-critical`
- idempotent desired-state planner/reconciler
- exact tag + upstream commit supply-chain pinning
- host placement/capacity and stable per-project Envoy-port allocation
- removes fixed upstream `container_name` collisions
- binds Envoy to a unique `127.0.0.1:<port>` per project
- keeps PostgreSQL/Supavisor host ports private
- scopes Realtime tenant/DNS identity per project and patches copied Envoy config deterministically
- disables unused optional Compose services without modifying the pinned upstream checkout
- requires Compose >= 2.24.4 for deterministic `!override` behavior

### Secrets and Cloud independence

- replaceable `SecretStore` interface
- AES-256-GCM local encrypted SecretStore
- generated Supabase/API/JWT/database secrets never appear in agent-facing records
- central `cloudless-env.ts` deny policy removes Supabase Cloud project-management variables before self-hosted DB operator commands
- CI permits the Cloud access-token variable name in exactly that deny-policy file and nowhere else in Factory source

### Runtime/Auth

- official Supabase `generate-keys.sh` and `add-new-auth-keys.sh`
- modern publishable/secret keys plus asymmetric signing material
- secure-by-default Auth: email, phone and anonymous signup disabled until explicitly enabled
- JWT expiry validated to Supabase's documented maximum of 604800 seconds
- production email Auth requires explicit SMTP routing
- SMTP user/password are `SecretRef` bindings, never manifest values
- production phone Auth fails closed until an SMS-provider binding exists
- development may explicitly use the official local mail path

### Migrations

Provisioning is schema-neutral. App migrations remain a separate lifecycle:

```text
factory.migrations.plan
  -> verify placement and pinned CLI
  -> verify optional exact source Git SHA / clean tracked tree
  -> remove Cloud-management variables
  -> supabase db push --db-url ... --dry-run

factory.migrations.apply
  -> explicit APPLY_MIGRATIONS approval
  -> fresh dry-run
  -> supabase db push --db-url ...
  -> migration history verification
```

PostgreSQL remains private; the trusted host reaches the project DB inside Docker networking.

### Complete encrypted project backups

Portable DB backup follows Supabase's self-hosted restore guidance:

```text
roles.sql   <- supabase db dump --role-only
schema.sql  <- supabase db dump
data.sql    <- supabase db dump --use-copy --data-only
```

A verified project backup additionally covers `pgsodium_root.key`, encrypted runtime `.env`, Factory state/version/Compose/Envoy configuration, Storage and PITR when required.

`LocalEncryptedBackupArtifactStore` creates AES-256-GCM authenticated `.sbf` bundles with SHA-256 verification. Plaintext packaging is constrained to `/dev/shm` in local Linux V1.

`S3EncryptedBackupArtifactStore` is the durable off-host adapter:

- uploads **only encrypted `.sbf` bytes** to S3-compatible object storage
- credentials enter the AWS CLI only through the child-process environment
- immediately downloads the remote object after upload
- re-verifies SHA-256 and AES-GCM authentication
- deletes the local encrypted staging copy after the remote roundtrip
- restores directly from the off-host artifact through the same verified format

### Storage disaster-recovery mirror

`RcloneS3StorageBackupProvider` treats the live Supabase Storage backend and the DR copy as separate resources instead of assuming that “S3” automatically means “backed up”.

- source and target may be different S3-compatible providers
- credentials are materialized only into a mode-0600 rclone config under `/dev/shm`
- backup destination is immutable and scoped as `<base>/<project>/<backup-id>`
- `rclone copy --checksum --metadata --immutable`
- immediate `rclone check --one-way --download`
- deterministic remote inventory hash via `rclone lsjson --hash`
- later verification recomputes the inventory and fails on drift

### WAL/PITR

`WalGPitrProvider` is a concrete PITR capability adapter rather than a decorative flag.

For each verified checkpoint it:

1. resolves the private project database
2. creates a named PostgreSQL restore point
3. forces `pg_switch_wal()`
4. records the current LSN
5. runs verified WAL-G `backup-push`
6. confirms the new base backup through `backup-list`
7. runs `wal-show`
8. accepts the checkpoint only when the archive is gap-free and reports `OK`

DB/S3 credentials remain environment-only and never appear in WAL-G or `psql` command arguments.

### Restore drills

`DisposableRestoreDrillController` accepts only verified encrypted backups and restores them into explicitly disposable targets. Database restore follows the documented safe ordering in one transaction:

1. roles
2. schema
3. `SET session_replication_role = replica`
4. data

Storage is restored/verified, health checks must pass, and the disposable target plus temporary staging are destroyed even on failure.

### Tokenless wildcard DNS + HTTPS edge

Factory supports a token-free per-project DNS strategy:

```text
*.supabase.example.com  ->  Factory server IP
```

That wildcard record is configured once. New projects do not need a DNS-provider API token.

`WildcardDnsVerifier` checks that the requested project hostname actually resolves to the expected host IP before edge configuration is written.

`CaddyReverseProxyBindingProvider` is the concrete default HTTPS adapter:

- one managed Caddy fragment per Factory project
- imports fragments into the host Caddyfile idempotently
- only permits `127.0.0.1:<project-envoy-port>` upstreams
- validates configuration before reload
- Caddy owns ACME/TLS and reverse proxying

The existing public health verifier then confirms the real HTTPS path through Caddy and Envoy.

### End-to-end health

Container liveness alone is not `HEALTHY`. Factory verifies:

- `/auth/v1/health` with publishable key -> `200`
- `/rest/v1/` with secret key -> `200`
- `/rest/v1/` without key -> `401`
- HTTPS boundary
- privileged probes use `redirect: manual` so keys cannot be redirected to another origin

Running containers with broken TLS/proxy/key enforcement remain `DEGRADED`.

### Supabase release upgrades

Normal self-host release upgrades are separate from PostgreSQL major upgrades:

```text
factory.upgrade.plan
  -> resolve official target tag
  -> verify exact reviewed target commit
  -> update.sh --dry-run --to <release>

factory.upgrade.apply
  -> explicit APPLY_SUPABASE_UPGRADE approval
  -> fresh preview/integrity check
  -> fresh verified encrypted Factory backup
  -> update.sh --to <release> --yes
  -> reapply Factory isolation/runtime layers
  -> run.sh pull
  -> run.sh recreate
  -> end-to-end health/integrity verification
```

### PostgreSQL 15 -> 17 major upgrade

`Postgres15To17UpgradeController` wraps Supabase's official `utils/upgrade-pg17.sh` but adds stricter automation gates before calling the script with `--yes`:

- only accepts 15 -> 17
- Supabase release change cannot be mixed into the same operation
- confirms the current DB image is PG15
- refuses stale `data.bak.pg15` from a previous attempt
- hard-fails unless free disk is at least `2 * data-size + 5 GiB`
- hard-fails on `timescaledb`, `plv8`, `plcoffee` or `plls` instead of auto-dropping them
- requires a freshly verified encrypted Factory backup
- runs the official PG17 migration script
- verifies `server_version_num` is PG17
- requires preserved PG15 data and pgsodium-key rollback artifacts
- re-runs Factory runtime and public-health verification

The original PG15 data is deliberately retained after success; deleting rollback material is a later explicit maintenance operation, never part of the upgrade itself.

### Agent/API authorization boundary

`FactoryAgentApi` is the transport-neutral boundary intended for ChatGPT/Codex, MCP, HTTP or CLI adapters.

Implemented tool contract includes project plan/create/get/list/reconcile/destroy, migration plan/apply, backup create/verify, restore drill/apply, key rotation, Supabase upgrade plan/apply, PG17 plan/apply, health and audit operations.

Security properties:

- role/permission authorization occurs before handler execution
- tools declare whether they mutate or destroy state
- destructive operations are explicitly marked for transport/UI approval handling
- handlers are private wiring; Docker executors and SecretStore are never exposed as tools
- audit records contain principal/request/tool/project/outcome metadata only
- tool arguments and outputs are never written to the audit log
- internal handler errors are flattened before they reach an agent
- file audit log is JSONL mode `0600`

## Core invariants

1. One logical project owns one isolated Supabase runtime and credential namespace.
2. Shared hosts/proxies/object-storage infrastructure may exist only below that isolation boundary.
3. Desired state is idempotent; repeated requests converge rather than duplicate.
4. Supabase Cloud project-management credentials are not part of deployment, migration, backup or upgrade execution.
5. Agent-facing APIs return status/references, not secret values.
6. PostgreSQL and Studio remain private in production.
7. Public production health requires HTTPS and working Envoy/Auth/REST key enforcement.
8. Production Storage uses an S3-compatible backend when Storage is enabled.
9. “Backup”, “Storage replication” and “PITR” are independent verifiable capabilities.
10. A project backup is not `verified` unless required database, Storage, encryption material and artifact verification all succeed.
11. PITR fails closed when WAL continuity cannot be proven.
12. Moving upstream `master` is never deployed; releases and reviewed commits are pinned.
13. PG major upgrades preserve rollback data until a separate explicit cleanup.
14. Supabase's self-hosted internal MCP remains private infrastructure and is never treated as the public Factory MCP.

## Current validation

On PR #103 / `feat/supabase-factory-v1`, the dedicated `Supabase Factory` GitHub Actions gate currently passes:

- monorepo TypeScript typecheck
- **77/77 Factory contract tests**
- Cloud-management-dependency guard

The same head also passes the Self-host Release workflow and Mcello preview workflow. The normal repository CI is independently exercised on every branch update.

## Remaining V1 integration work

The foundational provider/controller work is now largely complete. The remaining work is mostly composition/deployment rather than new lifecycle primitives:

1. Build the **service composition** that wires `FactoryAgentApi` handlers to the existing control-plane, migration, backup, restore, health and upgrade controllers.
2. Add an authenticated **MCP/HTTP transport** around `FactoryAgentApi`; the transport must never expose SecretStore or raw host execution and must preserve the existing authorization/audit boundary.
3. Add a persistent **backup catalog** so agent calls can select a verified backup by project/backup ID instead of passing internal records around.
4. Add optional OAuth/SMS Auth bindings only when a project requires them; SMTP is implemented.
5. Package host prerequisites/installation for Docker, Supabase CLI, Caddy, rclone and WAL-G and add a real-host end-to-end provisioning smoke test.
6. Extract Factory into its own repository/service once the composition and deployment contract is stable.
