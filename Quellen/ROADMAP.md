# Roadmap — Doener / Mcello V1

Stand: 2026-08-15

Diese Roadmap ist eine Arbeitsreihenfolge. Bindend bleibt das Decision Ledger. Ein offener Acceptance-Haken bedeutet nicht automatisch, dass keinerlei Code existiert; vorhandene Implementierung muss zuerst gegen Tests und Decision Ledger abgeglichen werden, bevor der Haken geändert wird.

## P0 — Abgeschlossene PREPARE_NOW-Grenzen

### D004 Payment Boundary
- [x] provider-neutrales `packages/payments`
- [x] V1-Policy: nur `pay_on_site`
- [x] Checkout/Order Payment-Snapshot
- [x] Supabase-Spalten + DB-Constraint gegen Online-Payment
- [x] öffentlicher Statusvertrag ohne Provider-Geheimnisse
- [x] Kundenstatus: `Vor Ort · bar oder Karte`
- [x] Domain-/Struktur-/Integrationstests
- [x] GitHub Actions grün
- [x] PR #7 gemerged in `bootstrap/business-web-factory`
- [x] kein Production-Deploy durchgeführt

### D027 Order Source Boundary
- [x] `web | counter | table` in Domain und PostgreSQL
- [x] Mcello V1 Checkout persistiert selbst `web`
- [x] Order-Ursprung nach Insert unveränderlich
- [x] Manipulations-/Boundary-Test
- [x] keine Counter-/Table-UI vorgezogen
- [x] PR #8 gemerged; Merge-Commit `5cc56c3678310a1928c82180f46e2c5fa0a854da`

### D040 Capacity Effort Boundary
- [x] optionales `menu_products.effort_weight`
- [x] `MenuProduct.effortWeight` und Order-Item-Snapshot
- [x] PostgreSQL setzt/versiegelt `effort_weight_snapshot` aus dem echten Produkt
- [x] V1-Kapazität bleibt strikt count-basiert
- [x] vollständiger Supabase-Integrationsnachweis
- [x] bestehender Allergen-/Label-Vertrag nach Regressionstest erhalten
- [x] PR #8 gemerged

## P1 — D006 Delivery Boundary

Aktueller Baustein auf `agent/mcello-delivery-boundary`:

- [x] vorhandenen `pickup | delivery` Fulfillment-Contract beibehalten
- [x] provider-neutraler `DeliveryZoneResolver`
- [x] PLZ- und Radius-Zonen als Future-Contracts vorbereitet
- [x] `PickupOnlyFulfillmentPolicy` für Mcello V1
- [x] manipuliertes `fulfillmentType: delivery` scheitert vor OTP/Persistenz
- [x] PostgreSQL-Constraint verhindert V1-Delivery auch bei privilegiertem Direktzugriff
- [x] Fulfillment einer Bestellung ist nach Erstellung unveränderlich
- [x] keine Delivery-UI und keine erfundenen Gebühren/Mindestwerte/Provider eingebaut
- [x] Domain-/Struktur-/Supabase-Integrationstests ergänzt
- [ ] CI vollständig grün
- [ ] PR Review / Merge
- [ ] kein Production-Deploy

Nach D006 sind die ausdrücklich als `PREPARE_NOW_IMPLEMENT_LATER` markierten Plattformgrenzen D004, D006, D027, D040, D047/D050 und D057 architektonisch vorbereitet. Danach liegt der Schwerpunkt auf evidenzbasierter V1-Acceptance-Reconciliation statt weiteren Future-Features.

## P2 — Acceptance-Reconciliation für vorhandene V1-Funktionalität

Im Repository existieren bereits beträchtliche Ordering-/KDS-/CMS-/Realtime-Bausteine. Statt sie erneut zu bauen, wird pro Decision nachgewiesen, ob die Acceptance-Kriterien bereits erfüllt sind.

Priorisierte Prüfgruppen:

- **Ordering:** `D005`, `D009`, `D018`, `D037`–`D039`, `D042`, `D043`, `D052`, `D053`, `D055`, `D056`
- **OTP/Notifications:** `D003`, `D016`, `D064`
- **KDS/Operations:** `D010`–`D014`, `D049`, `D051`
- **Menu/Admin:** `D007`, `D008`, `D020`, `D021`, `D035`, `D045`
- **CMS/Public Content:** `D024`, `D031`–`D033`
- **Customer Status:** `D015`, `D017`, `D054`

Vorgehen je Gruppe:

1. vorhandenen Code und Migrationen inventarisieren
2. Decision gegen reale Invarianten mappen
3. fehlende Tests zuerst ergänzen
4. echten Supabase-Flow prüfen, falls Datenbank/Rechte beteiligt sind
5. erst danach Acceptance-Haken setzen

## P3 — Public Experience / Showcase-Qualität

Wenn die Kernflows nachweisbar stabil sind:

- `D001`, `D029`: Modern Warm Premium Designsystem festziehen
- `D024`–`D026`: Venue-/Community-/Story-Inszenierung
- `D030`: finale Navigation und Order-CTA
- `D058`: hochwertige Motion, ohne Geschwindigkeit/Usability zu opfern
- `D060`: PWA vollständig prüfen
- echte, freigegebene Mcello-Medien und Fakten integrieren
- Responsive-/Route-QA über Desktop und Mobile

Figma/Lovable/Visual Truth dürfen hier beschleunigen; die resultierenden Entscheidungen und Änderungen müssen zurück ins Repo.

## P4 — Release Hardening

Vor einem echten Go-live:

- vollständige owner-bestätigte Menü-/Preis-/Ingredient-Daten (`D036`)
- Auth/RLS-/Storage-Audit
- Secrets-/Environment-Audit
- Supabase-Migrations-Neuaufbau aus leerer DB
- Backup + Restore-Test
- TLS/Firewall/Monitoring für Self-Host
- Browser-/PWA-/Mobile-Smokes
- SEO/Metadata/Content-Integrity
- Rollback-Plan
- explizite Production-Freigabe

## Merge-Regel

Kein Baustein wird aufgrund einer Agenten-Zusammenfassung gemerged. Maßgeblich sind Diff, Tests, Integrationsworkflow und Review. Production bleibt ein separater, ausdrücklich freizugebender Schritt.
