# Roadmap — Doener / Mcello V1

Stand: 2026-08-18

Diese Roadmap ist eine Arbeitsreihenfolge. Bindend bleibt das Decision Ledger. Ein offener Acceptance-Haken bedeutet nicht automatisch fehlende Architektur; vorhandene Implementierung wird gegen Tests und `V1_EVIDENCE.md` abgeglichen, bevor etwas neu gebaut oder als fertig markiert wird.

## Kurzfristige Priorität — stabile Mcello-Demo-Basis

Die erste Mcello-Vorstellungsbasis vom 2026-08-18 bleibt als technischer Referenzflow erhalten. Ziel ist kein vorgetäuschter Production-Go-live, sondern ein stabiler, ehrlicher und zusammenhängender Demo-Flow mit grünen Browser-/Integrationsgates.

Kanonischer Demo-Ablauf: `Homepage → Speisekarte/Konfigurator → Warenkorb/Pickup → WhatsApp-Key → Bestellung empfangen → KDS akzeptieren/Status ändern → Live-Status → optional Admin/CMS`.

Der Windows-LAN-/Hotspot-Hardening-Slice aus PR #51 ist in `main` integriert. Die Design-Rebaseline startet auf Merge-SHA `0952f97474c40f9589388e8a589d61ac76a89822`.

## Neue kurzfristige Priorität — Mcello Design Rebaseline / BUILD YOUR MCELLO

Die technische V1-Basis wird **nicht neu gebaut**. Der nächste Produktfokus ist die visuelle und interaktive Qualität von Public Experience, Store und Configurator.

Kanonische Detailquellen:

- `docs/projects/mcello/DESIGN_MASTERPLAN.md`
- `docs/projects/mcello/DESIGN_ACCEPTANCE.md`
- `docs/projects/mcello/USER_JOURNEYS.md`

Neue bindende Decisions D065-D070:

- **D065 Interactive Food Builder** — strukturierte Konfiguration wird sichtbar im `FoodStage`; Domain/Server bleiben Preis-/Verfügbarkeitsautorität.
- **D066 Mcello Originals** — `Genau so` + vorbefülltes `Anpassen` statt leerer Pflicht-Leinwand.
- **D067 Experience Modes** — Public cinematic/brand-first, Store zunehmend app-like/commerce-first.
- **D068 Visual Content Integrity** — keine generierten/stilisierten Bilder als angeblich dokumentarisch echte Mcello-Produkte.
- **D069 Visual Acceptance Gates** — echte Screenshots + Owner-Gates ergänzen technische Tests.
- **D070 Design Tool Boundary** — Adobe/Figma/Canva/Lovable sind optionale Clients, keine Runtime-Pflicht.

Geplante Slice-Reihenfolge:

1. Design Rebaseline / Decisions / Acceptance / Journeys
2. Brand System + Art Direction
3. Homepage V2
4. Store V2
5. Builder Core
6. Pizza Builder
7. Döner/Yufka Builder
8. Cart/Checkout/Status Polish
9. KDS/Admin Visual Reconciliation
10. Real Assets / Owner Inputs
11. Visual/Responsive/Accessibility/Performance Release Gates

## P0 — PREPARE_NOW-Plattformgrenzen abgeschlossen

- [x] D004 Payment Boundary — V1 pay-on-site; Online-Payment provider-neutral vorbereitet.
- [x] D006 Delivery Boundary — PLZ/Radius-Vertrag vorbereitet; Mcello V1 Application + DB hart Pickup-only.
- [x] D027 Order Source Boundary — `web | counter | table` vorbereitet; Mcello V1 web-only.
- [x] D040 Capacity Effort Boundary — Effort-Snapshots vorbereitet; V1 weiterhin count-basiert.
- [x] D047/D050 Recommendation-/Analytics-Datenbasis.
- [x] D057 Location Boundary — Single-Location-App mit wiederverwendbarer Location-Grenze.
- [x] Keine dieser Arbeiten hat Production deployed oder mutiert.

## P1 — Verifizierte V1-Engineering-Basis

Kanonische Detail-Evidenz: `docs/projects/mcello/V1_EVIDENCE.md`

### Ordering / KDS / Operations

- [x] D002 — eigenes unabhängiges First-Party-Bestellsystem.
- [x] D005/D009 — Pickup ASAP + Vorbestellslots.
- [x] D039 — atomare 15-Minuten-Slot-Kapazität.
- [x] D038 — Cart-Persistenz + serverseitige Revalidation.
- [x] D018/D048 — minimaler Checkout + freie Hinweise.
- [x] D042 — bindend erst bei KDS-Akzeptanz.
- [x] D043 — Edit/Cancel nur pre-accept; danach DB-seitig gesperrt.
- [x] D010/D011 — KDS Accept/Preparing/Ready/Completed + Quick-Reject.
- [x] D012/D013 — Rush/Pause + Produkt-/Modifier-/Zutaten-Snooze.
- [x] D014/D049 — Alarm + Multi-Device-Realtime.
- [x] D053 — konfigurierbarer Acceptance Timeout.
- [x] D054/D055/D056 — ETA, Geplant-Lane, Preparation Lead, Delay Controls + Outbox.
- [x] D044 — Zeitplan-basierter Shop-State mit Admin-only Force-Open und operativen Overrides.
- [x] D052 — admin-konfigurierbarer Cutoff vor Schließung.

### Menu / Admin / CMS

- [x] D020 — vollständige technische Admin-Katalog-Control-Plane: Kategorien, Produkte, Beschreibungen, Preise, Produktbilder und wiederverwendbare Zutaten-/Saucen-/Extra-Gruppen.
- [x] D021 — Staff operational-only; keine strukturellen Katalog-/Preis-/Media-Mutationen.
- [x] D035 — Sold-out sichtbar aber disabled.
- [x] D045 — strukturierte Allergene / Dietary Labels.
- [x] D046 — Curated/rule-based Cross-Sells.
- [x] D051 — zeitgesteuerte Verfügbarkeit.
- [x] D031/D032/D033 — Homepage-Sektionen, News/Event Scheduling und Galerie-Control-Plane.
- [x] D036 — provisional Seed + Provenienz + `owner_confirmed`-Grenze.

### Public / Brand / PWA

- [x] D001 — Modern-Warm-Premium Designsystem technisch VERIFIED.
- [x] D024 — Hero, Quick-Order, Community/News/Events und Story/Team-Slot als Homepage-Composition.
- [x] D030 — Desktop-/Mobile-Navigation + betonter Order-CTA mit Chromium-QA.
- [x] D058 — Showcase-Motion + harte `prefers-reduced-motion`-Grenze.
- [x] D059 — Public-Tonalität ruhig/premium + warm/persönlich.
- [x] D060 — installierbare PWA mit fail-closed/network-only Business-APIs.

### Architektur / Security / Release

- [x] D022 — dokumentierte Lebtig-Wiederverwendung über Shared Packages ohne App-zu-App-Kopplung.
- [x] D023 — D-ready wiederverwendbare Workspace-/Core-Grenzen.
- [x] D062 — CI erzwingt Coverage aller D001–D070 Decisions und Statusdisziplin.
- [x] D063 — lokaler Supabase-CLI/Docker-Backendpfad.
- [x] D063 — reproduzierbarer Self-host-Releasepfad ohne Lovable-/Vercel-Runtime-Zwang.
- [x] D063 — non-root/read-only App-Container, Migration-Dry-Run, Backup/Restore-Drill, TLS/Secrets/Firewall/Monitoring-Runbook.
- [x] D064 — Development-OTP ohne Paid Provider + Production Spend/Runtime Guard; Mcello V1 ist WhatsApp-only und verweigert SMS-Konfiguration.

## P2 — Design Rebaseline / Product Experience

### Rebaseline

- [x] D065-D070 im Decision Ledger ergänzt.
- [x] Decision-Coverage-Guard auf D001-D070 erweitert.
- [x] Design-Masterplan angelegt.
- [x] Design-Acceptance angelegt.
- [x] Customer-/Operator-Journeys angelegt.
- [ ] Rebaseline-PR vollständig grün und gemerged.

### Art Direction / Brand

- [ ] Drei echte Art Directions erarbeiten.
- [ ] Brand-/Photography-System festlegen.
- [ ] Web-taugliches Type-Pairing festlegen.
- [ ] Owner Visual Gate A/B.

### Homepage / Store

- [ ] Homepage V2 Desktop + Mobile.
- [ ] Store V2 Mobile-first + Desktop.
- [ ] Public Experience vs Commerce Mode nachweisen (`D067`).
- [ ] Owner Visual Gate C/D.

### Interactive Builder

- [ ] `FoodStage`/Builder-Core über bestehende Menu-/Modifier-Engine (`D065`).
- [ ] `Genau so` / vorbefülltes `Anpassen` (`D066`).
- [ ] Pizza Builder.
- [ ] Döner/Yufka Builder.
- [ ] Tap-only + Accessibility + Reduced Motion.
- [ ] Owner Visual Gate E.

### Flow Polish

- [ ] Cart/Checkout/Status visuell überarbeiten, ohne V1-Domainverträge zu ändern.
- [ ] KDS/Admin visuell reconciliieren.
- [ ] Owner Visual Gate F/G.

### Visual Quality Gates

- [ ] Pflicht-Screenshotset aus `DESIGN_ACCEPTANCE.md`.
- [ ] Responsive-Matrix.
- [ ] Accessibility-Gates.
- [ ] Performance-Ziele LCP/INP/CLS.
- [ ] Visual Content Integrity (`D068`).
- [ ] Tool-/Runtime-Grenze (`D070`).

## P3 — Verbleibende V1-Blocker: echte Inputs/Freigaben

Operative Quelle: [`V1-GO-LIVE-INPUTS.md`](./V1-GO-LIVE-INPUTS.md)

1. **D003/D016 — Production Messaging**
   - Mcello V1 ist WhatsApp-only: Verifikations-Key/Code, Statuslink/-updates und Ready-Nachricht laufen ausschließlich über WhatsApp.
   - Kein SMS-Fallback in V1.
   - Aktivierung eines realen WhatsApp-Transports erst nach expliziter Provider-/Carrier-Kostenfreigabe.

2. **D015/D017/D037 — Kontakt, Pickup-Adresse, Route, Call und Closed-Fallback**
   - Status-/Closed-UI technisch vorhanden.
   - Es fehlen bestätigte First-Party-Adresse/Telefon/WhatsApp-Daten.

3. **D007/D008/D065/D066 + D036 Go-live — reale Menü-/Ingredient-/Sauce-Daten**
   - Admin/Konfigurator/Modifier-Engine sind vorhanden.
   - Builder-Visualisierung darf auf provisional/stilisierten Daten entwickelt werden, aber reale Standardrezepte/Layers benötigen Owner-Bestätigung.
   - Der provisional Seed muss vom Betrieb produktweise bestätigt/ergänzt werden.

4. **D029 — finales Logo / Recognition**
   - D001-Designsystem ist vorhanden.
   - Original-Asset und offizielle Varianten müssen geliefert/freigegeben werden.

5. **D025/D026/D068 — reale Medien / Owner-/Team-Story**
   - Media-/CMS-/Homepage-Struktur ist vorhanden.
   - Es fehlen echte freigegebene Fotos, Rechte und bestätigte Story-Fakten.

## P4 — Owner-Input-Integration

Sobald die jeweiligen Inputs vorliegen, wird **nicht neu gebaut**, sondern der vorhandene Pfad vervollständigt:

`First-Party-Input → Content-Integrity-Prüfung → Admin/Import/Secrets → Integration-/Browser-QA → Acceptance/Evidence → PR → Merge`

Priorität:
1. Kontakt-/Adressdaten, weil sie D015/D017/D037 gleichzeitig entsperren.
2. Menü-/Ingredient-/Sauce-Bestätigung, weil sie den realen Ordering-/Builder-Go-live entsperrt.
3. Logo + echte Medien/Story für finale Brand-/Venue-Abnahme.
4. Paid WhatsApp Messaging erst nach expliziter Kostenfreigabe.

## P5 — Go-live Hardening

Die technische Release-Basis ist bereits automatisiert; vor echtem Production-Go-live bleibt eine finale Abnahme mit realen Daten:

- [ ] owner-bestätigte Menü-/Preis-/Ingredient-Daten
- [ ] bestätigte Öffnungszeiten/Sonderzeiten/Cutoff/Kapazität/Rush-Werte
- [ ] bestätigte Adresse/Telefon/WhatsApp-Fallback
- [ ] finales Logo + reale Media-Rechte
- [ ] Production WhatsApp Messaging nur bei expliziter Freigabe
- [ ] Auth/RLS-/Storage-Audit auf finalem Datenstand
- [ ] Secrets-/Environment-Audit
- [ ] leerer DB-Rebuild aus finalen Migrationen
- [ ] Self-host Migration-Dry-Run + Backup/Restore-Drill
- [ ] Browser-/PWA-/Mobile-Smokes
- [ ] Design-/Visual-Gates D065-D070 abgeschlossen
- [ ] SEO/Metadata/Content-Integrity
- [ ] Rollback-Check
- [ ] **explizite Production-Freigabe**

## Merge-Regel

Kein Baustein wird aufgrund einer Agenten-Zusammenfassung gemerged. Maßgeblich sind Diff, Tests, Integrationsworkflow und Review. Bei visuellen Slices kommen die definierten Screenshot-/Owner-Gates hinzu. Production bleibt ein separater, ausdrücklich freizugebender Schritt.
