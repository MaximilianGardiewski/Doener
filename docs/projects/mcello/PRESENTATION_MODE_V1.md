# Mcello Presentation Mode V1

Status: **LOCAL / PRIVATE-LAN PRESENTATION UX**

## Activation

The customer surface enters presentation mode only when both conditions are true:

1. the URL contains `presentation=mcello`, and
2. the page is served over plain HTTP from loopback, an RFC1918 private IPv4 address, or Mcello's private-IP `sslip.io` LAN host pattern.

The mode does not activate on normal HTTPS production origins.

## Visible truth label

Presentation mode does not pretend to be production. The prototype banner becomes:

`MCELLO PRESENTATION · lokale Demo · Produktdaten teilweise vorläufig`

A `Demo neu starten` control is exposed in the same banner.

## Clean browser state

The launcher opens the customer surface with `reset=1`. The presentation helper clears only browser-local cart/session state, removes the reset flag from the address and reloads once into the clean presentation URL. It performs no fetch and does not alter product, price, availability, order or backend state.

The cart storage key is statically checked against the real Mcello application key so the reset cannot silently drift.

## Backend state

A normal `scripts/demo-mcello.ps1` run still creates a fresh disposable local Supabase stack and imports the localhost-only Pizza/Döner/Yufka presentation fixtures. `-ReuseLocalBackend` intentionally keeps backend state; the in-page reset only guarantees a clean customer browser cart.

## Multi-device behavior

The presentation helper also accepts RFC1918 and the LAN launcher's private-IP `sslip.io` hostname pattern so the same labeled presentation experience can run on tablet and smartphone over the private demo network. Builder Responsive V3 remains responsible for portrait gating and landscape interaction.

## PWA

`presentation-mode.js` and `presentation-mode.css` are cached in the public shell. The mode itself remains opt-in; caching the assets does not activate presentation behavior.