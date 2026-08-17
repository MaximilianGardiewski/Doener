# AGENTS.md — BusinessWebFactory

## Mission
Build reusable, provider-neutral business web applications. Mcello and Lebtig are reference applications, not the platform itself.

## Source of truth
Git repository files, migrations, tests, decision ledgers and docs are canonical.
Lovable, Claude Code, Codex, Figma and other tools are clients/assistants, never sole storage.

## Non-negotiables
- Preserve `docs/projects/*/DECISIONS.md`.
- A confirmed `IMPLEMENT_V1` decision may not be silently dropped.
- `PREPARE_NOW_IMPLEMENT_LATER` means architecture/contracts/data model/interfaces now, visible feature later.
- Never invent business facts, prices, hours, certifications or availability.
- User-provided menu data may be seeded as provisional and must keep provenance.
- Do not deploy or mutate production without explicit approval.
- Do not create fake users/credentials.
- Keep secrets out of client code and Git.
- Prefer provider interfaces for WhatsApp/SMS/payment/storage over vendor coupling.

## Development order
1. Domain model + invariants + tests.
2. One vertical slice end-to-end.
3. UI polish and motion.
4. Backend/RLS/integration hardening.
5. Cross-agent review.
