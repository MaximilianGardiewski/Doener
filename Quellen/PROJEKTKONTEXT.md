# Projektkontext — Doener / BusinessWebFactory / Mcello

Stand: 2026-08-18

## Mission

Doener ist nicht nur eine einzelne Restaurant-Website. Im Repository entsteht eine **provider-neutrale BusinessWebFactory**, aus der reale Business-Web-Anwendungen mit wiederverwendbaren Domain-, CMS-, Auth-, Media-, Ordering- und Operations-Bausteinen gebaut werden können.

- **Mcello** ist die aktuelle Gastro-/Ordering-Referenzanwendung.
- **Lebtig** ist eine weitere Referenzanwendung und Wiederverwendungsquelle.
- Die Plattformarchitektur ist wichtiger als eine Kopplung an einen einzelnen Builder, Hoster oder SaaS-Anbieter.

## Source of truth

Git, Migrationen, Tests, Decision Ledgers und Repo-Dokumentation sind kanonisch. Builder und Coding-Agents sind Clients/Assistenten.

**`main` ist der kanonische Integrationsbranch.** Feature-/Konsolidierungsarbeit erfolgt auf reviewbaren Branches und wird erst nach Diff, Tests und Review in `main` integriert. Historische Branch-Hinweise sind kein alternativer Source-of-Truth-Pfad.

## Architekturprinzipien

1. **Domain zuerst** — Invarianten und Contracts liegen in wiederverwendbaren Packages.
2. **Adapter an den Rändern** — Supabase, Messaging, Payment, Storage und Hosting dürfen die Domain nicht dominieren.
3. **Datenbank als zweite Schutzschicht** — kritische Grenzen müssen zusätzlich zu Application-Checks in PostgreSQL/RLS/Constraints abgesichert sein.
4. **Single source of truth** — keine wichtige Logik nur in Lovable/Figma/Codex/Claude/Vercel.
5. **Vertical slices** — Domain → Adapter → DB → Integrationstest → UI, bevor reines Oberflächenpolishing priorisiert wird.
6. **Keine erfundenen Business-Fakten** — Preise, Öffnungszeiten, Claims, Kontaktangaben, Story und Medienrechte brauchen Herkunft/Freigabe.
7. **Produktionsschutz** — kein Production-Deploy und keine Produktionsmutation ohne ausdrückliche Freigabe.
8. **Evidence vor Haken** — Acceptance erst auf VERIFIED setzen, wenn Runtime-/DB-/Browser-Evidenz den bindenden Decision-Scope abdeckt.

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

## Stand der technischen V1-Basis

Wichtige bereits VERIFIED Slices:

- eigenes Ordering, Slots/Kapazität, Pre-accept Edit/Cancel und KDS-Lifecycle
- Shop-State mit Admin-only Force-Open, Pause/Rush/Closed und konfigurierbarem Cutoff (`D044`, `D052`)
- komplette technische Admin-Katalog-Control-Plane inklusive rights-aware Produktbildern (`D020`)
- Staff operational-only und DB-/RPC-Rollenforcement (`D021`)
- Allergene, Timed Availability, Cross-Sells, CMS, Galerie und Realtime
- Modern-Warm-Premium Designsystem, responsive Navigation, Homepage-Composition, Motion, Copy-Ton und PWA (`D001`, `D024`, `D030`, `D058`, `D059`, `D060`)
- Self-host Release/DB-Migration/Backup-Restore/Monitoring-Path (`D063`)
- Paid-Messaging Spend/Runtime Guard (`D064`)
- Decision-Coverage-Guard über D001–D064 (`D062`)

Der aktuelle Engpass liegt deshalb nicht mehr bei Grundarchitektur, sondern bei den **echten First-Party-/Owner-/Provider-Inputs** in `Quellen/V1-GO-LIVE-INPUTS.md`.

## Bereits belastbar vorbereitete Plattformgrenzen

- Analytics-/Recommendation-Datenbasis (`D047`, `D050`)
- Location Boundary (`D057`)
- Payment Provider Boundary (`D004`)
- Delivery Boundary (`D006`)
- Future Order Sources (`D027`)
- Effort-/Capacity-Metadaten (`D040`)

Für jede weitere PREPARE_NOW-Entscheidung gilt: Contract + Datenmodell/Boundary + Tests jetzt; sichtbare Future-Funktion erst später.

## Verbleibende Go-live-Inputs

Nicht mit Placeholdern oder ungeprüfter Recherche schließen:

- bestätigte Adresse, Telefon-/WhatsApp-Kontakt und Maps-Ziel
- explizite WhatsApp-/SMS-Provider-/Kostenfreigabe
- owner-bestätigte reale Menü-/Ingredient-/Sauce-/Extra-Konfiguration
- finales originales Mcello-Logo/Recognition-Asset
- echte freigegebene Mcello-Fotos, Rechte und Owner-/Team-/Story-Fakten
- bestätigte reale Betriebsparameter wie Öffnungszeiten, Sonderzeiten, Cutoff/Kapazität/Rush-Werte

Details: `Quellen/V1-GO-LIVE-INPUTS.md`.

## Kosten- und Vendor-Regel

Neue Dienste dürfen nicht allein aus Bequemlichkeit zu einer unvermeidbaren Runtime-Abhängigkeit werden. Der vorgesehene Produktionspfad bleibt auf vorhandener/self-hostbarer Infrastruktur reproduzierbar. Optional verwendete Design-, Preview- oder Coding-Tools ändern diese Grenze nicht.

## Definition of done für einen Baustein

Ein Baustein ist nicht „fertig“, nur weil Code geschrieben wurde. Er braucht je nach Schicht:

- Domain-/Invariantentests
- Struktur-/Regressionstests
- Datenbank-/RLS-/Constraint-Nachweis, wenn Persistenz betroffen ist
- echten Integrationsworkflow bei Supabase-/Realtime-/Storage-Änderungen
- Browser-/Responsive-Test bei Public-UI-Verträgen
- Self-host-/Migration-/Restore-Gegenprobe bei Release-relevanten Änderungen
- aktualisierte Acceptance-/Evidence-/Architektur-Dokumentation
- PR + grüne Checks + Review vor Merge
- kein Production-Deploy ohne separate Freigabe
