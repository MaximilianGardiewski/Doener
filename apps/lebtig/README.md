# Lebtig — zweiter BusinessWebFactory-Consumer

Stand: 2026-08-18

Lebtig ist nicht mehr nur eine Donor-Notiz. Dieser Ordner wird schrittweise zum **zweiten echten Consumer** der gemeinsamen BusinessWebFactory-Packages und dient damit als Portabilitäts-/Generizitätsbeweis neben Mcello.

## Verifizierte Quellbasis

Der verbundene Lovable-Connector stellt die vollständige Projekt-Dateistruktur und einzelne Datei-Inhalte read-only bereit.

- Lovable project: `18d92034-aaee-4d76-8209-393d47b3949c`
- aktuell ausgelesener Snapshot/letzter bekannter Deploy-Commit: `abb54c73f42b784d7c66cd1e1d468b532a67f065`
- Template: TanStack Start + TypeScript + Vite
- Source vorhanden: `src/`, Routen, Admin, CMS, Auth, Media, PWA, E2E und Supabase-Migrationen
- vorhandene E2E-Bereiche: Public/Auth, Admin, Legacy Redirects, Mobile

Die Source wird **nicht blind als zweiter Monolith kopiert**. Jeder Port-Slice muss zeigen, welche Logik wirklich generisch ist und welche bewusst Lebtig-spezifisch bleiben soll.

## Erster echter Consumer-Slice

Lebtig konsumiert im Repo jetzt:

- `@business-web/auth` für den generischen Permission-Policy-Mechanismus
- `@business-web/cms` für gemeinsame Publication-Status-/Zeitfenster-Semantik

Lebtig behält dabei seine echte, bestätigte Rollen-Sprache:

- `admin`
- `moderator`

Der Shared Auth Core wird also **nicht** um eine Lebtig-Sonderrolle hartcodiert. Stattdessen definiert Lebtig seine eigene Policy auf dem generischen Contract.

Gleiches gilt für CMS: Mittagstisch, Wochenangebote, Rezepte und Lebtig-Seiten bleiben Lebtig-Domain; nur gemeinsame Publishing-Primitiven liegen im Shared Package.

## Rollenboundary aus dem aktuellen Lebtig-Stand

Moderator:

- Content pflegen/veröffentlichen
- Medien verwalten
- Partyservice-Anfragen lesen sowie Status/Notiz pflegen
- **keine** Seiten-/Navigationseinstellungen
- **keine** Geschäftseinstellungen
- **keine** Rollen-/Benutzerverwaltung
- **kein** Löschen von Partyservice-Anfragen

Admin besitzt zusätzlich diese strukturellen Rechte.

Datenbank/RLS bleibt dabei die eigentliche Sicherheitsgrenze; UI-/Domain-Permissions sind kein Ersatz für RLS.

## Bekannte Lovable-Kopplungen im Quellprojekt

Aus `docs/platform-exit-audit.md` und dem aktuellen Source-Audit:

1. `@lovable.dev/cloud-auth-js` / `src/integrations/lovable/index.ts` für OAuth-Broker
2. `@lovable.dev/vite-tanstack-config` in der Build-Konfiguration
3. Preview-spezifisches Error Reporting (`lovable-error-reporting.ts`)
4. Hosting/Deployment auf Lovable
5. aktuell verwaltete Supabase-Instanz

Provider-neutrale Teile existieren bereits umfangreich: TanStack-Source, Supabase-Migrationen/RLS, offizielle `@supabase/supabase-js`-Clients, Media-Endpunkt, Staff-Invite-Serverfunktion, Legacy Redirects, Sitemap und Playwright-E2E.

## Nächste Port-Slices

1. **Portability Manifest / Source Inventory** — Quellpfade und Vendor-Kopplungen im Repo festhalten.
2. **Auth-Port** — Lovable OAuth-Broker hinter einen provider-neutralen Auth-Port verschieben; native Supabase-OAuth als portabler Default vorbereiten.
3. **CMS-/Media-Port** — gemeinsame Publication-/Media-Primitiven nutzen, Lebtig-spezifische Wochen-/Rezepte-/Page-Modelle erhalten.
4. **UI-/Route-Import** — Public-/Admin-Routen schrittweise übernehmen, nicht als unreviewten Dump.
5. **E2E übernehmen** — Public/Auth/Admin/Mobile-/Legacy-Redirect-Tests im Repo reproduzierbar machen.
6. **Supabase-Schema vergleichen** — Lebtig-Migrationen gegen BusinessWebFactory-Auth/CMS/Media-Boundaries abgleichen; keine Mcello-Gastro-Ordering-Tabellen aufzwingen.
7. **Lovable Runtime entfernen** — erst wenn Build/Auth/Error-Reporting/Hosting portabel nachgewiesen sind.

## Nicht verhandelbar

- Lovable bleibt optionaler Client/Host, nicht Source of Truth.
- Keine echten Businessdaten, Medienrechte oder Betreiberinformationen werden beim Port erfunden.
- Keine Production-Mutation und kein Deployment ohne separate Freigabe.
- Mcello-spezifische Ordering-/KDS-Logik wird Lebtig nicht künstlich aufgezwungen.
