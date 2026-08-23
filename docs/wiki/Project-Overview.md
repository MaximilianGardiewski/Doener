# Projektüberblick

## Mission

BusinessWebFactory ist eine wiederverwendbare Plattform für moderne Business-Websites und operative Business-Apps. Das Ziel ist nicht, für jeden Kunden eine neue Insel zu bauen, sondern gemeinsame, klar getrennte Bausteine zu entwickeln, die von mehreren Anwendungen konsumiert werden können.

## Referenzanwendungen

### Mcello

Mcello ist die aktuell umfangreichste Referenzanwendung. Sie beweist unter anderem:

- first-party Online-Bestellung ohne Marketplace-Pflicht
- Pickup ASAP und Vorbestellslots
- server-/DB-autoritatives Pricing, Availability und Capacity
- KDS mit Accept/Reject/Preparing/Ready/Completed
- Rush, Pause, Snooze, Delay und Realtime
- Admin-Katalog und Produktmedien
- CMS für Homepage, News/Events und Galerie
- PWA und responsive Public Experience
- Pay-on-site V1 mit vorbereiteter provider-neutraler Payment Boundary
- vorbereitete Delivery-, Analytics- und Location-Boundaries
- reproduzierbaren Self-host-/Migration-/Backup-/Restore-Pfad

### Lebtig

Lebtig ist die zweite Referenz-/Donor-Anwendung. Strategisch wichtig ist sie als **zweiter echter Consumer** der gemeinsamen Packages: Wiederverwendbarkeit soll nicht nur behauptet, sondern durch eine zweite Anwendung bewiesen werden.

## Architekturprinzipien

- Gemeinsame Logik lebt in öffentlichen `@business-web/*`-Packages.
- App-zu-App-Kopplung und direkte Imports in fremde Package-Interna werden vermieden bzw. durch CI geschützt.
- Domain-Logik bleibt möglichst provider-neutral.
- Supabase/PostgreSQL ist Adapter- und Integrationsebene, nicht die Identität der Domain.
- Externe Builder, Design- und Hostingtools dürfen den Workflow beschleunigen, aber keine versteckte Source of Truth oder zwingende Runtime-Abhängigkeit erzeugen.
- Production ist ein eigener Freigabeschritt.

## Projektarbeitsweise

Neue Arbeit beginnt nicht mit „Was könnten wir noch bauen?“, sondern mit:

1. Decision Ledger lesen.
2. Evidence und aktuelle Roadmap prüfen.
3. Verifizieren, ob der Slice bereits existiert.
4. Nur die tatsächlich offene Grenze bearbeiten.
5. Änderungen über Branch/PR, Tests und passende Evidence zurück ins Repo führen.

## Kanonische Quellen

- [`README.md`](../../README.md)
- [`Quellen/README.md`](../../Quellen/README.md)
- [`docs/projects/mcello/DECISIONS.md`](../../docs/projects/mcello/DECISIONS.md)
- [`docs/projects/mcello/V1_EVIDENCE.md`](../../docs/projects/mcello/V1_EVIDENCE.md)
- [`Quellen/ROADMAP.md`](../../Quellen/ROADMAP.md)
