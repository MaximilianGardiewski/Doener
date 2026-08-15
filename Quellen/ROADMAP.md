# Roadmap — Doener / Mcello V1

Stand: 2026-08-15

Diese Roadmap ist eine Arbeitsreihenfolge. Bindend bleibt das Decision Ledger. Ein offener Acceptance-Haken bedeutet nicht automatisch, dass keinerlei Code existiert; vorhandene Implementierung wird gegen Tests und Decision Ledger abgeglichen, bevor der Haken geändert wird.

## P0 — PREPARE_NOW-Plattformgrenzen abgeschlossen

- [x] D004 Payment Boundary — PR #7; V1 pay-on-site, Online-Payment provider-neutral vorbereitet.
- [x] D006 Delivery Boundary — PR #9; Merge-Commit `01dd008743ce617b0d8e93ff44fef9881cf8318e`; PLZ/Radius-Vertrag vorbereitet, Mcello V1 Application + DB hart Pickup-only.
- [x] D027 Order Source Boundary — PR #8; `web | counter | table` vorbereitet, Mcello V1 web-only, Source immutable.
- [x] D040 Capacity Effort Boundary — PR #8; Effort-Snapshots vorbereitet, V1 weiterhin count-basiert.
- [x] D047/D050 Recommendation-/Analytics-Datenbasis.
- [x] D057 Location Boundary — PR #6; Single-Location-App mit wiederverwendbarer Location-Grenze.
- [x] Keine dieser Arbeiten hat Production deployed oder mutiert.

## P1 — V1 Acceptance Reconciliation

Evidence-Ledger: `docs/projects/mcello/V1_EVIDENCE.md`

- [x] PR #10 hat den vorhandenen V1-Stand in VERIFIED/PARTIAL/OPEN/PREPARED getrennt und nur belegte Acceptance-Haken geschlossen.
- [x] Merge-Commit PR #10: `2eddd26fca31465c2b7c32f7f4aefaa984fd6cea`.
- [x] D056 Custom Delay wird auf `agent/mcello-custom-delay` als erste echte Restlücke geschlossen: +5/+10/+15 bleiben, zusätzlich frei 1–120 Minuten; Server validiert unabhängig; ETA und Customer-Update-Outbox werden Ende-zu-Ende geprüft.

### Bereits VERIFIED

- [x] D005/D009 — Pickup ASAP + Vorbestellslots
- [x] D039 — atomare 15-Minuten-Slot-Kapazität
- [x] D038 — Cart-Persistenz + Revalidation
- [x] D018/D048 — minimaler Checkout + freie Hinweise
- [x] D042 — bindend erst bei KDS-Akzeptanz
- [x] D043 — token-scoped Edit/Cancel nur pre-accept; atomare Revalidation von Preis, Verfügbarkeit und Slot/Kapazität; nach KDS-Acceptance DB-seitig gesperrt (PR #14).
- [x] D053 — konfigurierbarer Default-Timeout 5 Minuten
- [x] D010 — Accept/Preparing/Ready/Completed
- [x] D011 — Quick-Reject-Gründe
- [x] D014/D049 — Alarm + Multi-Device Realtime
- [x] D055 — Geplant-Lane + Preparation Lead
- [x] D056 — +5/+10/+15/custom Delay, ETA-Update und delayed Notification-Outbox
- [x] D054 — Zielzeit + Countdown
- [x] D035 — Sold-out sichtbar aber disabled
- [x] D045 — strukturierte Allergene/Dietary Labels
- [x] D051 — zeitgesteuerte Verfügbarkeit
- [x] D036 — provisional Seed + Provenienz + Owner-Flag
- [x] D021 — Staff operational-only
- [x] D031 — Homepage-Sektionen kontrolliert ordnen/ausblenden
- [x] D032 — News/Event Scheduling + Pinning
- [x] D022/D023 — Server-/DB-Rollenboundary
- [x] D064 — Development OTP ohne externen Paid Provider
- [x] D063 — lokaler Supabase-CLI/Docker-Backendpfad
- [x] D063 — keine Lovable-/Vercel-Runtime-Abhängigkeit

### Bewusst PARTIAL / nicht grün markiert

- [ ] D003 — Contract WhatsApp-primary/SMS-fallback vorhanden; echter freigegebener Production-Transport fehlt.
- [ ] D037/D044/D052 — Closed/Pause/Cutoff technisch korrekt; D037-Fallback Telefon/WhatsApp braucht bestätigte Kontaktdaten.
- [ ] D012/D013 — Pause + Snooze vorhanden; eigenständige Rush-Semantik fehlt.
- [ ] D015 — Status/Progress/Summary vorhanden; Pickup-Adresse fehlt.
- [ ] D016 — Notification-Outbox vorhanden; Production WhatsApp/SMS-Transport fehlt.
- [ ] D017 — Route + Call brauchen bestätigte Adresse/Telefonnummer.
- [ ] D020 — Admin-Bausteine weitgehend vorhanden; Gesamt-Acceptance inkl. Media-/Owner-Workflow noch nicht geschlossen.
- [ ] D007/D008 — Konfigurator/Modifier/Extras vorhanden; owner-bestätigte Mcello Ingredient-/Sauce-Konfiguration fehlt noch.

## P2 — Nächste echte Implementierungslücken

1. **D012 Rush Mode** — Semantik so definieren, dass keine ungeklärten Betriebsregeln erfunden werden.
2. **D003/D016 Production Messaging** — erst nach expliziter Freigabe eines Providers und unvermeidbarer Carrier-/Providerkosten.
3. **D015/D017 Kontakt/Anfahrt** — nach first-party Bestätigung von Adresse und Telefonnummer.
4. **D020/D007/D008 Admin-/Menu-Gesamtabnahme** — nach owner-bestätigtem Produkt-/Ingredient-/Media-Datensatz.

## P3 — Public Experience / Showcase-Qualität

Wenn die funktionalen V1-Lücken geschlossen sind:

- D001/D029 — finales Modern Warm Premium Designsystem
- D024–D026 — Venue/Community/Story mit echten Mcello-Fakten
- D030 — finale Navigation/CTA inklusive responsive QA
- D058 — hochwertige, schnelle Motion
- D060 — PWA-Installability-/Browser-Abnahme
- echte, freigegebene Mcello-Medien integrieren
- Responsive-/Route-QA Desktop + Mobile

Figma, Lovable und Visual Truth dürfen beschleunigen; relevante Ergebnisse müssen zurück ins Repo.

## P4 — Release Hardening

Vor echtem Go-live:

- owner-bestätigte Menü-/Preis-/Ingredient-Daten
- Auth/RLS-/Storage-Audit
- Secrets-/Environment-Audit
- leerer DB-Rebuild aus Migrationen
- Self-Host-Runbook
- TLS/Firewall/Monitoring
- Backup + Restore-Test
- Browser-/PWA-/Mobile-Smokes
- SEO/Metadata/Content-Integrity
- Rollback-Plan
- explizite Production-Freigabe

## Merge-Regel

Kein Baustein wird aufgrund einer Agenten-Zusammenfassung gemerged. Maßgeblich sind Diff, Tests, Integrationsworkflow und Review. Production bleibt ein separater, ausdrücklich freizugebender Schritt.
