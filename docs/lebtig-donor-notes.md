# Lebtig donor notes — snapshot a2da3c10613042cc229f1254d3673f1d1ccaf00e

Read-only inspection of the Lovable project established:

## Runtime / app
- TanStack Start + Vite
- React 19
- TypeScript 5.8
- Tailwind 4
- Supabase JS
- TanStack React Query / Router
- Playwright E2E

## Existing reusable code areas
- admin: `AdminOnly`, `BlockEditor`, `MediaPicker`
- public: `PageHero`, `SiteHeader`, `SiteFooter`, `MobileQuickBar`, `OpenStatus`
- auth/Supabase: browser + server clients, auth middleware, generated types
- CMS helpers, media helpers, opening-hours helpers
- legacy redirects + sitemap
- admin routes for news, offers, users, settings, media, lunch, recipes, pages, requests
- public multi-page routes

## Existing portability audit
The Lebtig project itself already identified these Lovable-specific dependencies:
1. Google login through the Lovable auth broker.
2. `@lovable.dev/vite-tanstack-config`.
3. Preview error reporting.
4. Lovable hosting and managed Supabase.

The ordinary TypeScript/Supabase application code, migrations, RLS, media endpoint,
redirects, sitemap and Playwright scaffold are portable concepts.

## Security patterns reused in BusinessWebFactory
Later Lebtig migrations hardened the original baseline with:
- explicit `admin`/editor role rows instead of authorization by account existence;
- first-admin bootstrap using `pg_advisory_xact_lock`;
- subsequent signups receiving no automatic staff role;
- last-admin protection using an advisory transaction lock;
- restricted `SECURITY DEFINER` execute grants;
- parent-aware public RLS for child content;
- private media object policies;
- bootstrap state not exposed anonymously in the final hardening step.

These patterns inform `supabase/migrations/20260814190000_platform_core.sql`.

## Extraction limitation
The current Lovable connector provides file-tree listing and individual file reads,
but no one-call source archive in this environment. Therefore this repository does
not claim a byte-for-byte Lebtig export yet. The recommended next move is to attach
the original Lovable Git source or export it into `apps/lebtig` once available.
