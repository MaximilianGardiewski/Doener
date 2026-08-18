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

## Bereits echte Shared-Consumer-Slices

Lebtig konsumiert im Repo jetzt:

- `@business-web/auth` für generische Permission-Policies und den provider-neutralen OAuth-Port
- `@business-web/cms` für Publication-Status/-Zeitfenster sowie gemeinsame Image-Metadaten-/Upload-Primitiven

Lebtig behält dabei seine echte Rollen-Sprache `admin|moderator`; Mcello behält `admin|staff`. Die Shared Packages kennen keine Lebtig-Sonderrolle und keine Mcello-spezifische Moderator-Interpretation.

Gleiches gilt für CMS: Mittagstisch, Wochenangebote, Rezepte und Lebtig-Seiten bleiben Lebtig-Domain; nur gemeinsame Publishing-/Media-Primitiven liegen im Shared Package.

## OAuth-Portabilität

Der aktuelle Lovable-Source nutzt für den Google-Button `@lovable.dev/cloud-auth-js`, während E-Mail/Passwort, Session und Rollen bereits direkt über den normalen Supabase-Client laufen.

Die BusinessWebFactory-Grenze ist deshalb bewusst klein:

- `@business-web/auth` definiert nur `OAuthPort`, Provider, Request und Navigationsergebnis.
- `apps/lebtig/src/auth/native-supabase-oauth.ts` ist der portable Default-Adapter.
- `apps/lebtig/src/auth/lovable-oauth-adapter.ts` kapselt den bestehenden Lovable-Broker nur als Übergangspfad.
- `createLebtigOAuthPort(...)` wählt standardmäßig native Supabase-OAuth; Lovable wird nur bei explizitem `useLegacyLovableBroker` benutzt.
- Shared Auth importiert weder Supabase noch Lovable und bleibt damit provider-neutral.

## Public/Auth-Route-Port

Der erste kontrollierte Route-Slice liegt jetzt als **framework-neutrale, testbare Route-/Auth-Grenze** im Repo. Er kopiert bewusst noch nicht den kompletten TanStack-/Lovable-Frontend-Monolithen.

- `src/routes/manifest.ts` pinnt die 17 verifizierten Public-/Auth-URLs des Donor-Snapshots inklusive dynamischer News-/Recipe-/Page-/Media-Routen und Sitemap.
- Admin-Routen sind absichtlich ausgeschlossen, bis der Supabase-Schema-/RLS-Abgleich erfolgt ist.
- `src/auth/route-controller.ts` übernimmt die Semantik des bestehenden Login-Flows: Sign-in, Bootstrap-gebundenes Sign-up, Verifikationszustand und Google-OAuth.
- Der Controller kennt weder Lovable noch Supabase direkt. E-Mail/Passwort läuft über `LebtigCredentialAuthPort`, Google über den gemeinsamen `OAuthPort`.
- Geschlossener Bootstrap blockiert Self-Service-Sign-up fail-closed auch dann, wenn eine spätere UI den Button versehentlich sichtbar machen sollte.
- Redirect-Ziel nach erfolgreicher Authentifizierung ist app-owned `/admin`.
- Der nächste Render-Slice kann die TanStack-UI gegen diese Contracts verdrahten, ohne Vendorlogik erneut in die Route zu ziehen.

## CMS-/Media-Portabilität

Der aktuelle Lebtig-Medienworkflow ist bereits provider-neutral genug, um seine pure Domain ohne Lovable zu übernehmen:

- privater Storage-Bucket `media`
- stabile App-Links `/media/:id`
- JPG/PNG/WebP/AVIF
- maximal 5 MB
- Alt-Text ist in der Admin-UI Pflicht, maximal 180 Zeichen
- Titel/Bildunterschrift und Focal-Point
- Löschen nur, wenn das Medium in keinem CMS-Inhalt mehr verwendet wird

Im Shared `@business-web/cms` liegen jetzt nur die wirklich gemeinsamen Primitiven:

- portable Image-MIME-Liste
- `CmsImageMetadata`
- konfigurierbare `ImageUploadPolicy` / `validateImageUpload(...)`
- normalisierter Focal-Point `0..1`

Lebtig mappt seine bestehenden Prozent-Focal-Points und 5-MB-/180-Zeichen-Regeln in `apps/lebtig/src/domain/media.ts` darauf. Storage-Pfade und CMS-Usage-Queries bleiben Lebtig-spezifisch.

Mcellos bestehender Media-Workflow behält bewusst zusätzliche Regeln (`source_kind`, `rights_confirmed`, 10-MB-Grenze). Diese werden **nicht** in einen vermeintlich universellen Shared Contract gezwungen.

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

1. `@lovable.dev/cloud-auth-js` / `src/integrations/lovable/index.ts` für OAuth-Broker — hinter dem neuen Auth-Port isoliert
2. `@lovable.dev/vite-tanstack-config` in der Build-Konfiguration
3. Preview-spezifisches Error Reporting (`lovable-error-reporting.ts`)
4. Hosting/Deployment auf Lovable
5. aktuell verwaltete Supabase-Instanz

Provider-neutrale Teile existieren bereits umfangreich: TanStack-Source, Supabase-Migrationen/RLS, offizielle `@supabase/supabase-js`-Clients, Media-Endpunkt, Staff-Invite-Serverfunktion, Legacy Redirects, Sitemap und Playwright-E2E.

## Nächste Port-Slices

1. **Public/Auth Render-Shell** — die echte TanStack-UI gegen `LEBTIG_PUBLIC_AUTH_ROUTES`, `LebtigCredentialAuthPort` und `OAuthPort` verdrahten; keine direkte Lovable-Auth-Kopplung.
2. **E2E übernehmen** — Public/Auth/Admin/Mobile-/Legacy-Redirect-Tests im Repo reproduzierbar machen.
3. **Supabase-Schema vergleichen** — Lebtig-Migrationen gegen BusinessWebFactory-Auth/CMS/Media-Boundaries abgleichen; keine Mcello-Gastro-Ordering-Tabellen aufzwingen.
4. **Admin-/CMS-Routen** — nach Schema-/Auth-Abgleich kontrolliert portieren.
5. **Build-/Preview-Vendorgrenzen** — Lovable Vite-Preset und Preview-Error-Reporting aus dem portablen Buildpfad entfernen.
6. **Lovable Runtime entfernen** — erst wenn Build/Auth/Error-Reporting/Hosting portabel nachgewiesen sind.

## Nicht verhandelbar

- Lovable bleibt optionaler Client/Host, nicht Source of Truth.
- Keine echten Businessdaten, Medienrechte oder Betreiberinformationen werden beim Port erfunden.
- Keine Production-Mutation und kein Deployment ohne separate Freigabe.
- Mcello-spezifische Ordering-/KDS-Logik wird Lebtig nicht künstlich aufgezwungen.
