# Supabase Factory Handoff

## Purpose

This file is the durable bridge between ChatGPT conversations, Claude Code, Codex and other agents working on `MaximilianGardiewski/Doener`.

Conversation memory is **not** the source of truth. If a decision from another chat affects implementation, persist it here or in the appropriate `docs/projects/<project>/` ledger before relying on it.

## Canonical Supabase state

Repository contract:

- `.supabase-factory/project.json`
- `.supabase-factory/lock.json`
- `supabase/config.toml`
- `supabase/migrations/`
- `supabase/seed.sql`

The repository has been declaratively adopted into Supabase Factory as the project described by `.supabase-factory/project.json`. Do not substitute another Supabase project based on stale local state, an old MCP connection, CLI linkage or previous chat context.

Supabase Factory is intended to provide isolated self-hosted Supabase runtimes while keeping application repositories portable and secret-free.

## Development rule

For current development, GitHub/repository state plus the Factory contract are canonical. Backend/schema/Auth/Storage/Realtime work must be expressed so it can be reproduced by the Factory workflow.

Do not make Supabase Cloud management state a dependency of normal development.

Forbidden as Factory dependencies:

- `supabase login`
- `supabase link`
- `SUPABASE_ACCESS_TOKEN`
- `sbp_*`
- hidden reliance on a hosted Supabase project ref

Project-local runtime credentials may exist outside Git, but must not be committed or printed into agent handoffs.

## Existing/old Supabase projects

Any previously connected Supabase Cloud instance is considered a potential **migration/adoption source**, not an automatically selected development backend.

Before using one:

1. identify it explicitly;
2. inventory it read-only;
3. compare it to the Factory manifest and repository migrations;
4. produce an adoption/migration plan;
5. transfer into a parallel Factory target;
6. verify application behavior;
7. perform cutover only after explicit approval.

Do not silently restore, unpause, mutate, delete or relink an old Cloud project.

## Cross-chat continuity

Several workstreams may originate in separate ChatGPT/Claude conversations (for example Android packaging/application work, broader BusinessWebFactory/Streamforge-style platform work, ChatGPT/plugin integration work, Mcello UI/configurator work). Their implementation may share this repository, but they must converge through repository-local contracts instead of each choosing its own backend.

For every such workstream:

- use the same `.supabase-factory/` project contract unless a project-specific manifest is intentionally introduced;
- put new schema/RLS changes in `supabase/migrations/`;
- keep app-specific architectural decisions in `docs/projects/<project>/`;
- keep shared platform decisions in shared docs/packages;
- never create a second accidental Supabase backend because a chat or agent cannot see prior context.

## Claude Code startup checklist

At the beginning of a meaningful Claude Code session:

1. `git fetch --all --prune`
2. identify the intended branch/worktree;
3. read `AGENTS.md` and `CLAUDE.md`;
4. read `.claude/skills/supabase-factory/SKILL.md`;
5. read `.supabase-factory/project.json` and `.supabase-factory/lock.json`;
6. inspect relevant project decision docs and migrations;
7. state which Factory project/repository contract will be used before backend changes.

If those files conflict with conversational instructions, stop and surface the conflict rather than guessing.

## Handoff format for other chats

When another ChatGPT chat produces implementation-relevant decisions, reduce them to:

- Goal
- Scope
- Non-goals
- Architecture decisions
- Current branch/PR
- Supabase impact
- Required migrations
- External integrations
- Tests/acceptance criteria
- Open blockers

Then commit that summary to the appropriate project ledger. Claude Code can then continue without needing access to the original chat transcript.
