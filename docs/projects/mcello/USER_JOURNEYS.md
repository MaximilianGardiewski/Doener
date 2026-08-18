# Mcello — User Journeys

Stand: 2026-08-18

Diese Datei verbindet bestätigte Produktentscheidungen mit der kommenden Design- und Builder-Umsetzung. Screens und Komponenten sollen aus diesen Journeys entstehen.

## J1 — Public Browse

**Ziel:** Mcello entdecken, ohne bestellen zu müssen.

`Homepage → Signature Food → Venue/Story → Aktuelles/Events/Galerie → Kontakt/Anfahrt`

Erwartung:
- Bestellung bleibt jederzeit klar erreichbar;
- Atmosphäre darf dominant sein, aber Kerninformationen nicht verstecken;
- keine ungeprüften Business-Fakten.

## J2 — Schnell bestellen

**Ziel:** Wiederkehrender/entschlossener Kunde kommt schnell zum Produkt.

`Homepage/Store → Kategorie → Produkt → Standard/Genau so → Cart → Pickup → Kontakt → WhatsApp-Verifikation → Submit`

Erwartung:
- wenig Schritte;
- Standardrezept kann ohne Builder-Tiefgang übernommen werden;
- Preis und Verfügbarkeit sind klar.

## J3 — BUILD YOUR MCELLO

**Ziel:** Kunde individualisiert sein Essen und sieht die Änderungen unmittelbar.

`Store → Signature/Produkt → Anpassen → FoodStage + BuilderSteps → Live-Preis → Add to Cart`

Erwartung:
- Tap-first;
- visuelles Feedback pro Auswahl;
- Drag & Drop optional;
- visuelle Layer sind nicht fachliche Preisautorität;
- Accessibility funktioniert auch ohne Visualisierung.

## J4 — Mcello Original

**Ziel:** Bestehendes Gericht als vertrauenswürdigen Ausgangspunkt verwenden.

`Produkt → "So macht Mcello sie" → Genau so | Anpassen`

Bei `Anpassen`:
- Builder startet vorbefüllt;
- Änderungen sind transparent;
- keine leere Leinwand als Pflicht.

## J5 — Pizza Builder

`Pizza → Basis/Größe → Sauce/Käse → Belag → Extras → Cart`

Erwartung:
- Top-View FoodStage;
- Toppings erscheinen/verschwinden sichtbar;
- deterministische Visualisierung für Tests;
- performante Layer.

## J6 — Döner/Yufka Builder

`Döner/Yufka → Form/Basis → Herzstück → Frisch → Sauce → Extras → Cart`

Erwartung:
- Theken-ähnlicher mentaler Flow;
- nur zulässige Produktoptionen;
- Standardzutaten leicht entfernbar;
- paid Extras klar bepreist.

## J7 — Shop geschlossen

`Store → Browse/Configure → Cart lokal persistieren → Submit blockiert → später zurückkehren → Revalidation → Pickup/Submit`

Erwartung:
- Kunde darf stöbern und konfigurieren;
- Submit bleibt fachlich gesperrt;
- Preis/Verfügbarkeit werden vor späterem Submit neu geprüft;
- Fallback-Kontakte nur mit bestätigten Daten.

## J8 — Pickup ASAP

`Cart → Pickup → ASAP → verfügbarer Zielzeitraum → Checkout`

Erwartung:
- echte Capacity/Cutoff/Shop-State-Logik;
- keine UI-erfundene ETA.

## J9 — Pickup später

`Cart → Pickup → später → verfügbare 15-Minuten-Slots → Checkout`

Erwartung:
- nur serverseitig zulässige Slots;
- Full/closed/cutoff sauber dargestellt.

## J10 — WhatsApp Verification

`Checkout → WhatsApp-Code anfordern → Code eingeben → verifizieren → Bestellung absenden`

V1:
- ausschließlich WhatsApp;
- kein SMS-Fallback;
- lokale Demo zeigt DEV-Code transparent statt echte Nachricht zu simulieren.

## J11 — Waiting for Acceptance

`Submit → Statusseite "Empfangen" → optional Edit/Cancel → Mcello reagiert`

Erwartung:
- Bestellung ist noch nicht bindend;
- Edit/Cancel verfügbar;
- Acceptance Timeout und Auto-Reject bleiben fachlich wirksam.

## J12 — Accepted / Preparing

`KDS Accept + Zielzeit → Kunde sieht In Zubereitung + Uhrzeit + Countdown`

Erwartung:
- ab Acceptance keine Website-Änderung mehr;
- Änderungen nur über bestätigte Kontaktwege;
- KDS und Kundenstatus bleiben realtime-synchron.

## J13 — Delay

`KDS +5/+10/+15/custom → neue ETA → Status aktualisiert → Notification Outbox`

Erwartung:
- Delay ist sichtbar und verständlich;
- keine widersprüchlichen Zeitangaben.

## J14 — Ready / Completed

`KDS Ready → Kunde sieht Abholbereit → Abholung → KDS Completed → Kunde sieht Abgeholt`

Erwartung:
- Ready ist visuell deutlich;
- finale Statuskommunikation bleibt WhatsApp-only in V1.

## J15 — KDS New Order

`Alarm → Order Card → Accept mit ETA/Slot | Quick Reject`

Erwartung:
- Alarm bleibt aktiv bis Handling;
- Handling synchronisiert mehrere Geräte;
- Reject verwendet definierte Gründe.

## J16 — KDS Scheduled Order

`Geplant → Preparation Lead erreicht → aktive Lane → Accept/Preparing → Ready`

Erwartung:
- Future Orders überladen nicht die aktive Queue;
- Lead-Time bleibt konfigurierbar.

## J17 — KDS Rush / Pause / Snooze

`Staff → Rush/Pause oder Product/Ingredient Snooze → Public Store aktualisiert`

Erwartung:
- Staff darf operative Zustände ändern;
- keine strukturellen Katalog-/Preis-/Media-Rechte.

## J18 — Admin Catalog

`Admin → Kategorie/Produkt → Beschreibung/Preis/Media/Modifier → Speichern → Public/Store`

Erwartung:
- rights-aware Media;
- serverseitige Validierung;
- Staff ausgeschlossen.

## J19 — Admin CMS

`Admin/zulässige Rolle → Homepage/News/Events/Galerie → Preview → Publish/Schedule`

Erwartung:
- kontrollierte Sektionen statt freiem Page Builder;
- Public Content Integrity vor Production.

## J20 — Owner Input Integration

`First-Party-Input → Provenienz/Rechte prüfen → Admin/Import/Secrets → Integration QA → Acceptance/Evidence → PR → Merge`

Verwendet für:
- Kontakt/Adresse;
- Menü/Zutaten/Saucen/Extras;
- Logo;
- Fotos;
- Team/Story;
- Production Messaging Provider.

## J21 — Production Release

`Finale Daten → Security/Secrets/DB Audit → Self-host Dry Run → Backup/Restore → Browser/PWA/Mobile QA → Rollback Check → explizite Production-Freigabe`

Ohne separate Freigabe endet die Journey vor Production-Mutation.
