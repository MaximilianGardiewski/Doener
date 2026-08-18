# Mcello Hosted Presentation V1

Status: **PRESENTATION-ONLY SHOWCASE TARGET**

This target exists to make Mcello easy to show on laptop, tablet and smartphone without preparing Docker, a local Supabase stack, a Windows hotspot or LAN firewall rules before a meeting.

## Infrastructure boundary

Vercel is used only as a disposable presentation host. It is **not** the intended Mcello production architecture and must not become an application dependency. The eventual production deployment remains independent infrastructure such as VPS/dedicated hosting.

The hosted presentation is therefore split from both local development and future production:

- hosted presentation: static Vercel showcase, explicitly marked as presentation
- local development/presentation: existing Node + local Supabase/Docker runtime
- future production: VPS/dedicated infrastructure with production data and services

## Fast showcase stage

The first hosted stage deliberately prioritizes showing the visual product experience immediately.

Open the Vercel deployment with:

`?presentation=mcello&reset=1`

On an explicit `https://*.vercel.app` presentation URL, Mcello exposes the same Homepage V2, Store V2 and responsive Builder UI. If a real `/api/menu` endpoint is not available, `presentation-showcase.js` supplies only a browser-local, database-shaped menu projection built from:

- the existing provisional menu-card transcription, and
- the presentation-only Builder data.

This makes the Pizza Mcello and Döner/Yufka Builder interactions demonstrable while keeping the remote showcase independent from a database during the first presentation stage.

## What works in the hosted static showcase

- Homepage and Store presentation
- desktop Builder
- tablet/smartphone landscape Builder with portrait rotate gate and preserved browser state
- Pizza Mcello visual configuration with `Kebap Fleisch`, `Tomaten`, `Broccoli`, `Käse`, `Zwiebeln`
- Döner/Yufka visual sauce configuration with `Curry`, `Knoblauch`, `Scharf`
- normal browser-local cart interaction
- visible hosted-presentation banner
- `Demo neu starten` browser-state reset
- PWA shell for the presentation assets

## Deliberately not faked

The static hosted target **does not fake backend readiness**. It does not intercept or synthesize:

- `/api/health`
- OTP endpoints
- `/api/checkout`
- order status
- KDS mutations
- Admin/Ops mutations

As a result, checkout remains disabled/read-only until a separate remote presentation backend is connected. This is intentional: the first public presentation URL may demonstrate the UX immediately without pretending that a server-authoritative order was created.

The menu interceptor also prefers a real successful `/api/menu` response. A later isolated remote presentation backend can therefore replace the browser fallback without rebuilding the Builder UI.

## Data truth boundary

`presentation-builder-showcase.v1.json` is presentation-only browser data. It must never be imported into production or treated as an owner-confirmed full recipe catalog.

- Pizza presentation ingredients are limited to names already present in the provisional Pizza Mcello transcription.
- Döner/Yufka sauce names are limited to the confirmed `Curry`, `Knoblauch`, `Scharf` set.
- presentation-only price deltas remain zero.
- selection limits remain presentation interaction policy, not a production rule.
- FoodStages remain schematic browser visuals and are not documentary Mcello product photography.

## Vercel behavior

The existing root `vercel.json` builds the static Mcello public surface into `dist` and sends `X-Robots-Tag: noindex, nofollow, noarchive` on the showcase. The presentation mode does not activate merely because a page is hosted on Vercel: the URL must also explicitly contain `presentation=mcello`.

## Next hosted stage

A separate remote Supabase **presentation** project can later provide the full online flow:

Customer → Builder → Cart → Checkout → Demo order → KDS → Live status.

That remote database must remain disposable presentation infrastructure and separate from future production data. Until it exists, the hosted showcase stays intentionally visual/read-only at checkout.
