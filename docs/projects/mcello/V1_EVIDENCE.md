# Mcello V1 — Acceptance Evidence Ledger

Stand: 2026-08-15

Dieses Dokument trennt **nachgewiesene V1-Funktionalität** von teilweise vorhandenen oder noch blockierten Decisions. Es ersetzt weder `DECISIONS.md` noch `ACCEPTANCE.md`.

Status:
- `VERIFIED` — Acceptance kann auf `[x]` gesetzt werden; Domain/UI/DB-Evidenz deckt die relevante V1-Anforderung ab.
- `PARTIAL` — wesentliche Teile existieren, mindestens eine bindende Anforderung fehlt noch.
- `OPEN` — noch nicht hinreichend nachgewiesen oder bewusst spätere Arbeitsphase.
- `PREPARED` — `PREPARE_NOW_IMPLEMENT_LATER`-Grenze ist architektonisch/testseitig abgeschlossen, sichtbares Future-Feature bleibt aus.

## Nachgewiesene V1-Kernfunktionalität

| Decision | Status | Nachweis | Bemerkung |
|---|---|---|---|
| D005 + D009 | `VERIFIED` | `apps/mcello/public/index.html`, `apps/mcello/public/app.js`, `tests/scheduling.integration.mjs` | Checkout bietet ASAP oder späteren freien Pickup-Slot; DB liefert/prüft zukünftige Slots. |
| D039 | `VERIFIED` | `packages/ordering/src/capacity.ts`, `tests/slot-capacity.integration.mjs`, `tests/ordering-schedule.integration.mjs` | 15-Minuten-Slots; atomarer Kapazitätswettlauf beweist, dass nur eine Order den letzten Platz erhält. |
| D038 | `VERIFIED` | `apps/mcello/public/app.js`, Checkout-Domain/DB-Revalidation | Warenkorb bleibt lokal bestehen; Menü, Verfügbarkeit, Modifier und Preise werden vor Submit erneut geladen/geprüft. |
| D018 + D048 | `VERIFIED` | `apps/mcello/public/index.html`, `packages/ordering/src/checkout.ts` | V1 fragt Vorname, Mobilnummer und optionale Bestell-/Artikelhinweise; kein Account/E-Mail-Zwang. |
| D042 | `VERIFIED` | `packages/ordering/src/model.ts`, `packages/ordering/test/model.test.ts`, `tests/supabase-local.integration.mjs` | Submit endet `waiting_for_acceptance`; erst Staff-Acceptance wechselt in `preparing`/`scheduled`. |
| D043 | `VERIFIED` | `apps/mcello/public/status.js`, `apps/mcello/public/edit-order.js`, `apps/mcello/server.mjs`, `tests/preaccept-edit.integration.mjs` | Status-Token erlaubt Edit/Cancel nur in `waiting_for_acceptance`. Edit rekonstruiert stabile Produkt-/Modifier-IDs, revalidiert Shop, Slot/Kapazität, Verfügbarkeit und Serverpreise atomar, erhält Identität/`submitted_at`/Payment und wird nach KDS-Acceptance DB-seitig abgewiesen. |
| D053 | `VERIFIED` | `packages/ordering/test/model.test.ts`, `tests/scheduling.integration.mjs`, Maintenance-RPCs | Default 5 Minuten ist konfigurierbar; Warn-/Auto-Reject-Ablauf wird mit temporärem Testwert vollständig ausgeführt. |
| D010 | `VERIFIED` | `apps/mcello/public/kds.js`, `packages/ordering/test/model.test.ts`, `tests/supabase-local.integration.mjs` | Incoming -> Accept mit Zeit -> Preparing -> Ready -> Completed ist durch UI, Domain und echte DB-Transitions belegt. |
| D011 | `VERIFIED` | `apps/mcello/public/kds.js`, Staff-Reject-RPC | Quick-Reject-Gründe für Überlastung, ausverkauft und Küchenschluss sind im KDS verdrahtet. |
| D012 + D013 | `VERIFIED` | `apps/mcello/public/kds.js`, `apps/mcello/public/ops.js`, `apps/mcello/public/rush-settings.js`, `tests/rush-mode.integration.mjs`, `tests/realtime-ready.integration.mjs` | Pause blockiert neue Online-Bestellungen. Rush bleibt innerhalb Öffnungsplan/Cutoff bestellbar und addiert nur auf neue ASAP-KDS-Versprechen einen admin-konfigurierten, DB-autoritativen Puffer; Vorbestell-Slots bleiben unverändert. Staff kann Produkte und strukturierte Modifier-/Zutatenoptionen operativ snoozen, aber weder Preise/Struktur noch den Rush-Puffer ändern. |
| D014 + D049 | `VERIFIED` | `apps/mcello/public/kds.js`, `apps/mcello/public/realtime-client.js`, `tests/realtime-ready.integration.mjs` | Wiederholter Alarm läuft solange Incoming Orders existieren; Postgres-Realtime + Safety-Reconciliation synchronisiert mehrere Geräte. |
| D055 | `VERIFIED` | `apps/mcello/public/kds.js`, `tests/scheduling.integration.mjs` | Vorbestellungen landen in `planned`; Preparation Lead ist konfigurierbar und Maintenance aktiviert Orders automatisch. |
| D056 | `VERIFIED` | `apps/mcello/public/kds.js`, `apps/mcello/server.mjs`, `tests/kds-custom-delay.test.mjs`, `tests/notification-outbox.integration.mjs` | KDS bietet +5/+10/+15 sowie frei 1–120 Minuten; Server validiert unabhängig. Ein 23-Minuten-Integrationstest verschiebt die ETA exakt und erzeugt einen `delayed`-Customer-Update-Job mit neuer Abholzeit. Externe Production-Zustellung bleibt separat D016. |
| D054 | `VERIFIED` | `apps/mcello/public/status.js`, `apps/mcello/public/status.html` | Status zeigt akzeptierte/angefragte Uhrzeit und ungefähren Countdown. |
| D035 | `VERIFIED` | `apps/mcello/public/app.js`, `apps/mcello/public/ops.js`, `tests/realtime-ready.integration.mjs` | Ausverkaufte Produkte/Optionen bleiben sichtbar und sind deaktiviert; Staff-Snooze wirkt auf Checkout-Verfügbarkeit. |
| D045 | `VERIFIED` | `tests/allergen-labels.integration.mjs`, Allergen/Label-Migrationen | Strukturierte Allergene und stabile Dietary Tags fließen Admin -> Checkout -> Public; Staff darf Struktur nicht manipulieren. |
| D051 | `VERIFIED` | `tests/ordering-schedule.integration.mjs`, `tests/timed-product-db-gate.integration.mjs` | Produkt-/Kategorie-Verfügbarkeit nach Wochentag, Zeit und Datumsfenster wird an Application- und DB-Grenze geprüft. |
| D036 | `VERIFIED` | `tests/provisional-menu.integration.mjs`, `data/mcello/menu-seed.provisional.json` | 97 Positionen deterministisch importiert; Provenienz bleibt erhalten; `owner_confirmed=false`; sensible Positionen bleiben online deaktiviert. |
| D021 | `VERIFIED` | `tests/modifier-backoffice.integration.mjs`, `tests/allergen-labels.integration.mjs`, `tests/ordering-schedule.integration.mjs`, `tests/realtime-ready.integration.mjs` | Staff kann operative Daten sehen/steuern, aber keine strukturellen Menu-/Label-/Schedule-Schreiboperationen ausführen. |
| D031 | `VERIFIED` | `tests/editorial-homepage.integration.mjs` | Admin kann kontrollierte Homepage-Sektionen ein-/ausblenden und sortieren; Public Snapshot enthält nur aktive Module. |
| D032 | `VERIFIED` | `tests/editorial-homepage.integration.mjs` | News/Event-Publishing mit Draft/Published, Sichtbarkeitsfenstern, Eventzeit und Pinning ist DB-integriert. |
| D022 + D023 (Role enforcement acceptance) | `VERIFIED` | RLS-/RPC-Migrationen, `tests/realtime-ready.integration.mjs`, Backoffice-Integrationen | Rollen werden server-/datenbankseitig erzwungen; Browserrollen sind nicht die Autoritätsgrenze. |
| D064 (Development OTP) | `VERIFIED` | `packages/notifications/src/dev-otp.ts`, `apps/mcello/server.mjs` | Development-OTP sendet keine externe Nachricht und braucht keinen bezahlten Provider; Startpfad fordert WhatsApp primär/SMS Fallback an. |
| D060 | `VERIFIED` | `apps/mcello/public/manifest.webmanifest`, `apps/mcello/public/sw.js`, `apps/mcello/public/icons/pwa-192.png`, `apps/mcello/public/icons/pwa-512.png`, `tests/pwa-installability.test.mjs` | Vollständiger Install-Contract mit echten 192/512-PNGs und maskable-safe Preview-Icon. Service Worker hält nur den öffentlichen App-Shell offline; API/REST/Auth/Storage, Mutationen, KDS und Statusdaten bleiben fail-closed/network-only. Das Preview-`M` ist kein freigegebenes finales Mcello-Logo. |
| D030 | `VERIFIED` | `apps/mcello/public/index.html`, `tests/public-navigation.test.mjs`, `tests/public-navigation.browser.mjs`, `.github/workflows/ci.yml` | Desktop und Mobile bieten dieselben sechs bindenden Public-Ziele sowie einen betonten direkten Order-CTA. Mobile nutzt eine zugängliche native Navigation mit Escape-/Focus-Verhalten und Skip-Link. Chromium rendert 1440×1000 und 390×844 in CI und beweist Sichtbarkeit, Navigation, CTA-Ziel und fehlenden horizontalen Overflow. |
| D058 | `VERIFIED` | `apps/mcello/public/motion.css`, `apps/mcello/public/motion.js`, `tests/showcase-motion.test.mjs`, `tests/showcase-motion.browser.mjs`, `.github/workflows/ci.yml` | Zurückhaltende Reveal-/Hover-Motion nutzt nur Opacity/Transform und keine Endlosschleifen oder layout-treibenden Übergänge. Chromium beweist normale Progressive-Reveals sowie einen vollständig sichtbaren/statischen `prefers-reduced-motion: reduce`-Pfad; PWA-Shell cached den Motion-Layer mit. |
| D024 (homepage composition) | `VERIFIED` | `apps/mcello/public/index.html`, `apps/mcello/public/homepage-composition.js`, `apps/mcello/public/public-content.js`, `tests/homepage-composition.test.mjs`, `tests/homepage-composition.browser.mjs` | Hero, Kategorie-Highlights/Quick-Order, Sticky Order-CTA, Community/News/Events und Story/Team-Slot sind als zusammenhängender Public-Flow abgenommen. Highlights sind deterministisch und behaupten keine Popularität; einfache Produkte delegieren an den bestehenden Cart-Pfad, konfigurierbare an den bestehenden Konfigurator. Der Team-Slot bleibt ohne erfundene Namen/Biografie. Reale Mcello-Medien und persönliche Story bleiben D025/D026. |
| D063 (local backend) | `VERIFIED` | `supabase/config.toml`, `.github/workflows/supabase-integration.yml`, lokale Dev-Skripte | Vollständiger Backend-Rebuild läuft mit Supabase CLI/Docker ohne Managed-Supabase-Projekt. |
| D063 (no Lovable/Vercel runtime dependency) | `VERIFIED` | Root `package.json`, `apps/*`, GitHub Actions | Build, Tests und lokale Runtime funktionieren aus Git/Node/Supabase; Lovable/Vercel sind keine notwendige Runtime. |
| D063 (self-host release path) | `VERIFIED` | `infra/selfhost/Dockerfile`, `infra/selfhost/container-entrypoint.mjs`, `infra/selfhost/compose.app.yml`, `infra/selfhost/preflight.sh`, `infra/selfhost/apply-migrations.sh`, `.github/workflows/selfhost-release.yml`, `.github/workflows/selfhost-db-drill.yml` | Git baut einen non-root/read-only App-Container hinter Host-Loopback; Preflight erzwingt HTTPS/Secrets/sauberen Git-Stand. Der isolierte DB-Drill baut alle Migrationen neu und beweist den direkten `supabase db push --db-url ... --dry-run` Self-host-Pfad. |
| D063 (production hardening/restore) | `VERIFIED` | `infra/selfhost/README.md`, `infra/selfhost/backup-db.sh`, `infra/selfhost/restore-drill.sh`, `infra/selfhost/healthcheck.sh`, `tests/selfhost-backup-restore.integration.sh` | Runbook deckt TLS, Gateway/Firewall, Secrets, gepinnten Supabase-Upstream, Backup-Retention/Off-host-Kopie und Monitoring ab. CI führt einen echten `pg_dump -> DROP -> pg_restore -> Sentinel` Roundtrip aus; Restore-Script ist destruktiv abgesichert und prüft `public.orders`. |

## Teilweise erfüllt — Haken bleiben bewusst offen

| Decision | Status | Bereits vorhanden | Fehlender bindender Teil |
|---|---|---|---|
| D003 | `PARTIAL` | Provider-neutraler OTP-Contract; Start fordert `whatsapp` primär und `sms` als Fallback an; lokaler OTP-Provider ist getestet. | Echte freigegebene Production-Transporte für WhatsApp + SMS sind noch nicht aktiviert. D064 verbietet stille Providerkosten. |
| D037 + D044 + D052 | `PARTIAL` | Closed/Pause/Cutoff lässt Browsen/Konfigurieren/Warenkorb zu und blockiert Submit; Öffnungsplan, Overrides und Cutoff sind DB-getestet. | D037 verlangt zusätzlich sichtbare Telefon-/WhatsApp-Fallback-Kontakte; first-party bestätigte Kontaktdaten sind noch nicht verdrahtet. |
| D015 | `PARTIAL` | Token-Statusseite mit Progress, Bestellnummer, Summary und ETA ist vorhanden. | Verifizierte Pickup-Adresse fehlt im Statusvertrag/UI. Keine Geschäftsadresse darf erfunden werden. |
| D016 | `PARTIAL` | Notification-Outbox kennt received/accepted/delayed/ready/rejected/cancelled und Statuslinks; Lifecycle/Lease sind DB-getestet. | Freigegebener WhatsApp/SMS-Production-Transport fehlt weiterhin. |
| D017 | `OPEN` | Statusseite vorhanden. | Route- und Call-Actions benötigen bestätigte Adresse/Telefonnummer. |
| D020 | `PARTIAL` | Admin kann Produkte/Preise, Modifier/Extras, Labels, Recommendations, Schedules, Editorial und Media strukturell verwalten. | Vor dem Haken wird der gesamte Admin-UI-Flow noch einmal als zusammenhängende Acceptance geprüft, inklusive bestätigtem Media-/Owner-Workflow. |
| D007 + D008 | `PARTIAL` | Sticky Kategorie-Navigation, Produktkonfigurator, zentrale Modifier-Gruppen, Größenvarianten und bezahlte Extras sind vorhanden. | Vollständige owner-bestätigte Mcello Ingredient-/Sauce-Standardkonfiguration ist wegen provisional seed noch nicht freigegeben. |

## Bewusst offen — Public/Go-live/Design

Diese Punkte werden nicht durch Backend-Fortschritt voreilig geschlossen:

- D001/D029 — finales Modern-Warm-Premium Designsystem
- D025/D026 — echte Mcello-Medien/Bildrechte und persönliche Owner-/Team-Story aus bestätigten First-Party-Inhalten
- D015/D017 — Pickup-Adresse, Route und Call erst mit bestätigten first-party Kontaktdaten
- D036 ist technisch verifiziert, aber der **Go-live** bleibt trotzdem durch `owner_confirmed=false` der provisional Inhalte blockiert

## Prepared-now Grenzen

| Decision | Status | Nachweis |
|---|---|---|
| D004 | `PREPARED` | `packages/payments`, Checkout Policy, DB Payment Constraint, PR #7 |
| D006 | `PREPARED` | DeliveryZoneResolver, PickupOnly Policy, DB Pickup Constraint, PR #9 |
| D027 | `PREPARED` | `web|counter|table` Contract, web-only V1, immutable source, PR #8 |
| D040 | `PREPARED` | Effort metadata + authoritative immutable Order-Item-Snapshot, V1 count-based, PR #8 |
| D047 + D050 | `PREPARED` | Recommendation/analytics event persistence and integration tests |
| D057 | `PREPARED` | SingleLocationContext + DB cross-location invariants, PR #6 |

## Nächste echte Produktlücken

Nach dieser Reconciliation sollen keine bereits vorhandenen Features erneut gebaut werden. Die kleinsten klaren V1-Lücken sind:

1. D003/D016 — erst nach expliziter Freigabe eines unvermeidbaren Messaging-Providers/Carrier-Kosten Production-Transport aktivieren.
2. D015/D017 — bestätigte Adresse/Telefonnummer einpflegen, danach Status-Route/Call vervollständigen.
3. D020/D007/D008 — Admin-/Menu-Gesamtabnahme nach owner-bestätigtem Produkt-/Ingredient-/Media-Datensatz.
4. D001 — technisches Modern-Warm-Premium Designsystem kann unabhängig gehärtet werden; D029 Recognition bleibt bis zum freigegebenen Original-Logo offen.
5. D025/D026 — echte Mcello-Medien und persönliche Story erst nach First-Party-Freigabe.