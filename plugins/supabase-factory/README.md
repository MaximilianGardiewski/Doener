# Supabase Factory Plugin Bundle

This directory is the reusable ChatGPT/Codex integration layer for `@business-web/supabase-factory`.

The bundle deliberately contains **no duplicated Factory implementation**. The MCP app remains in `packages/supabase-factory`; this directory packages the reusable workflow around it.

## Components

- `skills/supabase-factory/SKILL.md` — upload/install-ready Agent Skill workflow.
- `plugin-source.json` — repository metadata describing the bundle. It is intentionally **not** presented as an OpenAI platform manifest; plugin/app publication is finalized in the ChatGPT workspace UI.
- `app/README.md` — how the existing MCP server becomes the Supabase Factory ChatGPT app.

## Intended ChatGPT plugin composition

**Supabase Factory**

- Required app: **Supabase Factory** (our MCP endpoint)
- Required app: **GitHub** (repository reads/writes)
- Optional app: **Supabase** (only for adopting an existing Supabase Cloud project)
- Included skill: **supabase-factory**

This matches the current ChatGPT plugin model: plugins can bundle skills with apps/app templates, while the app remains the external data/action connection.

## Use in another repository

The skill drives this sequence:

1. Read `.supabase-factory/project.json`, `.supabase-factory/lock.json` and `supabase/migrations/` from the selected GitHub repository.
2. Call Factory `repository.status` / `repository.sync` / `repository.plan`.
3. Write only the returned secret-free files back through the GitHub app.
4. Provision or attach a runtime only when requested.
5. Plan migrations before applying them.

The target application repository does not need a copy of Factory source code.

## Adopt an existing Supabase project

The optional Supabase app is used for source discovery. The skill creates a secret-free source inventory and passes it into Factory adoption planning. A production transfer is staged:

1. inventory,
2. adoption plan,
3. repository preparation,
4. protected DB/Auth/Storage export,
5. parallel Factory target,
6. restore/import,
7. health + app verification,
8. explicit cutover,
9. optional later source decommission.

The source project stays unchanged until cutover is explicitly requested.

## Installation surfaces

The skill itself follows the Agent Skills `SKILL.md` convention and can be uploaded through ChatGPT Skills where the account/workspace supports personal or workspace Skills.

The MCP app is tested/deployed separately and then connected as a custom ChatGPT app. A workspace plugin can then package the app and this skill together. The repository bundle is kept platform-neutral because final plugin listings/app templates are workspace/platform objects rather than a repository manifest contract.
