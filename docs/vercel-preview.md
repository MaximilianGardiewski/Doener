# Vercel Preview Setup

GitHub is the source of truth. Vercel is a replaceable preview/hosting adapter.

## One-time project import

Import `MaximilianGardiewski/Doener` into the Vercel team and keep the repository root as the project root.

The repository contains `vercel.json` with:

- build command: `npm run build:preview`
- output directory: `dist`
- framework preset: none / static
- `api/menu.js` is deployed as a Vercel Node.js Function alongside the static output.

`scripts/build-preview.mjs` copies `apps/mcello/public/` into `dist/`; Vercel discovers the root-level `api/` function separately. The static showcase still renders without backend credentials, while the live menu endpoint returns a controlled 503 until its public Supabase configuration is present.

## Branch behavior

- `main`: reserved as the eventual production branch.
- pull-request / feature branches: Preview Deployments.
- current bootstrap branch: `bootstrap/business-web-factory`.

Do not configure a production domain during bootstrap.

## Environment

Current static preview needs no secrets.

When the real backend slice is connected, set environment variables in Vercel rather than Git:

- `SUPABASE_URL`
- browser-safe `SUPABASE_PUBLISHABLE_KEY` (or legacy `SUPABASE_ANON_KEY`) for `GET /api/menu`
- server-only `SUPABASE_SERVICE_ROLE_KEY` only for server operations that require privileged access
- `MCELLO_LOCATION_ID` (optional; defaults to the existing single-location UUID)
- WhatsApp/SMS provider secrets

Server-only secrets must never use a public/client-exposed prefix.

## Exit safety

The build remains ordinary Node + static files. Vercel is not required to run the application locally or on another host.


## Public menu function

`GET /api/menu` calls the public Supabase RPCs `get_public_menu` and `get_public_cross_sells` using the browser-safe publishable/anon key. It validates the optional `at` timestamp, returns `Cache-Control: no-store`, and fails closed with HTTP 503 when Supabase is not configured or either RPC fails. It never uses or exposes the service-role key.
