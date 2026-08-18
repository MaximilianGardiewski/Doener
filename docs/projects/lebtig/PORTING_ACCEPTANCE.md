# Lebtig — Portierungs-Acceptance

Stand: 2026-08-18

Diese Acceptance bewertet die technische Konsolidierung von Lebtig in die BusinessWebFactory. Sie behauptet keine unbestätigte Produkt-/Business-Abnahme.

## Bereits erfüllt

- [x] Lebtig existiert als eigener Workspace-Consumer unter `apps/lebtig`.
- [x] gemeinsame Permission-/Publishing-Primitiven werden über öffentliche `@business-web/*`-APIs konsumiert.
- [x] Google OAuth ist hinter einem provider-neutralen `OAuthPort` gekapselt.
- [x] native Supabase-OAuth ist der portable Default; Lovable ist nur explizite Übergangsbridge.
- [x] E-Mail/Passwort ist hinter `LebtigCredentialAuthPort` gekapselt.
- [x] gemeinsame Media-Primitiven liegen in `@business-web/cms`; Lebtig-spezifische Regeln bleiben app-owned.
- [x] 17 verifizierte Public/Auth-Routen sind als app-owned Route-Contract gepinnt.
- [x] Admin-Portierung wurde bis zum effektiven Schema-/RLS-Abgleich begrenzt; der Abgleich ist inzwischen erfolgt und bleibt DB-seitig maßgeblich.

## Public/Auth Runtime — VERIFIED

- [x] Public/Auth-Routen rendern im Monorepo gegen `LEBTIG_PUBLIC_AUTH_ROUTES`.
- [x] Auth-UI verwendet `LebtigCredentialAuthPort` und `OAuthPort` statt direkter Vendor-Auth-Aufrufe.
- [x] keine direkte `@lovable.dev/*`-Kopplung in Public/Auth-UI, Domain oder Shared Packages.
- [x] Lebtig besitzt reproduzierbare lokale Build-/Preview-Befehle.
- [x] Desktop- und Mobile-Smokes prüfen Status, H1, Overflow und Console Errors.
- [x] Auth-Guard-/Redirect-Verhalten ist testbar und reproduzierbar.

Evidence: PR #39, Merge `1fc339f59fa18772f3d14ef1b32e98bb6d5071e7`; CI + Self-host Release grün.

## E2E und Datenbank — VERIFIED

- [x] Public/Auth/Mobile/Legacy-Redirect-E2E aus der Donor-Basis sind im Repo reproduzierbar.
- [x] Lebtig besitzt eine klar app-spezifische Migration-/Schema-Grenze unter `apps/lebtig/supabase/`.
- [x] effective Auth/RLS/Functions/Grants/Storage-Policies sind gegen die Portierungsanforderungen geprüft.
- [x] anon, ordinary authenticated, moderator und admin werden separat gegen einen frischen lokalen Supabase-Stack getestet.
- [x] öffentliche Reads liefern nur veröffentlichte/fällige Inhalte; Drafts und private Submissions bleiben privat.
- [x] Rollenvergabe ist nicht Self-Service; Moderator/Admin bleiben backendseitig getrennt und die letzte Adminrolle ist DB-seitig geschützt.

Evidence:
- PR #40, Merge `ece6dc886a032f658939f4580c273ee46f92da86` — app-owned HTTP-/Legacy-/Sitemap- und Responsive-E2E-Verträge.
- PR #41, Merge `d8ac38e60fbecca9dbdbd03b559cee4f50ee82b7` — app-spezifische Schema-/RLS-Grenze.
- PR #42, Merge `5ba97c0c292ed5fd94dfa7aae3de999feb3e2ff7` — Clean-Install-Baseline ohne Business-Seed; reguläres CI, Self-host Release und echte lokale Supabase-RLS-/Storage-Matrix grün.

## CMS Runtime

- [ ] mindestens ein vollständiger Editorial-Vertical-Slice funktioniert: Login -> Edit -> Preview -> Publish -> Public Read -> Archive/Copy.
- [ ] Persistenz und Backend-Autorisierung sind Teil des Nachweises.
- [x] Medien bleiben über app-owned IDs/Routes abstrahiert; die öffentliche `/media/:id`-Runtime wird erst nach dem separaten Media-Slice freigegeben.
- [x] weitere CMS-/Admin-Routen werden erst nach einem vollständigen Vertical-Slice schrittweise portiert.

Aktueller Kandidat für den ersten vollständigen Nachweis ist ausschließlich der Mittagstisch-Slice in PR #43. Die beiden offenen Haken werden erst nach grüner Domain-, DB-/RLS-, Adapter- und Browser-Evidence gesetzt.

## Portabilität / Exit

- [x] Clean Checkout kann Lebtig ohne Lovable bauen, testen und lokal starten.
- [x] Lovable Vite-Preset und Preview-Error-Reporting sind kein notwendiger Buildpfad.
- [x] Lovable OAuth-Broker ist aus dem Standardpfad entfernt.
- [x] kein Vercel-/Lovable-/Managed-Supabase-Zwang für Build oder lokale Runtime.
- [ ] eigener Lebtig-Self-host-/Container-/Environment-Vertrag ist vollständig reproduzierbar dokumentiert und separat release-getestet.

CI-Reliability-Evidence: PR #44, Merge `cf1dc7a80bdbf90b8c30ad7e265a9f22f4f9d3d9`, hält alle Browser-Gates bei einem begrenzten, runner-freundlichen Chromium-Installationsweg aktiv.

## Release-Grenze

- [ ] reale Business-/Legal-/Media-Inhalte sind separat bestätigt und content-integrity-geprüft.
- [ ] Production-Deploy erst nach expliziter Freigabe.

Ein Haken wird nur nach Code-/Runtime-/DB-/Browser-Evidenz gesetzt, nicht aufgrund einer Agenten-Zusammenfassung.
