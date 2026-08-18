# Mcello — First Presentation Runbook

Stand: 2026-08-18

Dieses Runbook ist für die erste Produktvorstellung gedacht. Es beschreibt eine **lokale, reproduzierbare Demo**, keinen Production-Go-live.

## Ein Befehl zum Start

Voraussetzungen: Node.js 22+, Docker Desktop bzw. Docker-kompatible Runtime und PowerShell 7.

Im Repo-Root:

```powershell
pwsh -NoProfile -File scripts/demo-mcello.ps1
```

Der Launcher:

1. baut den lokalen Supabase-Stack frisch aus den Repo-Migrationen auf,
2. importiert das vorläufige Mcello-Menü,
3. erzeugt zufällige lokale Admin-/KDS-Zugänge ausschließlich in `.env.local`,
4. startet die Mcello-Preview in einem eigenen PowerShell-Fenster,
5. wartet auf einen echten Healthcheck mit lokalem Supabase und KDS-Staff,
6. öffnet Kundenansicht und KDS automatisch.

Für einen bereits vorbereiteten Stack kann optional verwendet werden:

```powershell
pwsh -NoProfile -File scripts/demo-mcello.ps1 -ReuseLocalBackend
```

Ohne automatisches Browser-Öffnen:

```powershell
pwsh -NoProfile -File scripts/demo-mcello.ps1 -NoBrowser
```

## URLs

- Kunde: `http://127.0.0.1:4173/`
- KDS: `http://127.0.0.1:4173/kds.html`
- Betrieb: `http://127.0.0.1:4173/ops.html`
- Admin: `http://127.0.0.1:4173/admin.html`

## Empfohlene Vorführreihenfolge

### 1. Marke und Homepage

Kurz zeigen:

- modernes warmes Mcello-Design,
- klare Navigation,
- Speisekarte als zentraler Conversion-Punkt,
- PWA-/Web-App-Ansatz,
- Community-/News-/Galerie-Struktur als vorbereitete Content-Flächen.

Nicht lange bei Platzhaltermedien bleiben. Echte Mcello-Fotos und finales Logo sind weiterhin First-Party-Go-live-Inputs.

### 2. Speisekarte und Konfigurator

Ein Produkt auswählen und zeigen:

- Kategorien,
- Varianten/Modifier,
- strukturierte Zutaten-/Extra-Logik,
- Warenkorb,
- serverseitige Preis- und Verfügbarkeitsprüfung.

Das importierte Menü ist weiterhin als provisional markiert. Nicht behaupten, dass alle Positionen/Inhalte bereits final vom Betreiber bestätigt sind.

### 3. Abholung

Zeigen:

- ASAP oder Vorbestellslot,
- 15-Minuten-Kapazitätslogik,
- Öffnungs-/Pause-/Rush-/Cutoff-Grenzen.

Für die Präsentation setzt der lokale Testpfad den Shop kontrolliert offen. Das ist keine Production-Konfiguration.

### 4. WhatsApp-Key

Im Checkout:

- Vorname,
- Mobilnummer,
- optionale Notiz,
- Zahlung ausschließlich vor Ort — bar oder Karte,
- `WhatsApp-Code anfordern`.

**Mcello V1 ist WhatsApp-only. Es gibt keinen SMS-Fallback.**

In der lokalen Demo wird der einmalige DEV-Code direkt im Checkout eingeblendet. Dabei wird keine echte WhatsApp-Nachricht verschickt und kein bezahlter Provider verwendet. Ein realer Production-WhatsApp-Transport wird erst nach separater Provider-/Kostenfreigabe aktiviert.

### 5. Bestellung und KDS

Nach Absenden auf die KDS-Ansicht wechseln:

- neue Bestellung landet zunächst in `waiting_for_acceptance`,
- Bestellung ist erst mit Annahme durch den Betrieb bindend,
- 15/20/30-Minuten-Zielzeit demonstrieren,
- Status `In Zubereitung`,
- optional Delay,
- anschließend `Abholbereit`,
- danach `Erledigt`.

### 6. Kundenstatus

Zur Kundenstatusseite zurückwechseln und zeigen:

- Bestellnummer,
- Summary,
- Fortschritt,
- ETA,
- Statuswechsel nach KDS-Aktion,
- Edit/Cancel nur vor Annahme.

Die vollständige Kunde → WhatsApp-Key → Bestellung → KDS → Status-Kette ist als echter Chromium-/lokaler-Supabase-Gate in CI hinterlegt.

### 7. Optional: Admin/Betrieb

Nur wenn die Kernstory bereits sitzt:

- Produkte/Kategorien,
- Preise/Beschreibungen,
- Modifier-Struktur,
- Ausverkauft/Snooze,
- Öffnungszeiten/Overrides,
- CMS-/Medien-Grundlagen.

Der erste Pitch sollte nicht in Backoffice-Details versinken. Der stärkste Flow ist Kunde → Bestellung → Küche → Kunde.

## Was bereits belastbar gezeigt werden kann

- eigene first-party Bestellung ohne Marketplace-Abhängigkeit,
- Abholung + Vorbestellung,
- serverseitige Preis-/Verfügbarkeitsvalidierung,
- Kapazitätsgrenze,
- Pre-Accept Edit/Cancel,
- KDS-Lifecycle,
- Rush/Pause/Snooze,
- Live-/Realtime-Synchronisierung,
- Status + ETA,
- Zahlung vor Ort,
- PWA-Shell,
- provider-neutrale Architektur,
- WhatsApp-only-V1-Vertrag ohne SMS-Fallback,
- lokaler Supabase-/Self-host-Pfad ohne notwendige Lovable-/Vercel-Runtime.

## Was nicht als fertig behauptet werden soll

- kein Production-Go-live,
- kein realer WhatsApp-Provider aktiv,
- keine SMS-Kommunikation in V1,
- keine finale Geschäftsadresse/Telefonnummer, bis First-Party bestätigt,
- keine final freigegebenen Menü-/Zutaten-/Saucendaten, solange sie provisional sind,
- keine dokumentarisch echten Mcello-Fotos ohne freigegebene Originalmedien/Rechte,
- kein finales Mcello-Logo, solange das Original-Asset fehlt.

## Vor der Präsentation

Etwa 20–30 Minuten vorher:

1. Docker Desktop starten.
2. Repo auf aktuellen `main` bringen.
3. `pwsh -NoProfile -File scripts/demo-mcello.ps1` ausführen.
4. Eine Testbestellung vollständig durchspielen.
5. Kundenansicht und KDS offen lassen.
6. Browser-Zoom auf 100 % prüfen.
7. Keine GitHub-/Terminalfenster mit Secrets bzw. `.env.local` präsentieren.

## Nach der Präsentation

Preview-PowerShell-Fenster schließen und lokalen Supabase-Stack stoppen:

```powershell
npx --yes supabase@latest stop
```
