---
name: cms-v1-accelerator
description: Rapidly scaffold a production-oriented CMS-backed business website V1 with reusable modules, role boundaries, recurring content, media, forms, and a vertical-slice-first implementation strategy.
---

# CMS V1 Accelerator
Build a reusable baseline, not a disposable mockup.

Default modules: auth/profiles/roles, site settings, pages/navigation, constrained blocks, media, news, recurring content, public forms, admin dashboard, SEO and launch checklist.

Build order:
1. project/env/migrations/auth/RLS/public+admin shell
2. one complete editorial flow: login -> edit -> preview -> publish -> public read -> archive/copy
3. extract shared CMS primitives
4. add remaining modules
5. harden RLS/storage/SEO/redirects/mobile/backups/E2E/portability

V1 is not complete until persistence, backend authorization, reusable media, private submissions, tests/build and Git-based continuation all work.
