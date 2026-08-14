---
name: web-app-portability-architect
description: Design and harden web applications so they remain portable across builders, AI coding tools, hosting providers, databases, and deployment platforms, with a clear path away from vendor-specific runtimes.
---

# Web App Portability Architect
The Git repo, migrations, environment contract, tests and deployable app are the product. Builders are implementation clients.

Require complete source, lockfile, reproducible types, .env.example, setup/deployment docs and no hidden editor state. Keep schema/functions/RLS/storage reproducible. Separate domain logic from vendor glue. Use stable app-owned media identifiers. Maintain an independent deployment path and provider-neutral CI. Keep agent instructions in repo-local files such as AGENTS.md, CLAUDE.md and skills/*/SKILL.md.

A project is portable only when a clean clone can build/test/run/deploy without the original builder.
