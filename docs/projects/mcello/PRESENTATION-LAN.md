# Mcello — Drei-Geräte-LAN-Präsentation

Stand: 2026-08-18

Ziel dieser Präsentation ist eine glaubwürdige lokale Simulation des späteren Betriebs ohne Production-Deployment und ohne bezahlte Provider.

## Rollen der Geräte

### Laptop — Webspace + lokales Backend + WLAN

Der Windows-Laptop übernimmt für die Vorführung gleichzeitig:

- Windows Mobile Hotspot,
- Mcello-Webruntime,
- lokalen Supabase-/Postgres-Stack in Docker,
- lokalen LAN-Eingang auf TCP 80,
- Realtime-Zugriff für die Geräte im Hotspot.

Die eigentliche Mcello-App bleibt weiterhin nur auf `127.0.0.1:4173` gebunden. Ein separater Demo-Proxy veröffentlicht sie ausschließlich für das lokale Hotspot-Netz.

### iPad — Mcello / Staff / Besitzer

Das iPad verbindet sich mit dem Windows-Hotspot und öffnet primär:

- `/kds.html` für eingehende Bestellungen und KDS-Lifecycle,
- optional `/ops.html` für operative Verfügbarkeit,
- optional `/admin.html` für Backoffice-Demonstration.

Für den Kernpitch sollte das iPad auf der KDS-Ansicht bleiben. Nach einem Tap auf `Ton aktivieren` können neue wartende Bestellungen akustisch signalisiert werden.

### Handy — Kunde

Das Handy verbindet sich ebenfalls mit dem Windows-Hotspot und öffnet die öffentliche Mcello-Seite. Dort wird der komplette Kundenpfad demonstriert:

1. Homepage/Speisekarte,
2. Produkt wählen,
3. Warenkorb,
4. Abholung/Slot,
5. WhatsApp DEV-Key anfordern,
6. Bestellung abschicken,
7. Statusseite beobachten.

## Start

Voraussetzungen:

- Windows 11,
- PowerShell 7,
- Node.js 22+,
- Docker Desktop,
- PowerShell als Administrator.

Im Repo-Root:

```powershell
npm run demo:mcello:lan
```

Wenn der Windows Mobile Hotspot noch aus ist, öffnet der Launcher automatisch die passende Windows-Einstellungsseite und wartet auf den aktiven Hotspot-Adapter.

Der Launcher erkennt die private Hotspot-IP, baut standardmäßig einen frischen lokalen Supabase-Stand auf, importiert das provisorische Menü, erzeugt lokale Staff-/Admin-Zugänge, setzt ausschließlich den disposable lokalen Shop auf `force_open`, richtet zwei temporäre LocalSubnet-Firewallregeln ein und startet App + LAN-Proxy.

## Adressen

Der Launcher gibt am Ende die konkreten URLs für Handy und iPad aus.

### Bevorzugte Demo-Domain

Wenn externe DNS-Auflösung verfügbar ist, versucht der Launcher automatisch einen kostenlosen eingebetteten-IP-Hostnamen nach diesem Muster:

```text
http://mcello.192-168-137-1.sslip.io/
```

Damit sieht das Handy einen echten DNS-Hostnamen statt einer nackten IP. Diese Adresse ist nur eine Präsentationshilfe und keine Mcello-Produktionsdomain.

Wenn diese DNS-Auflösung am Präsentationsort nicht funktioniert, bleibt immer der direkte lokale Fallback verfügbar:

```text
http://192.168.137.1/
```

### Eigene Demo-Domain

Wenn vor der Präsentation eine echte kontrollierte Subdomain vorhanden ist, kann sie übergeben werden:

```powershell
pwsh -NoProfile -File scripts/demo-mcello-lan.ps1 -DemoHost demo.example.de
```

Die A-Auflösung dieser Subdomain muss für die Präsentation auf die aktuelle private Hotspot-IP zeigen. Der Launcher warnt, wenn dies aus Sicht des Laptops nicht der Fall ist.

## Empfohlener Ablauf im Raum

1. Laptop an Strom anschließen und Docker Desktop starten.
2. PowerShell 7 als Administrator öffnen.
3. `npm run demo:mcello:lan` ausführen.
4. Falls Windows die Hotspot-Einstellungen öffnet: Mobile Hotspot einschalten.
5. iPad mit diesem Hotspot verbinden.
6. iPad-KDS-URL aus dem Launcher öffnen und `Ton aktivieren` antippen.
7. Handy mit demselben Hotspot verbinden.
8. Kunden-URL aus dem Launcher öffnen.
9. Bestellung am Handy vollständig ausführen.
10. Auf dem iPad zeigen, dass die Bestellung eingeht.
11. Auf dem iPad annehmen und anschließend auf `Fertig` setzen.
12. Am Handy die Statusänderung zeigen.
13. Optional die Bestellung auf dem iPad als erledigt markieren.

## Netzwerkschutz

Der LAN-Modus ist ausdrücklich kein Deployment-Pfad:

- Mcello-Appserver selbst bleibt Loopback-only.
- Nur der separate LAN-Demo-Proxy lauscht auf dem Hotspot.
- Windows Firewall erlaubt temporär nur TCP 80 und TCP 54321 für `LocalSubnet` auf der erkannten Hotspot-IP.
- Der Production-Stack wird nicht verändert.
- `prepare-mcello-demo.mjs` akzeptiert weiterhin nur den lokalen Supabase-Stack für `force_open`.
- Kein Managed Supabase wird benötigt.
- Kein echter WhatsApp-Transport wird aktiviert.
- Kein SMS-Fallback wird aktiviert.

## Nach der Präsentation

Der Launcher zeigt den passenden Cleanup-Befehl mit der erkannten Hotspot-IP an. Beispiel:

```powershell
pwsh -NoProfile -File scripts/stop-mcello-lan.ps1 -LanAddress 192.168.137.1
```

Der Cleanup:

- beendet den LAN-Proxy,
- entfernt die beiden temporären Firewallregeln,
- stoppt den disposable lokalen Supabase-Stack.

Danach das separate Mcello-Preview-PowerShell-Fenster schließen und den Windows Mobile Hotspot ausschalten.

## Vor dem eigentlichen Termin

Mindestens einmal mit genau den drei echten Geräten testen. Besonders prüfen:

- iPad und Handy erhalten eine IP vom Laptop-Hotspot,
- Kunden-URL lädt auf dem Handy,
- KDS lädt auf dem iPad,
- eine Bestellung erscheint ohne manuelles Neuladen auf dem iPad,
- KDS-Statuswechsel werden am Handy sichtbar,
- nach Cleanup sind TCP 80/54321 nicht mehr für das LAN freigegeben.
