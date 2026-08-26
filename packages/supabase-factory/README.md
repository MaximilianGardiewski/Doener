# Supabase Factory

Reusable control plane for provisioning and operating isolated self-hosted Supabase projects without Supabase Cloud management credentials.

> Bootstrap location: this package currently lives inside the Doener/BusinessWebFactory monorepo so the proven self-host implementation and repo CI can exercise it. The package boundary remains extraction-friendly; the target is a dedicated Factory repository/service after the infrastructure contracts stabilize.

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
ChatGPT / Codex / CLI / API
            |
            v
      Factory MCP/API
            |
            v
       Control Plane
  +---------+-----------+
  | Registry / Planner  |
  | Policy / Scheduler  |
  | Backup / Audit      |
  +---------+-----------+
            |
  Infrastructure Providers
            |
   isolated Supabase stacks
```

## Implemented V1 slices

### Project lifecycle

- declarative profiles: `minimal`, `webapp`, `realtime`, `full`, `production-critical`
- idempotent desired-state planner/reconciler
- exact tag + upstream commit supply-chain pinning
- host placement/capacity and stable per-project Envoy-port allocation
- explicit approval gates for migrations and upgrades

### Multi-project Docker isolation

- removes fixed upstream `container_name` collisions
- binds Envoy to a unique `127.0.0.1:<port>` per project
- keeps PostgreSQL/Supavisor host ports private
- scopes Realtime tenant/DNS identity per project and patches the copied Envoy runtime deterministically
- disables unused optional Compose services without modifying the pinned upstream checkout
- requires Compose >= 2.24.4 for deterministic `!override` behavior

### Secrets and Cloud independence

- replaceable `SecretStore` interface
- AES-256-GCM local encrypted SecretStore
- generated Supabase/API/JWT/database secrets never appear in agent-facing records
- central `cloudless-env.ts` deny policy explicitly removes Supabase Cloud project-management variables before self-hosted DB operator commands
- CI allows the Cloud access-token variable name in exactly that deny-policy file and nowhere else in Factory source

### Runtime/Auth

- official Supabase `generate-keys.sh` and `add-new-auth-keys.sh`
- modern publishable/secret keys plus asymmetric signing material
- secure-by-default Auth: email, phone and anonymous signup methods are disabled unless explicitly enabled
- JWT expiry validated to Supabase's documented maximum of 604800 seconds
- production email Auth requires explicit SMTP routing
- SMTP user/password are `SecretRef` bindings, never manifest values
- production phone Auth fails closed until an explicit SMS-provider binding is implemented
- development may explicitly use the official local mail path

### Migrations

Provisioning is schema-neutral. App migrations are a separate lifecycle:

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

### Backup and disaster recovery

Portable DB backup follows Supabase's self-hosted restore guidance:

```text
roles.sql   <- supabase db dump --role-only
schema.sql  <- supabase db dump
data.sql    <- supabase db dump --use-copy --data-only
```

A verified project backup additionally covers:

- `pgsodium_root.key`
- encrypted runtime `.env`
- Factory state/version/Compose/Envoy configuration
- local Storage contents or a verified external S3 backup reference
- PITR/WAL checkpoint when policy requires it; missing capability fails closed
- encrypted artifact hash/authentication

`LocalEncryptedBackupArtifactStore` produces AES-256-GCM authenticated `.sbf` bundles with SHA-256 verification. Plaintext packaging is constrained to `/dev/shm` in local Linux V1. Tests prove SQL values, `.env` credentials and pgsodium material are not present in ciphertext plaintext and that tampering fails verification.

### Restore drills

`DisposableRestoreDrillController` accepts only verified encrypted backups and restores them into explicitly disposable targets. Database restore follows the documented safe ordering in one transaction:

1. roles
2. schema
3. `SET session_replication_role = replica`
4. data

Storage is restored/verified, health checks must pass, and the disposable target plus temporary staging are destroyed even on failure.

### End-to-end health

Container liveness alone is not `HEALTHY`. Factory checks the real public path through TLS/reverse proxy and Envoy:

- `/auth/v1/health` with publishable key -> `200`
- `/rest/v1/` with secret key -> `200`
- `/rest/v1/` without key -> `401`
- privileged probes use `redirect: manual` so keys cannot be redirected to another origin

Running containers with a broken public/TLS/key-enforcement path remain `DEGRADED`.

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

PG15 -> PG17 is explicitly rejected by this path and belongs to a dedicated `pg_upgrade` controller.

## Core invariants

1. One logical project owns one isolated Supabase runtime and credential namespace.
2. Shared hosts/proxies/object-storage infrastructure may exist only below that isolation boundary.
3. Desired state is idempotent; repeated requests converge rather than duplicate.
4. Supabase Cloud project-management credentials are not part of deployment, migration, backup or upgrade execution.
5. Agent-facing APIs return status/references, not secret values.
6. PostgreSQL and Studio remain private in production.
7. Public production health requires HTTPS and working Envoy/Auth/REST key enforcement.
8. Production Storage uses an S3-compatible backend when Storage is enabled.
9. A backup is not `verified` unless database, required Storage, encryption material and artifact verification succeed.
10. PITR is treated as a real provider capability, never as a decorative boolean.
11. Moving upstream `master` is never deployed; releases and reviewed commits are pinned.
12. Supabase's self-hosted internal MCP is private infrastructure, not the public Factory MCP.

## Current validation

Dedicated `Supabase Factory` GitHub Actions currently passes:

- monorepo TypeScript typecheck
- **54/54 Factory contract tests**
- Cloud-management-dependency guard

The normal Doener repository CI, Self-host Release workflow and Mcello preview workflow also pass on the pre-Auth Factory baseline; the Auth extension has its own dedicated Factory gate green.

## Remaining V1 slices

1. Durable **off-host** BackupArtifactStore implementation rather than local-disk-only encrypted artifacts.
2. Concrete S3 snapshot/replication adapter and WAL/PITR provider implementation.
3. Provider-neutral reverse-proxy/DNS binding contract plus concrete deployment adapter once the DNS/TLS platform is chosen.
4. SMS/OAuth Auth-provider bindings as needed; SMTP is implemented.
5. Dedicated PG15 -> PG17 `pg_upgrade` controller with disk/extension/backup gates.
6. Factory MCP/API facade, authorization and audit log.
7. Extract the package into its own repository/service once provider + restore contracts are stable.
