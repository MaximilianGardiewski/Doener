# Supabase Factory

Portable control plane for operating isolated **Supabase Self-Hosted** projects without using Supabase Cloud as the management plane.

## Current phase

We are **not selecting or integrating a permanent server yet**.

The development target is:

```text
GitHub
  |
  | source / CI / review
  v
ChatGPT <-> authenticated Factory MCP
                    |
                    v
             Supabase Factory core
                    |
                    v
        self-hosted Supabase runtime
```

The Factory core does not care where that self-hosted runtime physically executes. During development it may be local, supplied by a test harness or created ephemerally in GitHub CI. Later it can move behind any deployment adapter **without changing ChatGPT prompts, MCP tools, repository manifests or the control-plane model**.

A self-hosted Supabase process obviously needs compute while it runs; choosing and operating permanent compute is simply **not an architecture decision in the current phase**.

See:

- [`docs/DEVELOPMENT_MODEL.md`](docs/DEVELOPMENT_MODEL.md)
- [`docs/GITHUB_CHATGPT_WORKFLOW.md`](docs/GITHUB_CHATGPT_WORKFLOW.md)

## What we use now

- **GitHub** — source of truth, PRs, CI and reproducible project history
- **ChatGPT** — human-facing orchestration surface
- **Factory MCP** — authenticated agent/tool boundary
- **Supabase Factory core** — manifests, planning, lifecycle contracts, authorization, audit and state
- **Supabase Self-Hosted** — application backend/runtime target

No permanent Linux host, system service, DNS provider, reverse proxy or tunnel is required by the current development contract.

## GitHub-first repository contract

Each application repository can carry two **secret-free** Factory files:

```text
.supabase-factory/project.json
.supabase-factory/lock.json
```

`project.json` is the desired state edited by the user/ChatGPT. `lock.json` is the deterministic Factory-generated handoff containing the resolved Supabase release, exact upstream commit, PostgreSQL version, service set and policy defaults.

The lock explicitly records:

```text
containsSecretValues: false
deploymentTargetSelected: false
```

The repository parser rejects secret-like fields and Supabase Cloud management material so GitHub never becomes the secret store. Secrets remain behind the `SecretStore` interface.

Application schema remains normal repository code under:

```text
supabase/migrations/
```

This deliberately separates runtime/lifecycle policy from application database schema.

## Core independence goal

Factory never uses Supabase Cloud as a project-management dependency.

Normal project lifecycle code must not require:

- `SUPABASE_ACCESS_TOKEN`
- `sbp_*`
- `supabase login`
- `supabase link`
- hosted Supabase project refs
- Supabase Platform Management API

The CI guard enforces this boundary.

## Reviewed Supabase baseline — 2026-08-26

- Self-Hosted release: `self-hosted/v0.8.0`
- exact reviewed upstream commit: `241bb11c0627f2981746d37033f57dbfa81d29b0`
- PostgreSQL 17 for new projects
- Envoy gateway
- Supabase CLI `2.115.0` for direct self-hosted migration/logical-backup operations
- modern `sb_publishable_*` / `sb_secret_*` API-key model plus ES256/JWKS material
- MCP TypeScript SDK v2 / MCP 2026-07-28

## Portable architecture

### Layer A — core

This layer must remain deployment-neutral:

```text
manifest
planner
control plane
InfrastructureProvider interface
ProjectRegistry interface
SecretStore interface
lifecycle service interfaces
FactoryAgentApi
authorization + audit
MCP schemas + handler
repository contract
```

No OS, Docker, SSH, DNS, Cloudflare, Caddy or server filesystem is required here.

### Layer B — current development integration

`createDevelopmentFactory()` is the default composition for this phase.

Its defaults are deliberately host-neutral:

- `MemoryProjectRegistry`
- `MemoryBackupCatalog`
- `MemorySecretStore`
- `MemoryFactoryAuditLog`
- `MemoryAttachedRuntimeCatalog`
- `AttachedSelfHostedInfrastructureProvider`
- `FactoryServiceComposition`
- `FactoryAgentApi`

It can create the Factory MCP HTTP handler but does not bind a network socket or decide how that handler is exposed.

### Attached self-hosted runtime

`AttachedSelfHostedInfrastructureProvider` allows development to point Factory at an already-running Supabase Self-Hosted runtime.

The runtime descriptor contains only:

- Factory project ID
- self-hosted Supabase gateway URL
- Supabase release
- exact upstream commit
- PostgreSQL major version
- enabled Supabase services

Credentials remain behind `SecretStore` references.

The provider can observe and health-check the runtime. It deliberately does **not**:

- provision a server
- start Docker
- SSH anywhere
- install packages
- create systemd units
- manage DNS
- call Cloudflare
- select a hosting provider

If runtime drift requires infrastructure mutation, it fails closed. A future deployment adapter implements that mutation through the same `InfrastructureProvider` interface.

## ChatGPT / MCP contract

`FactoryAgentApi` remains the transport-neutral boundary and MCP remains the intended ChatGPT integration.

Implemented tool families include:

- project plan/create/get/list/reconcile
- health
- migration plan/apply
- backup create/verify when a backup implementation is composed
- restore drill when composed
- Supabase release upgrade plan/apply when composed
- PostgreSQL 17 plan/apply when composed

Unsupported destructive actions remain unregistered / `TOOL_NOT_CONFIGURED` rather than being faked.

MCP guarantees include:

- authorization before handler execution
- Zod-v4 tool input validation
- only configured handlers appear in `tools/list`
- read-only/destructive annotations
- replaceable authentication
- strict Host and optional Origin validation
- no SecretStore or raw execution surface exposed to the agent
- secret-free audit metadata

A real MCP-v2 client roundtrip is covered by CI.

## Health contract

A runtime is not considered healthy just because something is listening.

Factory verifies the self-hosted endpoint contract:

- Auth health succeeds with the publishable key
- REST succeeds with the secret key
- REST rejects a request without an API key
- HTTPS is required unless local/ephemeral development explicitly allows HTTP
- privileged probes never follow redirects

The same verifier works regardless of where the runtime eventually lives.

## Migrations

Provisioning and application schema remain separate lifecycle concerns.

Current migration contract:

```text
factory.migrations.plan
  -> exact Supabase CLI version
  -> optional exact source Git SHA / clean tracked tree
  -> Cloud-management variables stripped
  -> supabase db push --db-url ... --dry-run

factory.migrations.apply
  -> explicit APPLY_MIGRATIONS
  -> fresh dry-run
  -> direct self-hosted db push
  -> migration-history verification
```

The current Docker migration implementation is one adapter. The lifecycle interface itself is not Docker-specific.

## Backup / restore / upgrade contracts

The project already contains implementations and tests for:

- Supabase-aware roles/schema/data logical backup
- `pgsodium_root.key`
- AES-256-GCM `.sbf` artifacts
- persistent backup catalog
- off-host S3 artifact verification
- Storage DR mirror
- WAL-G PITR continuity verification
- disposable restore drills
- staged Supabase release upgrades
- PostgreSQL 15 -> 17 upgrade gates

These are retained because their **contracts** matter now, but production storage/network/host choices are not selected in this phase.

## Deployment adapters already explored — parked for later

Earlier work produced optional adapters for:

- Docker Compose project provisioning
- host placement / persistent port allocation
- Caddy wildcard routing
- named Cloudflare Tunnel routing
- Cloudflare Quick Tunnels
- host preflight
- single-host bootstrap/service packaging

They remain in the repository so the work is not lost, but they are **not the current default architecture and not a prerequisite for development**.

In particular, we are not currently deciding:

```text
Ubuntu vs another OS
VPS vs dedicated server vs home server
Cloudflare vs direct TLS
systemd vs containers vs another service manager
specific DNS/domain topology
```

Those decisions come later.

## Core invariants

1. One logical project owns one isolated self-hosted Supabase identity and lifecycle state.
2. Supabase Cloud management credentials are absent from the Factory lifecycle.
3. ChatGPT/MCP sees status and references, never secret values.
4. Manifests and MCP tools are stable across deployment adapters.
5. Runtime health is verified at the Supabase API boundary.
6. Infrastructure mutation belongs to `InfrastructureProvider`, not to the core.
7. Development can attach a self-hosted runtime without choosing its permanent host.
8. GitHub stores desired state and migrations, never runtime secrets.
9. `.supabase-factory/lock.json` is deployment-neutral and reproducible.
10. Later deployment adapters may be replaced without redesigning the core.
11. Unsupported destructive behavior fails closed.
12. Upstream Supabase releases/commits remain pinned and reviewable.

## CI-enforced portability boundary

The dedicated workflow now rejects direct deployment dependencies in the current development modules. `development-factory.ts`, `attached-runtime.ts` and `repository-contract.ts` are prevented from importing Docker/host/Cloudflare/edge/single-host adapters or filesystem/process/socket-oriented Node modules.

This makes the server-agnostic separation a tested code boundary rather than only a documentation rule.

## Validation

On PR #103 / `feat/supabase-factory-v1`, the dedicated Factory gate passes:

- monorepo TypeScript typecheck
- **126/126 Factory tests**
- **0 failed**
- **0 skipped**
- portable-development dependency guard
- Supabase Cloud management-dependency guard

The tests explicitly verify:

- in-memory SecretStore without OS/filesystem dependency
- attaching a self-hosted Supabase runtime without Docker/systemd/DNS/Cloudflare assumptions
- detecting release drift while refusing deployment mutation
- exact reviewed Supabase baseline independent from deployment destination
- stable `.supabase-factory/project.json` and `lock.json` paths
- secret-free deterministic lock generation
- rejection of secret-like repository fields
- rejection of Supabase Cloud management material in repository manifests
- manifest hash drift when declarative desired state changes

## Current roadmap

The next work stays inside the current toolchain:

1. strengthen the GitHub repository contract and ChatGPT project workflow;
2. make the ChatGPT-facing MCP workflow ergonomic and project-oriented;
3. add an ephemeral real Supabase Self-Hosted integration smoke in GitHub CI/test infrastructure, without selecting a permanent server;
4. exercise migrations and project lifecycle against that disposable runtime;
5. tighten generated project handoff/config so a later deployment adapter can take over cleanly;
6. only then choose permanent hosting/networking and plug in the appropriate adapter.

The server question is intentionally deferred.
