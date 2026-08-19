# Roadmap

> Diese Seite ist eine lesbare Zusammenfassung. Kanonisch und detaillierter bleibt [`Quellen/ROADMAP.md`](../../Quellen/ROADMAP.md).

## Aktuelle Richtung

Die Engineering-Basis von Mcello V1 ist weitgehend verifiziert. Der Schwerpunkt liegt jetzt nicht auf einer zweiten Grundarchitektur, sondern auf **Design Rebaseline, Product Experience und visueller Qualität** innerhalb der vorhandenen Grenzen.

## P0 — vorbereitete Plattformgrenzen

Abgeschlossen sind unter anderem:

- Payment Boundary — V1 pay-on-site
- Delivery Boundary — V1 hart Pickup-only, Future Boundary vorbereitet
- Order Source Boundary
- Capacity Effort Boundary
- Analytics-/Recommendation-Datenbasis
- Location Boundary

## P1 — verifizierte V1-Engineering-Basis

Weitgehend VERIFIED:

- Ordering / Checkout / Cart-Revalidation
- Slots / Capacity / Pickup
- KDS / Realtime / Rush / Snooze / Delay
- Menu / Admin / CMS
- Allergene / Dietary / Cross-Sells / Scheduling
- Public Experience / PWA
- Rollen / RLS / RPC / Storage
- Self-host / Migration / Restore
- provider-neutrale Future Boundaries

## P2 — Design Rebaseline / Product Experience

Aktueller Produktfokus:

1. Art Direction / Brand
2. Homepage V2
3. Store V2
4. Interactive Builder / `FoodStage`
5. Pizza Builder
6. Döner/Yufka Builder
7. Cart / Checkout / Status Polish
8. KDS/Admin Visual Reconciliation
9. Visual / Responsive / Accessibility / Performance Gates

### Aktueller GitHub-Stand beim Wiki-Start

Am 19.08.2026 waren auf `main` der Snapshot `e09a4466...` und unter anderem folgende relevante offene PRs sichtbar:

- **#91 — Design: Mcello interactive configurator experience**
- **#84 — Mcello D074 — GSAP cart confirmation migration**

Diese Liste ist nur ein Snapshot. Für den aktuellen Merge-/Review-Stand GitHub direkt prüfen.

## P3 — echte Go-live-Inputs

Noch benötigt werden vor allem First-Party-/Owner-/Provider-Daten:

- Kontakt-/Adressdaten
- WhatsApp Production Provider + Kostenfreigabe
- reale Menü-/Ingredient-/Sauce-/Extra-Bestätigung
- finales Logo
- echte Medien und Rechte
- bestätigte Story-/Team-Fakten

## P4 — Owner-Input-Integration

Wenn echte Inputs vorliegen, wird nicht neu gebaut. Vorgesehener Pfad:

`First-Party-Input → Content-Integrity → Admin/Import/Secrets → Integration-/Browser-QA → Acceptance/Evidence → PR → Merge`

## P5 — Go-live Hardening

Vor echtem Production-Go-live bleiben insbesondere:

- finale Datenabnahme
- Öffnungszeiten/Kapazität/Rush-Abnahme
- Contact/WhatsApp-Fallback
- finale Medienrechte
- Auth/RLS/Storage-Audit auf finalem Datenstand
- Secrets-/Environment-Audit
- leerer DB-Rebuild
- Self-host Migration-/Backup-/Restore-Drill
- Browser/PWA/Mobile Smokes
- Design-/Visual-Gates
- SEO/Metadata/Content-Integrity
- Rollback-Check
- **explizite Production-Freigabe**

## Merge-Regel

Ein Agentenbericht oder ein schönes Mockup reicht nie als Fertig-Nachweis. Maßgeblich sind Diff, Tests, Integrationsworkflow, Review und bei Design-Slices zusätzlich Browser-/Screenshot-/Visual-Gates.
