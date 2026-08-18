# Mcello Demo Control Center V1

Status: **LOCAL / PRIVATE-LAN PRESENTATION BOOTSTRAP**

`Mcello-Demo.ps1` ist der eine Einstiegspunkt für einen neuen oder bereits eingerichteten Windows-11-Demo-Rechner. Das Bootstrap darf als einzelne Datei außerhalb des Repositories liegen: standardmäßig richtet es `C:\AI\Doener` ein, installiert bei Bedarf PowerShell 7 und Git über `winget`, klont das Repository und übergibt anschließend an `scripts/demo-mcello-control-center.ps1`.

## Start

Von einer heruntergeladenen Einzeldatei:

```powershell
powershell -ExecutionPolicy Bypass -File .\Mcello-Demo.ps1
```

Wenn das Repository bereits vorhanden ist:

```powershell
npm run demo:mcello
```

Komplette Vorbereitung ohne direkt eine Präsentation zu starten:

```powershell
npm run demo:mcello:prepare
```

Ein anderer Zielordner kann übergeben werden:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\Mcello-Demo.ps1 -Workspace 'D:\Demo\Doener'
```

## Interaktives Menü

Das Control Center bietet:

1. vollständige Vorbereitung + Desktop-Demo,
2. vollständige Vorbereitung + LAN-Demo für PC/Tablet/Smartphone,
3. reine Vorbereitung / Vorladen,
4. schnellen Desktop-Start nach bereits erfolgter Vorbereitung,
5. schnellen LAN-Start,
6. System- und Repository-Status,
7. Repository-Update + `npm ci`,
8. Supabase/Docker-Warm-up,
9. Öffnen der lokalen Demo-Seiten,
10. Stop/Cleanup der lokalen Demo-Umgebung.

## Vollständige Vorbereitung

Der Fortschrittsplan zeigt sieben getrennte Phasen per `Write-Progress` und zusätzlich als persistente Statuszeilen:

1. PowerShell/Git/Node/Docker prüfen und fehlende Tools installieren,
2. Workspace/Repository prüfen oder einrichten,
3. sauberes `main` per Fast-Forward aktualisieren,
4. gelockte Node-Abhängigkeiten mit `npm ci` installieren,
5. Supabase CLI und Docker Images einmal vorwärmen,
6. `npm run check` als Repository-Preflight ausführen,
7. Vorbereitung abschließen oder den bestehenden Desktop-/LAN-Presentation-Launcher starten.

Der erste Supabase-Warm-up darf mehrere Minuten dauern, weil dabei die benötigten Container-Images tatsächlich vorab geladen werden. Anschließend wird dieser reine Warm-up-Stack wieder gestoppt; die eigentliche Demo startet weiterhin mit dem bestehenden frischen Demo-Flow.

## Sicherheits- und Wahrheitsgrenzen

- Das Control Center führt **kein Production Deployment** aus.
- Ein vorhandener, nicht leerer Ordner wird niemals gelöscht oder überschrieben.
- Lokale, uncommittete Git-Änderungen blockieren das automatische Umschalten/Pullen auf `main`, statt sie zu verwerfen.
- Die LAN-Demo fordert nur dann Administratorrechte an, wenn die bestehenden LocalSubnet-Firewallregeln benötigt werden.
- Der Stop-Befehl beendet nur erkannte Mcello-Runtime-Prozesse auf den Demo-Ports und den lokalen Supabase-Stack; fremde Prozesse werden nicht blind beendet.
- Die eigentliche Mcello-Demo bleibt weiterhin in den bereits getesteten Launchern `demo-mcello.ps1` und `demo-mcello-presentation-lan.ps1`. Das Control Center orchestriert Vorbereitung und Bedienung, dupliziert aber keine Shop-/Checkout-/KDS-Logik.

## Logs

Jeder Control-Center-Lauf schreibt einen PowerShell-Transcript unter:

```text
%LOCALAPPDATA%\McelloDemo\logs\
```

Damit ist bei einer Präsentationsvorbereitung nachvollziehbar, welche Phase erfolgreich war und wo ein Rechner gegebenenfalls noch eine Systemvoraussetzung benötigt.
