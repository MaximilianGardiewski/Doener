# ADR 0002 — Zero-additional-cost infrastructure

Status: accepted
Date: 2026-08-14

## Decision

Mcello must be developable and operable without introducing a new mandatory monthly SaaS bill.

### Development

Use the Supabase CLI with its local Docker stack for development and integration testing.

- Postgres, Auth, Realtime, Storage and local mail tooling run locally.
- Existing `supabase/migrations/` remains the database source of truth.
- Local services must bind to localhost and must not be exposed directly to the public internet.
- GitHub remains the canonical source for schema, application code and skills.

### Staging / production

Use self-hosted Supabase on infrastructure already available to the project owner, together with the Mcello web application.

The production deployment must be reproducible from Git and Docker configuration. Provider-specific hosting is optional, not required.

Self-hosted production responsibilities therefore explicitly include:

- operating-system and container updates;
- TLS/reverse-proxy configuration;
- database backups and restore drills;
- secrets rotation;
- monitoring and disk-capacity alerts;
- PostgreSQL maintenance;
- Supabase stack upgrades;
- firewall/network hardening.

### Vercel

Vercel is not a required production dependency. Repository files may keep a Vercel-compatible preview build because it is useful if a suitable paid/eligible account is used later, but V1 acceptance does not depend on Vercel.

### Notifications / OTP

The application keeps provider-neutral WhatsApp and SMS contracts because these are binding V1 requirements. Development uses a local/dev OTP provider that never sends real messages.

Actual production SMS/WhatsApp sending is treated as an external operating cost boundary. No paid provider is enabled without explicit owner approval. This does **not** remove WhatsApp-primary/SMS-fallback from the product requirements; it means provider activation is a release dependency.

## Why

The project should not depend on Lovable, managed Supabase, Vercel or another builder/host to continue development. The reusable platform must remain portable and self-hostable.

## Official references

- Supabase local development: https://supabase.com/docs/guides/local-development
- Supabase self-hosting: https://supabase.com/docs/guides/self-hosting
- Supabase Docker self-hosting: https://supabase.com/docs/guides/self-hosting/docker
- Vercel Hobby plan: https://vercel.com/docs/plans/hobby
