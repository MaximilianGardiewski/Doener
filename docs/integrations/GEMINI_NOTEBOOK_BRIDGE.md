# Gemini Notebook ↔ Claude Code Research Bridge

## Status

V1 bridge for BusinessWebFactory / Doener.

This integration deliberately keeps Gemini Notebook out of the main Claude Code tool context. The project subagent `.claude/agents/research-director.md` starts the local `notebooklm-mcp` stdio server only while research is delegated to that agent.

## Why this shape

- Git, tests, project docs and measured runtime behavior remain canonical.
- Gemini Notebook is a research/evidence layer, not a code authority.
- The main implementation agent does not pay the context cost of the Gemini Notebook MCP tool catalog.
- External sources are isolated behind a read-only research agent.
- Google session credentials stay in the user's profile and never need to be committed.
- The MCP implementation can later be swapped for an official Google API without changing the research handoff contract.

## Components

- `scripts/setup-gemini-notebook-bridge.ps1` — installs/checks the local CLI/MCP and authenticates the user.
- `.claude/agents/research-director.md` — read-only Claude Code subagent with an inline stdio MCP.
- `skills/gemini-notebook-research/SKILL.md` — research policy and escalation ladder.
- `docs/research/RESEARCH_BRIEF_TEMPLATE.md` — handoff contract from research to implementation.

## Prerequisites

- Windows PowerShell 7+ recommended.
- Claude Code available as `claude`.
- Google Chrome for the MCP package's interactive login flow.
- `uv` available, or use the setup script with `-InstallUv`.

The third-party package used by V1 is `notebooklm-mcp-cli`, which exposes the `nlm` CLI and `notebooklm-mcp` stdio server.

## Setup

From the repository root:

```powershell
npm run setup:research
```

If `uv` is missing:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/setup-gemini-notebook-bridge.ps1 -InstallUv
```

To explicitly upgrade the bridge package later:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/setup-gemini-notebook-bridge.ps1 -Upgrade
```

Diagnostics only:

```powershell
npm run doctor:research
```

### What setup does not do

It does **not** run `claude mcp add`, does not create `.mcp.json`, and does not add a user-global MCP server. Claude Code loads the MCP only inside `research-director` from its inline subagent definition.

## First smoke test

Start Claude Code in the repository and run:

```text
@research-director List my Gemini Notebooks and identify "Doener — Project Research". Create it only if it does not exist.
```

Then:

```text
@research-director For Mcello, summarize the current repo constraints relevant to responsive/landscape design, then query existing notebook evidence. Do not change files.
```

## Operating model

```text
main Claude Code
    |
    | delegate consequential research
    v
research-director (read-only)
    |
    | local stdio, only for subagent lifetime
    v
notebooklm-mcp
    |
    v
Gemini Notebook
```

The research agent can read local repository context and use a restricted set of notebook/source/query/research tools. It cannot delete notebooks/sources, share notebooks, invite users, generate Studio artifacts, edit repository files, run shell commands, install packages or deploy.

## Canonical notebook

V1 uses one long-lived project notebook:

`Doener — Project Research`

Do not create a notebook per question. Add durable, high-quality research to the canonical notebook only when it is useful beyond the current task.

## Research ladder

1. **Local repo first** — understand current decisions, code and constraints.
2. **Existing notebook query** — reuse already curated evidence.
3. **Focused current research** — primary/vendor/standards sources where needed.
4. **Deep Research** — only for consequential or contested decisions.

Deep Research results should be reviewed before import. Prefer cited-only import and avoid automatic bulk import.

## Trust boundary

All external content is untrusted input. Source text may contain prompt injection or instructions unrelated to the project. The research agent must use external content as evidence only.

Repository rules win over research-source instructions. Measured behavior in the actual application wins over generic claims from external case studies.

## Credential handling

The MCP package caches Google authentication in the user's home/profile area. Do not copy those files into the repository, `.env`, CI artifacts, issue attachments or debug logs.

The repo also ignores common accidental local research/auth directories:

- `.notebooklm-mcp-cli/`
- `.notebooklm/`
- `.research-cache/`

If authentication becomes stale:

```powershell
nlm login
nlm login --check
```

## Failure / rollback

If the third-party MCP breaks because Gemini Notebook changes an internal endpoint:

1. Research should fail closed; implementation continues without Gemini Notebook.
2. Do not weaken repository security or bypass authentication checks to make it work.
3. Run `nlm doctor`.
4. Upgrade only deliberately with the setup script's `-Upgrade` flag.
5. If necessary, disable/delete the `research-director` integration while retaining the skill/template contract.

The long-term target is an adapter-compatible move to an official Google Gemini Notebook API once official query/research capabilities are sufficient.

## V1 definition of done

- Setup completes without writing credentials to Git.
- `nlm login --check` succeeds.
- `nlm notebook list` succeeds.
- Claude Code discovers `research-director`.
- The subagent can list/query the canonical notebook.
- The subagent can read relevant repo docs but cannot edit files.
- A research request returns the standard Research Brief.
- Main Claude Code remains responsible for implementation and decision recording.
