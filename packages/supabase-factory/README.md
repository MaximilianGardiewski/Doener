# Supabase Factory

Reusable control-plane core for provisioning isolated self-hosted Supabase projects without Supabase Cloud management credentials.

> Bootstrap location: this package lives temporarily inside the Doener/BusinessWebFactory monorepo so the existing self-hosted implementation and CI can exercise it. The package boundary is intentionally extraction-friendly; the target is a dedicated Supabase Factory repository/service.

## Baseline reviewed on 2026-08-26

The current reviewed default is:

- official self-hosted release `self-hosted/v0.8.0`
- exact upstream commit `241bb11c0627f2981746d37033f57dbfa81d29b0`
- PostgreSQL 17 for new projects
- Envoy as the API gateway
- Docker Compose as the first infrastructure provider
- Supabase CLI `2.115.0` for migration and logical-backup operations
- `sb_publishable_*` / `sb_secret_*` as the external runtime key model
- project-specific ES256/JWKS material while legacy keys remain available only for compatibility
- no Supabase Cloud login/link/project-ref dependency in the deployment or migration path

Official references:

- https://supabase.com/docs/guides/self-hosting
- https://supabase.com/docs/guides/self-hosting/docker
- https://supabase.com/docs/guides/self-hosting/updating
- https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys
- https://supabase.com/docs/guides/self-hosting/postgres-upgrade-17
- https://supabase.com/docs/guides/self-hosting/self-hosted-s3
- https://supabase.com/docs/guides/self-hosting/self-hosted-envoy
- https://supabase.com/docs/guides/self-hosting/self-hosted-proxy-https
- https://supabase.com/docs/guides/self-hosting/enable-mcp
- https://supabase.com/docs/reference/cli/supabase-db-push
- https://supabase.com/docs/guides/self-hosting/restore-from-platform

## Why a control plane

Supabase documents a self-hosted deployment as a **single project**. Self-hosting does not provide the hosted platform's organization/project management, branching, managed backups/PITR, Platform Management API, or the full managed operations layer. Supabase Factory owns that missing lifecycle layer.

The Supabase CLI local-development stack is explicitly **not** the production runtime. Factory V1 provisions the official self-hosted Docker stack and only uses the CLI as an operator tool for direct database migrations/backups.

```text
ChatGPT / Codex / CLI / API
            |
            v
   Supabase Factory MCP/API
            |
            v
       Control Plane
  +---------+-----------+
  | Registry / Planner  |
  | Policy / Scheduler  |
  | Backup / Audit      |
  +---------+-----------+
            |
   InfrastructureProvider
            |
      Docker Compose V1
            |
  isolated project stacks
```

## Implemented V1 slices

- declarative project manifest and profiles
- pinned Supabase tag + exact upstream commit validation
- idempotent create/reconcile planner
- host placement and unique loopback Envoy-port allocation
- multi-project Compose override that removes fixed upstream `container_name` collisions
- private PostgreSQL/Supavisor boundary
- per-project Realtime tenant/DNS identity and Envoy patching
- production S3 Storage policy
- encrypted local SecretStore adapter plus replaceable production SecretStore interface
- verified official self-host runtime bootstrap and key generation
- Docker infrastructure provider and runtime binding boundary
- direct self-hosted migration controller using `db push --db-url`
- pinned CLI version and defensive removal of Cloud project-management environment variables
- mandatory migration dry-run immediately before mutating apply
- full project backup contract covering logical DB dumps, pgsodium key, runtime config, encrypted secret files, Storage and optional PITR capability
- dedicated CI contract tests

## Core invariants

1. **One logical project, one isolated Supabase runtime.** Auth users, database data, Storage namespace, API/JWT keys, migrations and backups are not shared with another project.
2. **Shared infrastructure is allowed only below the isolation boundary.** A host, reverse proxy, monitoring system or S3-compatible cluster may be shared; project networks, credentials and buckets remain scoped.
3. **Desired state is declarative and idempotent.** Running the same request twice must converge, not duplicate the project.
4. **No Supabase Cloud control-plane dependency.** Self-host migrations operate via a protected direct database URL, not `supabase login`/`supabase link`.
5. **Secrets are write-only from the agent-facing control plane.** MCP/API results contain status flags/references, never secret values.
6. **Destructive or compatibility-sensitive transitions require explicit approval.** PostgreSQL/Supabase upgrades, restore and destroy operations cannot be silently applied by an agent.
7. **Production PostgreSQL and Studio are private.** The public boundary is HTTPS through a reverse proxy in front of Envoy.
8. **Production Storage uses an S3-compatible backend when Storage is enabled.** Local file Storage is for development/disposable use.
9. **Backup means project backup, not only a database dump.** It covers portable Supabase-aware database dumps, Storage, project configuration, encryption/signing material and verification.
10. **PITR is a capability, not a boolean fiction.** If a project policy requires PITR and no WAL/PITR provider can prove recoverability, backup/provisioning must fail closed.
11. **Upstream stays pinned and incrementally upgradable.** Do not deploy moving `master`; use the supported self-hosted release/update path and an independently verified commit pin.
12. **The Supabase-internal MCP is private.** It is not the Factory MCP and must not be exposed directly to the Internet.

## Production notes from current Supabase documentation

- HTTPS is required in production; Caddy, Nginx, Traefik or another reverse proxy may terminate TLS in front of Envoy.
- Envoy is the current default self-hosted gateway and listens internally on port `8000`.
- The official Storage service already uses `STORAGE_PUBLIC_URL=${SUPABASE_PUBLIC_URL}` and `REQUEST_ALLOW_X_FORWARDED_PATH=true`; Factory preserves these settings so S3/SigV4 requests routed through Envoy work correctly.
- Email/password, OTP, magic-link and invitation workflows require a real production SMTP provider.
- `update.sh` preserves/merges runtime configuration but does **not** back up Postgres or Storage data. Factory backup runs separately before upgrades.
- PostgreSQL 15 -> 17 is a real data migration, not an image-tag flip. Extension compatibility and the pgsodium root key must be checked first.

## Profiles

- `minimal`: database + Auth + REST + gateway
- `webapp`: minimal + Storage + internal Studio
- `realtime`: webapp + Realtime
- `full`: realtime + Edge Functions
- `production-critical`: full + hourly logical-backup policy, PITR requirement, Storage replication and weekly restore-drill policy

Individual services can be disabled/enabled in the manifest while mandatory isolation/security rules remain enforced by policy.

## Migration lifecycle

Provisioning intentionally does **not** apply application migrations. Migration deployment is a separate operation:

```text
factory.migrations.plan
  -> verify project placement
  -> verify exact Supabase CLI version
  -> verify optional source Git SHA / clean tracked tree
  -> remove Supabase Cloud management variables from command environment
  -> supabase db push --db-url ... --dry-run

factory.migrations.apply
  -> explicit APPLY_MIGRATIONS approval
  -> repeat fresh dry-run
  -> supabase db push --db-url ...
  -> read migration history
```

The database remains unexposed publicly; Docker Provider V1 reaches the private database from its trusted host boundary.

## Backup lifecycle

Supabase recommends its CLI dump path for portable restores because it applies Supabase-specific filtering instead of blindly dumping internal schemas. Factory creates:

```text
roles.sql   <- supabase db dump --role-only
schema.sql  <- supabase db dump
data.sql    <- supabase db dump --use-copy --data-only
```

The project backup contract also includes:

- `pgsodium_root.key` as sensitive in-memory backup material
- `.env` only through an artifact store that guarantees encryption at rest
- `.factory-state.json`, `.supabase-version`, Factory Compose override and patched Envoy config
- local Storage contents for file-backed development projects, or a verified external Storage snapshot for S3-backed projects
- PITR/WAL checkpoint when policy requires it
- artifact checksum and verification before a backup record can become `verified: true`

Temporary plaintext staging directories are removed after the artifact store has persisted the encrypted backup.

## MCP boundary

The Factory MCP is **not** the self-hosted Supabase Studio MCP. Supabase currently documents its self-hosted MCP endpoint as lacking OAuth 2.1 and not intended for Internet exposure; use VPN/SSH/private networking only. The Factory MCP will be a separate authenticated infrastructure control plane that may access project-internal Supabase MCP endpoints from trusted workers.

Planned/implemented agent-facing surface:

```text
factory.project.plan
factory.project.create
factory.project.get
factory.project.list
factory.project.reconcile
factory.project.destroy
factory.migrations.plan
factory.migrations.apply
factory.backup.create
factory.backup.verify
factory.restore.drill
factory.restore.apply
factory.keys.rotate
factory.upgrade.plan
factory.upgrade.apply
factory.health.check
factory.audit.get
```

## Next implementation slices

1. Disposable restore-drill controller that restores a verified backup into an isolated temporary project and destroys it after health/integrity checks.
2. Concrete encrypted BackupArtifactStore adapter plus durable off-host/object-storage target.
3. Concrete S3 replication/snapshot adapter and WAL/PITR provider boundary implementation.
4. Reverse-proxy/DNS binding provider with HTTPS verification.
5. Auth runtime configuration, including production SMTP/provider secret handling.
6. Staged `update.sh` / PostgreSQL upgrade controller with mandatory pre-upgrade backup.
7. Factory MCP/API facade and audit log.
8. Extraction into its own repository once infrastructure-provider and restore contracts are stable.
