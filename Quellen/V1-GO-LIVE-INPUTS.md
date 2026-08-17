# Mcello V1 — Go-live Inputs & externe Blocker

Stand: 2026-08-18

Dieses Dokument ist der operative Übergabepunkt für die **noch fehlenden echten Mcello-/Owner-Daten und Freigaben**. Es ersetzt weder `docs/projects/mcello/DECISIONS.md` noch `ACCEPTANCE.md` oder `V1_EVIDENCE.md`.

## Grundregel

Die technische V1-Basis ist weitgehend implementiert und getestet. Die folgenden Punkte dürfen **nicht** durch erfundene, ungeprüfte oder nur aus Drittquellen übernommene Angaben geschlossen werden. Erst bestätigte First-Party-Daten bzw. eine explizite Kosten-/Providerfreigabe dürfen in Production-relevante Konfiguration übernommen werden.

## 1. Kontakt, Adresse und Anfahrt

**Benötigt**
- offizielle Abhol-/Geschäftsadresse
- veröffentlichbare Telefonnummer
- veröffentlichbare WhatsApp-Kontaktroute, falls von der Telefonnummer abweichend
- optional bestätigter Google-Maps-Zielpunkt/Place-Link

**Entsperrt**
- `D037` — sichtbarer Telefon-/WhatsApp-Fallback bei geschlossenem Shop
- `D015` — Pickup-Adresse auf der Live-Statusseite
- `D017` — Route- und Call-Actions

**Nicht tun**
- keine Adresse/Telefonnummer aus einer Suchmaschine ungeprüft als Production-Wahrheit übernehmen
- keine Testnummer oder Platzhalteradresse veröffentlichen

## 2. WhatsApp-/SMS-Production-Transport

**Benötigt**
- explizite Owner-Freigabe, dass unvermeidbare Carrier-/Providerkosten akzeptiert werden
- gewählter bzw. freigegebener WhatsApp-Transport
- gewählter bzw. freigegebener SMS-Fallback
- Absender-/Business-Verifikation und notwendige Credentials ausschließlich als Secrets

**Entsperrt**
- `D003` — WhatsApp OTP primary + SMS fallback
- `D016` — Status-/Ready-Benachrichtigungen über WhatsApp/SMS

**Sicherheitsgrenze**
- `D064` ist VERIFIED: Ohne ausdrückliche Freigabe darf kein Paid Provider still aktiviert werden.
- Production-Checkout bleibt bis zur realen Messaging-Konfiguration fail-closed.
- Keine Provider-Secrets in Git oder Browsercode.

## 3. Menü, Preise, Zutaten, Saucen und Extras

**Benötigt pro Produkt**
- finaler Name
- finaler Preis / Größenvarianten
- veröffentlichbare Beschreibung
- Standardzutaten
- abwählbare Zutaten
- Saucen und Auswahlregeln
- bezahlte Extras + Preisaufschläge
- relevante Allergene / freiwillige Labels
- Online-Bestellbarkeit
- ggf. zeitliche Verfügbarkeit

**Entsperrt**
- `D007` / `D008` — owner-bestätigte reale Mcello-Konfiguration
- Go-live-Freigabe der bislang provisional importierten Inhalte (`D036` bleibt technisch VERIFIED, aber `owner_confirmed=false` blockiert die ungeprüften Inhalte)

**Technischer Stand**
- `D020` ist VERIFIED: Admin kann Kategorien, Produkte, Beschreibungen, Preise, Produktbilder sowie wiederverwendbare Zutaten-/Saucen-/Extra-Gruppen verwalten.
- Die fehlende Arbeit ist daher primär **Datenbestätigung**, nicht ein neuer Katalog-/Admin-Neubau.

## 4. Logo / Recognition Asset

**Benötigt**
- freigegebenes originales Mcello-Logo/Recognition-Asset, idealerweise SVG oder hochauflösendes PNG
- Bestätigung, welche Varianten offiziell verwendet werden dürfen
- falls vorhanden: bestehende Markenfarben bzw. verbindliche Grün-/Sekundärfarbe

**Entsperrt**
- `D029` — bestehende Recognition in das bereits VERIFIED Modern-Warm-Premium-System überführen

**Technischer Stand**
- `D001` ist VERIFIED: Anthrazit, warmes Off-White, Amber/Gold und selektives Grün sind als semantisches Designsystem implementiert.
- Das aktuelle technische Preview-`M` ist ausdrücklich **kein** finales Logo.

## 5. Echte Mcello-Medien, Team und Story

**Benötigt**
- freigegebene echte Fotos: Food, Lokal, Team, Events, ggf. Terrasse/Bistro/Juice-Angebot
- Rechte-/Lizenzbestätigung je Asset
- Alt-Text bzw. inhaltliche Beschreibung
- bestätigte Namen/Rollen von Owner/Team, falls öffentlich gewünscht
- bestätigte Story/Fakten zu Betrieb, Atmosphäre, Handwerk, Community und Events

**Entsperrt**
- `D025` / `D026`
- finale reale Medienebene für Homepage/Galerie

**Technischer Stand**
- rights-aware privater Media-Workflow, Galerie und Produktbilder sind vorhanden.
- Public-Auslieferung von Produktbildern setzt bestätigte Rechte + Alt-Text voraus.
- Keine künstlich erzeugten Bilder dürfen als dokumentarisch echte Mcello-Fotos ausgegeben werden.

## 6. Betriebliche Go-live-Parameter

Diese Punkte sind technisch konfigurierbar, müssen vor Production aber vom Betrieb bestätigt werden:
- reguläre Öffnungszeiten
- Sonder-/Feiertagszeiten
- Bestell-Cutoff
- Pickup-Slot-Kapazität
- Preparation Lead
- Acceptance Timeout
- Rush-Puffer
- gewünschte Operator-/Closed-Hinweise

Die technischen Grenzen (`D039`, `D044`, `D052`, `D053`, `D055`) sind bereits VERIFIED. Hier fehlt keine neue Architektur, sondern reale Betriebsfreigabe.

## Übergabeformat

Owner-/Betriebsdaten sollen möglichst in einer nachvollziehbaren Quelle landen, z. B.:
- freigegebene Datei im Repo-/Projekt-Inputbereich
- vom Owner bestätigter Export/Spreadsheet
- freigegebene Originalassets
- dokumentierte explizite Provider-/Kostenfreigabe

Danach gilt weiterhin:

`Input prüfen → Admin/Import/Config anwenden → Integration/Content-Integrity-QA → Acceptance/Evidence aktualisieren → PR → grüne Gates → Merge → separate Production-Freigabe`

## Was ein nächster Worker nicht tun soll

- D020, D044, D052, PWA, Self-host oder KDS erneut von Grund auf bauen.
- offene Haken mit erfundenen Business-Fakten schließen.
- einen Messaging-Provider aus Bequemlichkeit aktivieren.
- finales Branding ohne Original-Logo behaupten.
- Production deployen, nur weil die technischen Gates grün sind.
