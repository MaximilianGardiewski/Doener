# BusinessWebFactory / Doener

Vendor-neutrale Plattform für wiederverwendbare Business-Websites und operative Business-Apps. Das Repository enthält nicht nur eine einzelne Restaurant-Website, sondern gemeinsame Domain-, CMS-, Auth-, Media-, Ordering-, KDS-, Notification-, Analytics- und Self-host-Bausteine.

**`main` ist der kanonische Integrationsbranch.** Git, Migrationen, Tests, Decision Ledgers und die Repo-Dokumentation sind Source of Truth; Builder und Coding-Agents sind Clients, keine Parallelquelle.

## Anwendungen

### Mcello

`apps/mcello/` ist die derzeit umfangreichste Referenzanwendung und beweist die Gastro-/Ordering-Vertical-Slices:

- eigene first-party Online-Bestellung ohne Marketplace-Pflicht
- Pickup ASAP + Vorbestellslots
- server-/DB-autoritatives Pricing, Verfügbarkeit und Kapazität
- KDS mit Accept/Reject/Preparing/Ready/Completed, Rush/Pause/Snooze und Multi-Device Realtime
- Admin-Katalog mit Produkten, Preisen, Modifier-Gruppen und rights-aware Produktmedien
- CMS für Homepage, News/Events und Galerie
- PWA, responsive Public Experience und neutrale beschriftete Placeholder bis echte Mcello-Medien freigegeben sind
- pay-on-site V1; Online-Payment nur als vorbereitete Boundary
- Delivery nur als vorbereitete Boundary
- Development- und Production-Composition sind getrennt; Production bleibt für externe Messaging-Zustellung fail-closed, bis ein Provider ausdrücklich freigegeben ist

### Lebtig

`apps/lebtig/` ist die zweite Referenz-/Donor-Anwendung. Die nächste strategische Konsolidierungsphase nutzt Lebtig als **echten zweiten Consumer** der gemeinsamen Packages, um die Wiederverwendbarkeit der BusinessWebFactory praktisch zu beweisen.

## Workspace-Packages

Die Package-zu-Package-Grenzen laufen über öffentliche `@business-web/*`-APIs; direkte relative Imports in fremde `packages/*/src`-Verzeichnisse sind durch CI verboten.

| Package | Verantwortung |
|---|---|
| `@business-web/core` | gemeinsame Shop-/Location-Invarianten |
| `@business-web/auth` | Rollen-/Berechtigungsmodelle |
| `@business-web/cms` | wiederverwendbare CMS-Modelle |
| `@business-web/menu-engine` | Produkte, Modifier und Preis-/Konfigurationslogik |
| `@business-web/ordering` | Checkout, Order-Lifecycle, Fulfillment- und Capacity-Boundaries |
| `@business-web/notifications` | provider-neutrale OTP-/Order-Notification-Contracts; Dev-Implementierungen nur über explizite Dev-Subpaths |
| `@business-web/kds` | KDS-Lanes und operative Order-Darstellung |
| `@business-web/payments` | provider-neutrale Payment-Contracts |
| `@business-web/analytics` | Analytics-/Recommendation-Event-Contracts |
| `@business-web/supabase-adapter` | Supabase/PostgREST/Realtime-spezifische Adapter |

## Lokaler Start

Voraussetzung: **Node.js 22 oder neuer**.

```bash
npm install
cp .env.example .env.local
npm run preview:mcello
```

Danach läuft Mcello standardmäßig unter:

```text
http://127.0.0.1:4173
```

Für vollständige DB-/Auth-/Realtime-/Storage-Flows wird der lokale Supabase-CLI/Docker-Stack verwendet. Browser-safe und server-only Environment-Werte sind in [`docs/environment.md`](docs/environment.md) dokumentiert. Reale Secrets gehören niemals ins Repository.

## Qualitäts- und Konsolidierungschecks

Der zentrale Check ist:

```bash
npm run check
```

Er umfasst aktuell:

- strict TypeScript via `tsc --noEmit`
- Domain-Tests der Workspace-Packages
- Schema-/Invariant-/Acceptance-/Architecture-Tests
- reproduzierbaren V1-Datenbank-Migrationsaudit
- rekursiven JavaScript-Syntaxscan für `apps/` und `scripts/`

Einzelne Kommandos:

```bash
npm run typecheck
npm run test:domain
npm run test:schema
npm run audit:db
npm run check:static
npm run build:preview
```

GitHub Actions ergänzt dies um Chromium-Smokes, den vollständigen lokalen Supabase-Integrationstack, Self-host-Container-Checks und bei relevanten Änderungen einen Migrations-/Backup-/Restore-Drill.

## V1-Datenbankstand

Die Migrationshistorie ist weiterhin kanonisch und wird **nicht** blind gesquasht oder gelöscht.

Der reproduzierbare Audit vom 18.08.2026 erfasst unter anderem:

- 41 SQL-Migrationen
- 28 historisch erzeugte Tabellen
- 7 Types
- 97 unterschiedliche Functions / 126 historische Function-Definitionen
- 18 später erneut definierte Functions
- 118 `SECURITY DEFINER`-Vorkommen
- 0 fehlerhafte Migrationsdateinamen
- 0 doppelte Migrationstimestamps

Details und die Empfehlung für eine mögliche zusätzliche Clean-Install-V1-Baseline vor dem ersten Production-Deploy stehen in [`docs/projects/mcello/V1_DB_AUDIT.md`](docs/projects/mcello/V1_DB_AUDIT.md).

## Self-host / Portabilität

Die Plattform darf nicht still von Lovable, Vercel oder einem Managed-Supabase-Projekt abhängig werden.

Der vorhandene Self-host-Pfad umfasst unter anderem:

- Node-App als non-root/read-only Container
- expliziten Production-Composition-Root
- TLS-/Reverse-Proxy-/Firewall-Grenzen
- direkte Migrationen per DB-URL
- Backup- und Restore-Drill
- Production-Preflight
- fail-closed Messaging-Grenze ohne freigegebenen Provider

Runbook: [`infra/selfhost/README.md`](infra/selfhost/README.md)

## Mcello V1 — was bereits technisch steht

Die belastbare Wahrheit liegt in Decision Ledger, Acceptance und Evidence. Unter anderem sind bereits verifiziert:

- Modern-Warm-Premium Designsystem und responsive Public Experience
- eigene Ordering-Pipeline, Slots, Capacity und Cart-Revalidation
- KDS-/Realtime-/Rush-/Snooze-/Delay-Flows
- Admin-Katalog inkl. Produktbildern und Rollenboundary
- Öffnungszeiten, Cutoff und Admin Shop Overrides
- Allergene/Dietary Labels, Cross-Sells und zeitgesteuerte Verfügbarkeit
- CMS, News/Events, Galerie und Homepage-Komposition
- PWA
- strict Role-/RLS-/RPC-/Storage-Grenzen
- provider-neutrale Payment-/Delivery-/Analytics-/Location-Boundaries
- Self-host Release-, Migration- und Restore-Pfad

## Bewusst noch offene Go-live-Inputs

Die verbleibenden Mcello-V1-Punkte sind überwiegend **keine fehlende Grundarchitektur**, sondern benötigen bestätigte First-Party-Daten oder eine ausdrückliche externe Freigabe:

- reale Adresse, Telefonnummer und WhatsApp-Kontakt für Pickup/Route/Call/Fallback
- ausdrückliche Auswahl/Freigabe eines Production-WhatsApp-/SMS-Providers inklusive unvermeidbarer Kosten
- owner-bestätigte reale Produkte/Zutaten/Saucen/Extras
- finales freigegebenes Mcello-Logo
- echte Mcello-Fotos mit geklärten Bildrechten
- bestätigte Owner-/Team-/Story-Fakten

Bis reale Bilder vorliegen, verwendet die Public Experience bewusst **graue Placeholder mit weißer, inhaltlich passender Beschriftung** statt erfundener Food-/Venue-Fotografie.

Konkrete Input-Liste: [`Quellen/V1-GO-LIVE-INPUTS.md`](Quellen/V1-GO-LIVE-INPUTS.md)

## Projektquellen und Arbeitsregeln

Für neue Entwickler und Agents ist [`Quellen/README.md`](Quellen/README.md) der Einstiegskompass. Bei Widersprüchen gilt die dort dokumentierte Priorität der Wahrheit.

Wichtige Dateien:

- [`AGENTS.md`](AGENTS.md) — projektweite Arbeitsregeln
- [`docs/projects/mcello/DECISIONS.md`](docs/projects/mcello/DECISIONS.md) — bindende Produktentscheidungen
- [`docs/projects/mcello/ACCEPTANCE.md`](docs/projects/mcello/ACCEPTANCE.md) — V1-Acceptance
- [`docs/projects/mcello/V1_EVIDENCE.md`](docs/projects/mcello/V1_EVIDENCE.md) — verifizierte Evidence und Blocker
- [`docs/projects/mcello/ARCHITECTURE.md`](docs/projects/mcello/ARCHITECTURE.md) — Architektur
- [`docs/projects/mcello/V1_DB_AUDIT.md`](docs/projects/mcello/V1_DB_AUDIT.md) — DB-Migrationsaudit
- [`Quellen/ROADMAP.md`](Quellen/ROADMAP.md) — aktuelle Arbeitsreihenfolge
- [`Quellen/SKILLS-UND-PLUGINS.md`](Quellen/SKILLS-UND-PLUGINS.md) — kanonische Skills und Toolrollen
- [`skill-registry.json`](skill-registry.json) — Skill-Registry

## Aktuelle Projektphase

> **BusinessWebFactory braucht jetzt keine zweite Ausbauphase, sondern eine Konsolidierungsphase.**

Die Reihenfolge ist:

1. Git-Hygiene / `main` / Baseline
2. Typecheck + Static Safety Net
3. echte Package-Grenzen
4. kontrolliertes Refactoring nach Verantwortlichkeiten
5. Production-/DB-Härtung
6. Dokumentation
7. **Lebtig als zweiter echter Consumer**

Die Schritte 1–5 sind bereits weitgehend umgesetzt; dieser README ist Teil von Schritt 6. Größere neue Plattformfeatures sollen vorerst nur hinzukommen, wenn sie einen bestehenden V1-Blocker lösen oder für Konsolidierung/Portabilität/den zweiten Consumer notwendig sind.

## Production-Regel

**Kein Production-Deploy und keine Production-Mutation ohne separate ausdrückliche Freigabe.**

Ebenso werden keine neuen laufenden SaaS-/Providerkosten still aktiviert. Externe Tools wie Lovable, Figma, Visual Truth, Adobe/Canva oder Vercel dürfen den Workflow beschleunigen, sind aber nicht Source of Truth und keine automatisch notwendige Runtime-Abhängigkeit.
