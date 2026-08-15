# Projektkontext — Doener / BusinessWebFactory / Mcello

Stand: 2026-08-15

## Mission

Doener ist nicht nur eine einzelne Restaurant-Website. Im Repository entsteht eine **provider-neutrale BusinessWebFactory**, aus der reale Business-Web-Anwendungen mit wiederverwendbaren Domain-, CMS-, Auth-, Media-, Ordering- und Operations-Bausteinen gebaut werden können.

- **Mcello** ist die aktuelle Gastro-/Ordering-Referenzanwendung.
- **Lebtig** ist eine weitere Referenzanwendung und Wiederverwendungsquelle.
- Die Plattformarchitektur ist wichtiger als eine Kopplung an einen einzelnen Builder, Hoster oder SaaS-Anbieter.

## Source of truth

Git, Migrationen, Tests, Decision Ledgers und Repo-Dokumentation sind kanonisch. Builder und Coding-Agents sind Clients/Assistenten.

Aktiver Integrationszweig zum Stand dieser Notiz: `bootstrap/business-web-factory`. `main` bildet derzeit nicht den vollständigen Entwicklungsstand ab. Dieser Hinweis ist ein Snapshot und darf nicht als dauerhafte Branch-Regel interpretiert werden.

## Architekturprinzipien

1. **Domain zuerst** — Invarianten und Contracts liegen in wiederverwendbaren Packages.
2. **Adapter an den Rändern** — Supabase, Messaging, Payment, Storage und Hosting dürfen die Domain nicht dominieren.
3. **Datenbank als zweite Schutzschicht** — kritische Grenzen müssen zusätzlich zu Application-Checks in PostgreSQL/RLS/Constraints abgesichert sein.
4. **Single source of truth** — keine wichtige Logik nur in Lovable/Figma/Codex/Claude/Vercel.
5. **Vertical slices** — Domain → Adapter → DB → Integrationstest → UI, bevor reines Oberflächenpolishing priorisiert wird.
6. **Keine erfundenen Business-Fakten** — Preise, Öffnungszeiten, Claims, Zertifizierungen und Medienrechte brauchen Herkunft/Freigabe.
7. **Produktionsschutz** — kein Production-Deploy und keine Produktionsmutation ohne ausdrückliche Freigabe.

## Aktuelle Kernpakete

- `packages/core` — gemeinsame Plattform-/Shop-Invarianten, inklusive Location Context.
- `packages/menu-engine` — Menü, Konfiguration, Optionen und Preislogik.
- `packages/ordering` — Checkout, Order-Lifecycle, Kapazität.
- `packages/kds` — Küchen-/Operationslogik.
- `packages/notifications` — provider-neutrale Benachrichtigungen/OTP.
- `packages/payments` — provider-neutrale Payment-Contracts; Mcello V1 bleibt pay-on-site.
- `packages/cms` — Inhalts-/Redaktionsbausteine.
- `packages/auth` — Rollen-/Authentifizierungsbausteine.
- `packages/analytics` — Analytics-Contracts.
- `packages/supabase-adapter` — Supabase-spezifische Persistenz-/RPC-Adapter.

## Mcello V1 — harte Produktgrenzen

Die vollständige Wahrheit steht in `docs/projects/mcello/DECISIONS.md`. Besonders wichtig für weitere Arbeit:

- eigenes Website-Bestellsystem, kein Marketplace als Kern (`D002`)
- WhatsApp OTP primär, SMS als Fallback; Entwicklung ohne still aktivierte Providerkosten (`D003`, `D064`)
- **Zahlung in V1 nur vor Ort, bar oder Karte; Online-Payment nur vorbereitet (`D004`)**
- Pickup + Vorbestellung; Delivery nur vorbereitet (`D005`, `D006`)
- strukturierter Konfigurator und serverseitige Preis-/Verfügbarkeitsprüfung (`D007`, `D008`)
- Bestellung wird erst mit KDS-Akzeptanz bindend (`D042`)
- Multi-Device-KDS, Statusfluss, Rush/Pause/Snooze (`D010`–`D017`, `D049`)
- Single-Location-Mcello, aber wiederverwendbarer Location-Boundary (`D057`)
- PWA + hochwertige, warme Premium-Darstellung (`D001`, `D029`, `D058`, `D060`)
- kein verpflichtender neuer monatlicher SaaS-Posten; Self-Hosting-Pfad muss erhalten bleiben (`D063`)

## Bereits belastbar vorbereitete Plattformgrenzen

- Analytics-/Recommendation-Datenbasis (`D047`, `D050`)
- Location Boundary (`D057`)
- Payment Provider Boundary (`D004`)

Für jede weitere PREPARE_NOW-Entscheidung gilt: Contract + Datenmodell/Boundary + Tests jetzt; sichtbare Future-Funktion erst später.

## Kosten- und Vendor-Regel

Neue Dienste dürfen nicht allein aus Bequemlichkeit zu einer unvermeidbaren Runtime-Abhängigkeit werden. Der vorgesehene Produktionspfad bleibt auf vorhandener/self-hostbarer Infrastruktur reproduzierbar. Optional verwendete Design-, Preview- oder Coding-Tools ändern diese Grenze nicht.

## Definition of done für einen Baustein

Ein Baustein ist nicht „fertig“, nur weil Code geschrieben wurde. Er braucht je nach Schicht:

- Domain-/Invariantentests
- Struktur-/Regressionstests
- Datenbank-/RLS-/Constraint-Nachweis, wenn Persistenz betroffen ist
- echten Integrationsworkflow bei Supabase-/Realtime-/Storage-Änderungen
- aktualisierte Acceptance-/Architektur-Dokumentation
- PR + grüne Checks + Review vor Merge
- kein Production-Deploy ohne separate Freigeabe
