# Supabase Factory

Reusable control-plane core for provisioning isolated self-hosted Supabase projects without Supabase Cloud management credentials.

> Bootstrap location: this package lives temporarily inside the Doener/BusinessWebFactory monorepo so the existing self-hosted implementation and CI can exercise it. The package boundary is intentionally extraction-friendly; the target is a dedicated Supabase Factory repository/service.

## Baseline (2026-08-26)

The reviewed default is:

- official self-hosted release `self-hosted/v0.8.0`
- PostgreSQL 17 for new projects
- Envoy as the API gateway
- Docker Compose as the first infrastructure provider
- `sb_publishable_*` / `sb_secret_*` as the external runtime key model
- project-specific JWT signing material/JWKS
- no `SUPABASE_ACCESS_TOKEN`, `supabase login`, `supabase link`, hosted project ref, or Supabase Platform Management API in the deployment control path

Official references:

- https://supabase.com/docs/guides/self-hosting
- https://supabase.com/docs/guides/self-hosting/docker
- https://supabase.com/docs/guides/self-hosting/updating
- https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys
- https://supabase.com/docs/guides/self-hosting/postgres-upgrade-17
- https://supabase.com/docs/guides/self-hosting/self-hosted-s3
- https://supabase.com/docs/guides/self-hosting/enable-mcp

## Why a control plane

A self-hosted Supabase deployment represents one project. Self-hosting does not provide the hosted platform's multi-project/organization management, branching, managed backups/PITR, advanced platform metrics, or Platform Management API. Supabase Factory owns that missing lifecycle layer.

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

## Core invariants

1. **One logical project, one isolated Supabase runtime.** Auth users, database data, Storage namespace, API/JWT keys, migrations and backups are not shared with another project.
2. **Shared infrastructure is allowed only below the isolation boundary.** A host, reverse proxy, monitoring system or S3-compatible cluster may be shared; project networks, credentials and buckets remain scoped.
3. **Desired state is declarative and idempotent.** Running the same request twice must converge, not duplicate the project.
4. **No Supabase Cloud control-plane dependency.** Production migrations use direct protected database connectivity, following the proven Doener/StreamForge model.
5. **Secrets are write-only from the agent-facing control plane.** MCP/API results contain status flags/references, never secret values.
6. **Destructive or compatibility-sensitive transitions require explicit approval.** PostgreSQL/Supabase upgrades, restore and destroy operations cannot be silently applied by an agent.
7. **Production PostgreSQL and Studio are private.** The public boundary is HTTPS through the reverse proxy/API gateway.
8. **Production Storage uses an S3-compatible backend when Storage is enabled.** Local file Storage is for development/disposable use.
9. **Backup means project backup, not only `pg_dump`.** The provider must cover database, PITR where configured, Storage objects, project configuration and required encryption/signing material, with restore verification.
10. **Upstream stays pinned and upgradable.** Do not fork/vendor a moving Supabase `master`; record the reviewed self-hosted release and use the supported incremental update path.

## Profiles

- `minimal`: database + Auth + REST + gateway
- `webapp`: minimal + Storage + internal Studio
- `realtime`: webapp + Realtime
- `full`: realtime + Edge Functions
- `production-critical`: full + hourly logical backup defaults, PITR, Storage replication and weekly restore-drill policy

Individual services can be disabled/enabled in the manifest, while mandatory isolation/security rules remain enforced by policy.

## Example manifest

```ts
import { FACTORY_API_VERSION, planProject } from "@business-web/supabase-factory";

const plan = planProject({
  apiVersion: FACTORY_API_VERSION,
  project: {
    id: "customer-portal",
    environment: "production",
  },
  profile: "webapp",
  features: {
    realtime: false,
    functions: false,
  },
  storage: {
    backend: "s3",
    region: "eu-central-1",
  },
});
```

The plan contains deterministic operations and explicitly declares:

```text
cloudManagementCredentialsRequired: false
exposesSecretValues: false
```

## Provider boundary

`InfrastructureProvider` is intentionally narrow. Providers may touch Docker, remote hosts, DNS, object storage and a secret manager. The rest of the control plane cannot.

A provider returns only:

- lifecycle state
- public URL (when applicable)
- whether publishable/secret/database credentials were configured

It must not return secret values.

The first concrete provider should implement the official self-hosted Docker flow using a pinned `self-hosted/v*` release and its shipped `setup.sh`, `run.sh`, key utilities and `update.sh`, with Doener's preflight/migration/backup/restore contracts generalized around it.

## MCP boundary

The factory MCP is **not** the self-hosted Supabase Studio MCP. Supabase documents its self-hosted MCP endpoint as private-only and currently not OAuth 2.1 protected; it should remain behind VPN/SSH allow-listing. The Factory MCP is a separate infrastructure control plane that may optionally access a project's private MCP from a trusted worker.

Planned agent-facing tools:

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
factory.restore.create
factory.keys.rotate
factory.upgrade.plan
factory.upgrade.apply
factory.health.check
factory.audit.get
```

## Next implementation slices

1. Docker Compose provider using official `self-hosted/v0.8.0` setup/update utilities.
2. Secret-store provider (local encrypted dev implementation plus production adapter boundary).
3. Host placement/resource scheduler so full stacks are not naively overcommitted.
4. Reverse-proxy/DNS provider.
5. Project backup bundle + disposable restore verifier.
6. MCP server facade over the control plane.
7. Extraction into its own repository once the provider integration contract is stable.
