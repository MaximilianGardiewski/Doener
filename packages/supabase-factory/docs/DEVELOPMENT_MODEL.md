# Supabase Factory — current development model

## Scope of this phase

The current phase is deliberately **deployment-neutral**.

We are building and validating this control path:

```text
GitHub repository / CI
        |
        v
ChatGPT <-> Factory MCP
             |
             v
      Supabase Factory core
             |
             v
   self-hosted Supabase runtime
```

The Factory core must not care where the self-hosted Supabase runtime is physically running.

A self-hosted Supabase process necessarily executes on compute somewhere, but **choosing, provisioning and operating that compute is not part of the current architecture decision**. During development the runtime may be local, ephemeral in CI, supplied by a test harness, or later moved to a dedicated machine without changing the ChatGPT/MCP/control-plane contract.

## Explicitly in scope now

- GitHub as source of truth and CI/review surface
- ChatGPT as the human-facing orchestration/control interface
- authenticated Factory MCP as the agent boundary
- declarative Factory manifests
- self-hosted Supabase release/commit compatibility contracts
- Auth/REST/Storage/Realtime/Functions capability modelling
- project lifecycle planning and secret-free state
- self-hosted endpoint health verification
- migrations/backup/restore/upgrade interfaces and their safety contracts
- adapter boundaries that make later deployment replaceable
- tests proving that core behavior contains no Supabase Cloud management dependency

## Explicitly out of scope for now

Do **not** make any of these a prerequisite for core development:

- choosing an Ubuntu/Linux server
- SSH or remote-host provisioning
- a fixed filesystem layout such as `/srv/...`
- systemd
- Caddy
- Cloudflare Tunnel or Quick Tunnel
- DNS/domain selection
- a VPS/dedicated-server provider
- firewall rules
- production TLS topology
- production object-storage vendor
- long-running Factory daemon deployment

Existing implementations for some of these remain in the repository as **optional deployment adapters / prior research**. They are not the current default path and must not leak requirements into the portable core.

## Runtime attachment model

`AttachedSelfHostedInfrastructureProvider` is the development boundary.

A development harness supplies only a secret-free runtime descriptor:

```text
project id
public Supabase gateway URL
Supabase self-host release
exact upstream commit
PostgreSQL major version
enabled Supabase services
```

API/database credentials stay behind `SecretStore` references.

The attached provider can observe and health-check that runtime but deliberately does **not**:

- start Docker
- install packages
- execute SSH
- write systemd units
- change DNS
- call Cloudflare APIs
- select a host
- mutate deployment infrastructure

If runtime version/service drift requires infrastructure mutation, the attached provider fails closed. A future deployment adapter will implement that mutation behind the same `InfrastructureProvider` interface.

## Development composition

`createDevelopmentFactory()` is the default composition for this phase.

By default it uses:

- `MemoryProjectRegistry`
- `MemoryBackupCatalog`
- `MemorySecretStore`
- `MemoryFactoryAuditLog`
- `MemoryAttachedRuntimeCatalog`
- `AttachedSelfHostedInfrastructureProvider`
- `FactoryServiceComposition`
- `FactoryAgentApi`

It can create the authenticated MCP HTTP handler, but it does not bind a socket or assume a web server. Transport/exposure remains an outer adapter.

All persistent/deployment-specific implementations remain replaceable through the same interfaces.

## Layer contract

### Layer A — portable core

Must remain independent of operating system and hosting vendor:

```text
manifest
planner
control plane
registry interface
secret-store interface
lifecycle service interfaces
authorization/audit
MCP tool schemas/handler
```

### Layer B — development runtime integration

Current focus:

```text
attached self-hosted Supabase runtime
health verification
GitHub CI/tests
ChatGPT/MCP contract
```

### Layer C — deployment adapters (later)

Examples already explored but not selected:

```text
Docker host adapter
remote-host adapter
Cloudflare/Caddy edge adapter
persistent secret store
S3/WAL-G production DR
system service/bootstrap packaging
```

Selecting Layer C later must not require redesigning Layers A or B.

## Current development success criteria

This phase is complete when we can demonstrate, without selecting a permanent server:

1. a self-hosted Supabase runtime can be attached through the runtime catalog;
2. ChatGPT-compatible Factory MCP can plan/read/reconcile through the portable core;
3. Auth/REST health and API-key enforcement can be verified through the attached endpoint;
4. application migration interfaces remain direct-to-self-hosted and Cloud-management-token free;
5. runtime version/service drift is detected while infrastructure mutation stays adapter-owned;
6. GitHub CI proves all portable contracts;
7. deployment-specific modules can be removed/replaced without changing Factory manifests or MCP tools.

## Later deployment decision

Only after the development contract is proven do we choose where the runtime lives permanently.

At that point the selected deployment adapter supplies compute/network/persistence details, while these remain stable:

```text
ChatGPT prompts
Factory MCP tool names/schemas
Factory manifests
project registry model
secret references
lifecycle contracts
Supabase compatibility rules
```

That is the portability goal of Supabase Factory.
