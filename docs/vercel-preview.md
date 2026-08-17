# Vercel Preview Setup

GitHub is the source of truth. Vercel is a replaceable preview/hosting adapter.

## One-time project import

Import `MaximilianGardiewski/Doener` into the Vercel team and keep the repository root as the project root.

The repository contains `vercel.json` with:

- build command: `npm run build:preview`
- output directory: `dist`
- framework preset: none / static

`scripts/build-preview.mjs` copies only `apps/mcello/public/` into `dist/`. No production backend or Supabase credentials are required for the current showcase preview.

## Branch behavior

- `main`: reserved as the eventual production branch.
- pull-request / feature branches: Preview Deployments.
- current bootstrap branch: `bootstrap/business-web-factory`.

Do not configure a production domain during bootstrap.

## Environment

Current static preview needs no secrets.

When the real backend slice is connected, set environment variables in Vercel rather than Git:

- `SUPABASE_URL`
- browser-safe `SUPABASE_PUBLISHABLE_KEY`
- server-only `SUPABASE_SERVICE_ROLE_KEY`
- WhatsApp/SMS provider secrets

Server-only secrets must never use a public/client-exposed prefix.

## Exit safety

The build remains ordinary Node + static files. Vercel is not required to run the application locally or on another host.
