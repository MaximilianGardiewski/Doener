---
name: supabase-rls-security-auditor
description: Audit and harden Supabase/PostgreSQL authentication, roles, RLS, functions, storage policies, public publishing rules, and privileged server access for CMS and SaaS applications.
---

# Supabase RLS Security Auditor
Inspect effective database state, not only migrations/UI. Inventory auth, profiles, roles, tables/views/functions, pg_policies, SECURITY DEFINER functions, grants, triggers, storage buckets and storage.objects policies. Compare effective state with migrations. Test anon, ordinary authenticated, moderator and admin contexts.

Core invariants: public reads only published/due content; drafts/private submissions stay private; public forms cannot read submissions back; role assignment is not self-service; moderator/admin differ in backend policy; last-admin lockout is defended when needed; service-role secrets never reach client; storage writes are privileged.
