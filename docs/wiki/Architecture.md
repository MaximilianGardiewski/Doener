# Architektur

## Überblick

Doener/BusinessWebFactory ist als Workspace mit mehreren Anwendungen und wiederverwendbaren Packages aufgebaut. Die wichtigste Architekturregel ist: **Produkt-/Domain-Wahrheit gehört nicht in Builder, Motion, Design-Tools oder einen einzelnen Provider-Adapter.**

## Anwendungen

- `apps/mcello/` — Gastro-/Ordering-Referenzanwendung
- `apps/lebtig/` — zweiter Consumer/Donor für gemeinsame Plattformbausteine

## Gemeinsame Packages

| Package | Verantwortung |
|---|---|
| `@business-web/core` | gemeinsame Shop-/Location-Invarianten |
| `@business-web/auth` | Rollen und Berechtigungsmodelle |
| `@business-web/cms` | wiederverwendbare CMS-Modelle |
| `@business-web/menu-engine` | Produkte, Modifier, Pricing-/Konfigurationslogik |
| `@business-web/ordering` | Checkout, Order-Lifecycle, Fulfillment, Capacity |
| `@business-web/notifications` | provider-neutrale OTP-/Order-Notification-Contracts |
| `@business-web/kds` | KDS-Lanes und operative Order-Darstellung |
| `@business-web/payments` | provider-neutrale Payment-Contracts |
| `@business-web/analytics` | Analytics-/Recommendation-Event-Contracts |
| `@business-web/supabase-adapter` | Supabase/PostgREST/Realtime-spezifische Adapter |

Package-zu-Package-Grenzen laufen über öffentliche `@business-web/*`-APIs. Direkte relative Imports in fremde `packages/*/src`-Interna sind nicht der vorgesehene Integrationsweg und werden durch CI geschützt.

## Autoritätsgrenzen

### Domain / Server

Bleibt autoritativ für unter anderem:

- Preis
- Verfügbarkeit
- Modifier-Gültigkeit
- Kapazität
- Checkout-/Order-State
- Rollen und Berechtigungen

### Datenbank

Verstärkt kritische Invarianten über Migrationen, Constraints, RLS/RPC und Storage-Grenzen. Application-Layer-Schutz allein reicht für kritische Grenzen nicht aus.

### Presentation / Builder / Motion

Darf vorhandene autoritative Daten darstellen, strukturieren und animieren, aber keine eigene parallele Business-Wahrheit erzeugen.

Für Mcello gilt insbesondere:

`Domain/Menu-Modell → App/Presentation Contract → FoodStage/Builder/Motion`

nicht umgekehrt.

## Provider- und Portabilitätsgrenze

Supabase/PostgreSQL ist ein wichtiger Adapter-/Runtime-Baustein, aber die Domain soll nicht unnötig providergebunden werden. Ebenso dürfen Lovable, Vercel, Figma, Firefly oder andere externe Werkzeuge nicht still zu Build- oder Runtime-Pflichten werden.

Der Self-host-Pfad umfasst unter anderem:

- non-root/read-only Node-App-Container
- explizite Production Composition
- TLS/Reverse Proxy/Firewall-Grenzen
- DB-Migrationen per URL
- Backup/Restore-Drill
- Production Preflight
- fail-closed Messaging ohne freigegebenen Provider

## Qualitätsgates

Der zentrale lokale Check ist `npm run check`. Zusätzlich existieren je nach Scope:

- Chromium-Smokes
- vollständiger lokaler Supabase-Integrationstack
- Self-host Container Checks
- Migration-/Backup-/Restore-Drills
- Design-/Screenshot-/Visual-Acceptance-Gates

## Detailquellen

- [`docs/projects/mcello/ARCHITECTURE.md`](../../docs/projects/mcello/ARCHITECTURE.md)
- [`README.md`](../../README.md)
- [`infra/selfhost/README.md`](../../infra/selfhost/README.md)
- [`docs/environment.md`](../../docs/environment.md)
