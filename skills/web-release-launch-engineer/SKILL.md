---
name: web-release-launch-engineer
description: Prepare, verify, release, migrate, and roll back production websites and CMS applications with build checks, backups, DNS planning, SEO cutover, smoke tests, and post-launch validation.
---

# Web Release Launch Engineer
Launch is a controlled migration, not a publish button. Freeze a release candidate; run install/typecheck/lint/tests/build/smoke/auth/redirect checks; create real DB/storage/config backups; verify secrets/RLS/forms/storage; confirm business/legal/media content; validate sitemap/robots/canonicals/redirects/OG/structured data; document DNS/TLS/mail records and rollback.

Deploy staging first, then production, then DNS. Run post-launch smoke tests. Define objective rollback triggers and handover docs. Never call a site launch-ready merely because it builds.
