# Mcello Builder Presentation Data V1

Status: **LOCAL PRESENTATION ONLY — NOT PRODUCTION CATALOG**

## Why this exists

The presentation needs a tangible Pizza Builder and Döner/Yufka Builder before the complete owner-confirmed production modifier catalog exists. This slice therefore installs a tiny, explicit fixture set only into the disposable localhost Supabase stack started by the existing presentation launcher.

The importer refuses HTTPS, remote hosts and any Supabase hostname other than loopback (`127.0.0.1`, `localhost`, `::1`) before its first write.

## Pizza Mcello

Presentation target: first-party provisional source item `pizza-060`, **Pizza Mcello**.

The five visual/toggle ingredients come from the existing user-supplied menu-card transcription for this exact product:

- Kebab Fleisch
- Tomaten
- Broccoli
- Käse
- Zwiebeln

All five start selected because the provisional product description lists them as the Pizza Mcello recipe. Removing them is allowed in the presentation interaction so the visual Builder can demonstrate add/remove feedback. This is not a claim that every production Pizza modifier policy has already been confirmed.

No ingredient receives a presentation surcharge.

## Döner / Yufka

Presentation targets remain the explicit first-party provisional products `warm-013` through `warm-018`.

Sauces are the three options confirmed by the owner in chat on 2026-08-18:

- Curry
- Knoblauch
- Scharf

The local presentation allows zero to three sauce selections so it does not prematurely encode an unconfirmed production single-vs-multiple sauce rule. No sauce receives a presentation surcharge and none is silently declared the default.

## Domain authority

The fixtures are real modifier rows inside the local disposable Supabase stack. Therefore the normal Mcello public-menu RPC, browser configurator, cart payload and server/database validation paths remain authoritative during the demo. The visual Builder adapters do not get a second private selection store.

## Launcher

`scripts/demo-mcello.ps1` installs these fixtures on every presentation run, including `-ReuseLocalBackend`, before setting the localhost shop presentation state. A remote or production environment is refused by the importer.