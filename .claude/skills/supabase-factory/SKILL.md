---
name: supabase-factory
description: Mandatory Supabase workflow for this repository. Use for any backend, database, auth, storage, realtime, Edge Function, migration, environment or deployment work that touches Supabase.
---

# Supabase Factory — Claude Code guardrail

This repository uses **Supabase Factory** as the canonical control plane and repository contract for Supabase work.

## Mandatory source of truth

Before changing anything related to Supabase, read:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `.supabase-factory/project.json`
4. `.supabase-factory/lock.json`
5. `docs/integrations/SUPABASE_FACTORY_HANDOFF.md`
6. the relevant files under `supabase/migrations/`

Do not select or infer a different Supabase project from local CLI state, an old `.env`, a previous Claude session, a hosted project ref, a dashboard URL, or stale MCP context.

## Hard rules

- The repository contract under `.supabase-factory/` is canonical.
- The current application identity is the Factory project declared there.
- Never run `supabase login` or `supabase link` as part of the Factory workflow.
- Never introduce `SUPABASE_ACCESS_TOKEN`, `sbp_*`, hosted Supabase management tokens, or a hosted project ref as a runtime dependency.
- Never put database passwords, service-role/secret keys, JWT signing material, Cloudflare credentials, S3 credentials, SMTP passwords, or bearer tokens into Git.
- Existing Supabase Cloud projects are migration/adoption sources only unless a repository decision explicitly says otherwise.
- Do not silently reactivate, restore, mutate, delete or switch to an old Cloud project.
- Schema changes belong in `supabase/migrations/` and must remain reproducible.
- Prefer Factory planning/validation before runtime mutations.
- Do not expose PostgreSQL publicly merely to simplify development or migration.
- Production mutation/deployment still requires explicit approval.

## New work

For a backend feature:

1. Identify the app/domain owning the feature.
2. Read the current Factory manifest and lock.
3. Model schema/RLS/invariants as migrations.
4. Keep provider-specific credentials outside the repository.
5. Run tests/typecheck and any Factory contract checks available in the repo.
6. Record architectural changes in the relevant decision ledger.

## Existing Supabase migration

When an old/current Supabase instance must be transferred:

1. Treat source discovery as read-only first.
2. Inventory schema, data, Auth, Storage, Realtime and Edge Functions.
3. Produce an adoption plan before changes.
4. Create/verify the Factory target in parallel.
5. Transfer DB/Auth/Storage/Functions deliberately and verify checksums/smoke tests.
6. Cut over only after explicit approval.
7. Decommission the source only as a separate explicit operation.

## Cross-agent continuity

If work originated in ChatGPT, Codex, another Claude session, or another project chat, do not rely on invisible conversational memory. Persist relevant decisions into repository docs, especially `docs/integrations/SUPABASE_FACTORY_HANDOFF.md` or a project-specific `docs/projects/<project>/` ledger, before implementing dependent changes.
