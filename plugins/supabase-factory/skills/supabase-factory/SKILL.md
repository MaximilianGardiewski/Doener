---
name: supabase-factory
description: Reusable workflow for bootstrapping, adopting, migrating, verifying and operating Supabase projects through the Supabase Factory MCP app and GitHub without storing infrastructure secrets in repositories.
---

# Supabase Factory

Use this skill when the user wants to add Supabase to a project, reuse the Factory in another repository, migrate an existing Supabase project into Factory management, inspect Factory state, apply migrations, run backup/restore drills, or prepare a project for self-hosted Supabase.

## Capability model

This workflow intentionally separates three systems:

1. **GitHub** is the source of truth for application code, `supabase/migrations/`, `.supabase-factory/project.json`, and `.supabase-factory/lock.json`.
2. **Supabase Factory App (MCP)** validates, plans, provisions and operates isolated self-hosted Supabase runtimes. It must never receive GitHub credentials.
3. **Supabase App** is optional and is used only when adopting an existing Supabase Cloud project. Prefer read-only discovery until the adoption plan is complete.

Never put database passwords, service-role/secret keys, JWT signing material, Cloudflare credentials, bearer tokens, S3 credentials, SMTP passwords, or other secrets into GitHub files, tool narration, audit metadata, or migration SQL.

## New project workflow

When a repository does not yet use Factory:

1. Inspect the repository with GitHub. Look for `.supabase-factory/project.json`, `.supabase-factory/lock.json`, and `supabase/migrations/`.
2. If no manifest exists, call `factory.repository.bootstrap` with a DNS-safe project ID and the intended environment/profile.
3. Write only the returned secret-free repository files through GitHub.
4. If a manifest exists, call `factory.repository.status` using the current project and lock text.
5. If changes are required, call `factory.repository.sync`; write only the returned files. A second sync should be a no-op.
6. Call `factory.repository.plan` before any runtime mutation.
7. Provision/reconcile only when the user actually wants a runtime and the configured Factory app exposes the required mutating tool.
8. Database schema belongs in `supabase/migrations/`; use `factory.migrations.plan` before `factory.migrations.apply`.

## Existing Supabase adoption workflow

Treat adoption as a staged migration, not a rename or blind copy.

1. Discover the existing project with the Supabase app using read-only actions first.
2. Collect only secret-free inventory: project/ref, region, lifecycle status, Postgres major, enabled capabilities, Edge Function slugs/counts, schema/data/auth/storage availability and relevant compatibility constraints. Do not copy user rows, emails, password hashes, access tokens or service-role keys into the conversation unless a later transfer step genuinely requires a protected secret channel.
3. Call `factory.adopt.plan` with the source inventory and desired target project ID/environment/profile.
4. If the source is inactive, paused or otherwise unreadable, stop the data-transfer stage and report the blocker. Do not restore/unpause a paid or production project without explicit user intent.
5. Call `factory.adopt.prepare` to produce the secret-free Factory repository files and adoption checklist. Write those files through GitHub only after reviewing the plan.
6. Capture the database as a reproducible migration/export: roles, schema and data are separate artifacts. Prefer direct PostgreSQL tooling for complete transfers; do not attempt to reconstruct a production database from scattered `SELECT` output.
7. Migrate Auth deliberately. Preserve user IDs and password hashes only through a supported protected database export/restore path; never serialize them into GitHub or chat.
8. Migrate Storage metadata and object bytes together, with inventory/checksum verification.
9. Export/redeploy Edge Functions and separately re-create their protected secrets.
10. Provision a disposable/parallel Factory target first. Import and verify there before cutover.
11. Run Factory health checks plus application smoke tests. Keep the old project unchanged until verification passes.
12. Cut DNS/application configuration over only after the user asks for the actual cutover. Decommissioning the old project is a separate explicit action.

## Runtime attachment workflow

For a disposable or already-running self-hosted development runtime:

- `factory.runtime.attach` records only a secret-free descriptor.
- `factory.runtime.get` / `factory.runtime.list` inspect attachments.
- `factory.runtime.detach` removes only Factory's reference. It must not stop or destroy the runtime.

## Safety and approval rules

- Planning, validation, status, sync generation and adoption preparation are read-only from Factory's perspective.
- Never use `supabase login`, `supabase link`, `SUPABASE_ACCESS_TOKEN` or `sbp_*` as a Factory runtime dependency.
- Never expose PostgreSQL publicly merely to make a migration easier.
- Prefer a parallel target and verified cutover over in-place destructive changes.
- Before apply/upgrade/restore/destroy, use the exact approval token required by the Factory tool and preserve the user's explicit intent.
- If a requested operation is not exposed by the Factory app, fail closed instead of inventing a shell command that bypasses the control plane.

## Expected reusable repository contract

A Factory-enabled application repository normally contains:

```text
.supabase-factory/
  project.json
  lock.json
supabase/
  migrations/
```

Those files are portable between repositories and deployment targets. Secrets and host-specific placement remain outside the repository.
