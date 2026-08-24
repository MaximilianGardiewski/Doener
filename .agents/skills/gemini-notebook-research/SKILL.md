---
name: gemini-notebook-research
description: Route consequential design, UX, motion, accessibility, performance, dependency and architecture research through the isolated Gemini Notebook research-director and return an evidence-backed Research Brief.
---

# Gemini Notebook Research Entrypoint

1. Read `skills/gemini-notebook-research/SKILL.md`; that file is the canonical repository research policy.
2. Restate the user's question as one precise research question with the relevant project constraints.
3. Delegate the evidence-gathering work to the project subagent `research-director`.
4. Do not perform Gemini Notebook MCP calls in the main implementation context.
5. Receive the Research Brief from `research-director` and validate its recommendation against the actual repository, tests and measured runtime/browser behavior before implementing anything.
6. Persist a brief or update a decision ledger only when the result is durable and consequential.

If `research-director` cannot start because `notebooklm-mcp` is missing or authentication is stale, stop the Gemini Notebook path and report the setup/diagnostic command from `docs/integrations/GEMINI_NOTEBOOK_BRIDGE.md`; do not bypass the trust boundary.
