# GitHub + ChatGPT + Supabase Factory workflow

This is the intended workflow for the current development phase. It does not select a permanent server.

## Repository is the declarative source of truth

Each application repository can carry two secret-free files:

```text
.supabase-factory/project.json
.supabase-factory/lock.json
```

### `project.json`

Human/ChatGPT-edited desired state.

Example:

```json
{
  "apiVersion": "factory.supabase.local/v1",
  "project": {
    "id": "example-app",
    "environment": "development",
    "displayName": "Example App"
  },
  "profile": "realtime",
  "features": {
    "realtime": true
  },
  "auth": {
    "email": {
      "enabled": true,
      "autoConfirm": true
    }
  }
}
```

This file must never contain passwords, access tokens, private keys, service-role values or Supabase Cloud management credentials.

`parseFactoryRepositoryManifest()` rejects secret-like fields and Cloud-management material.

### `lock.json`

Factory-generated resolved handoff.

It contains:

- exact source manifest SHA-256
- resolved Supabase release
- exact upstream commit
- PostgreSQL major version
- resolved service set
- resolved Auth/Storage/backup/security policy
- explicit `containsSecretValues: false`
- explicit `deploymentTargetSelected: false`

It does **not** choose a server or embed secrets.

## ChatGPT flow

```text
1. User describes application/backend requirements
                |
                v
2. ChatGPT reads repository through GitHub
                |
                v
3. ChatGPT creates/updates .supabase-factory/project.json
                |
                v
4. Factory validates + resolves manifest
                |
                v
5. Factory produces deterministic lock/handoff
                |
                v
6. Factory MCP plans/operates attached self-hosted Supabase runtime
                |
                v
7. GitHub CI verifies repository + Factory contracts
```

Secrets are supplied through `SecretStore`, never committed by ChatGPT to GitHub.

## Application schema

Application database schema remains normal repository code:

```text
supabase/migrations/
```

The Factory repository manifest describes the runtime/lifecycle policy. Migrations describe application schema. They are deliberately separate.

This keeps project creation schema-neutral and lets the same repository move between development and later deployment adapters.

## Self-hosted runtime during development

A development harness registers the runtime with `MemoryAttachedRuntimeCatalog` (or another `AttachedRuntimeCatalog`) using:

```text
projectId
publicUrl
release
upstreamCommit
postgresMajor
services
```

Credentials are separately available via `SecretStore` references.

The Factory can then:

- observe the runtime
- verify Auth/REST/API-key behavior
- plan desired state
- expose project operations through MCP

The attached provider refuses host/infrastructure mutation. That is intentional.

## Later deployment

When permanent hosting is chosen, the repository contract does not change.

A deployment adapter consumes the same resolved manifest/lock and implements:

```text
InfrastructureProvider.observe()
InfrastructureProvider.apply()
```

The following remain stable:

- `.supabase-factory/project.json`
- Factory API version
- Factory MCP tool names/schemas
- project identity
- Supabase compatibility pins
- lifecycle contracts
- migration directory
- SecretRef model

This is what allows hosting to be decided later without rebuilding the development workflow.
