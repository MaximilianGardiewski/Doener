# Vercel Preview Setup

GitHub is the source of truth. Vercel is a replaceable preview/hosting adapter — a **development tool** (Hobby plan), not a production target.

## Hobby plan scope

The connected Vercel account uses the free Hobby license. Treat it accordingly:

- 1 concurrent build, no team features, deployment URLs are publicly reachable by default (no paid Deployment Protection).
- Good enough for reviewing static mcello preview builds and sharing a link during development; not a substitute for the real production hosting decision.

## One-time project import

Import `MaximilianGardiewski/Doener` into the Vercel account and keep the repository root as the project root.

The repository contains `vercel.json` with:

- build command: `npm run build:preview`
- output directory: `dist`
- framework preset: none / static

`scripts/build-preview.mjs` copies only `apps/mcello/public/` into `dist/`. No production backend or Supabase credentials are required for the current showcase preview.

## Branch behavior

- `main`: reserved as the eventual production branch.
- pull-request / feature branches: Preview Deployments off whatever branch is currently active development (no fixed "bootstrap branch" name — check `git branch --show-current`).

Do not configure a production domain while this is still a dev tool.

## v0 (optional, manual)

[v0.dev](https://v0.dev) can be pointed at the same Vercel project/GitHub repo for ad hoc UI prototyping. It is not wired up via any automated tool here:

- Use v0 to sketch a component or layout idea, then export/copy its code manually.
- Treat v0 output as inspiration only — review it against existing patterns in `apps/mcello/public/` and the decisions in `docs/projects/mcello/DECISIONS.md` before adopting anything. Do not let v0 output narrow or reinterpret the discovery interview scope (see root `CLAUDE.md`).
- `/api/*` routes are not available on this static Vercel preview (same limitation as the existing Cloudflare Pages preview) — v0-generated UI that calls those endpoints needs a static/mocked data path or local `node apps/mcello/server.mjs` to actually exercise it.

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
