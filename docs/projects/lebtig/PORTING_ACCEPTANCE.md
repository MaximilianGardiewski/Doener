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
- [x] Admin-Routen sind bis zum Schema-/RLS-Abgleich bewusst ausgeschlossen.

## Nächster Slice — Public/Auth Runtime

- [ ] Public/Auth-Routen rendern im Monorepo gegen `LEBTIG_PUBLIC_AUTH_ROUTES`.
- [ ] Auth-UI verwendet ausschließlich `LebtigCredentialAuthPort` und `OAuthPort`.
- [ ] keine direkte `@lovable.dev/*`-Kopplung in Public/Auth-UI, Domain oder Shared Packages.
- [ ] Lebtig besitzt einen reproduzierbaren lokalen Preview-/Build-Befehl.
- [ ] Desktop- und Mobile-Smokes prüfen Status, H1, Overflow und Console Errors.
- [ ] Auth-Guard-/Redirect-Verhalten ist testbar und reproduzierbar.

## Danach — E2E und Datenbank

- [ ] Public/Auth/Mobile/Legacy-Redirect-E2E aus der Donor-Basis sind im Repo reproduzierbar.
- [ ] Lebtig besitzt eine klar app-spezifische Migration-/Schema-Grenze.
- [ ] effective Auth/RLS/Functions/Grants/Storage-Policies sind gegen die Portierungsanforderungen geprüft.
- [ ] anon, ordinary authenticated, moderator und admin werden separat getestet.
- [ ] öffentliche Reads liefern nur veröffentlichte/fällige Inhalte; Drafts und private Submissions bleiben privat.
- [ ] Rollenvergabe ist nicht Self-Service; Moderator/Admin bleiben backendseitig getrennt.

## CMS Runtime

- [ ] mindestens ein vollständiger Editorial-Vertical-Slice funktioniert: Login -> Edit -> Preview -> Publish -> Public Read -> Archive/Copy.
- [ ] Persistenz und Backend-Autorisierung sind Teil des Nachweises.
- [ ] Medien bleiben über app-owned IDs/Routes abstrahiert.
- [ ] weitere CMS-/Admin-Routen werden erst danach schrittweise portiert.

## Portabilität / Exit

- [ ] Clean Clone kann Lebtig ohne Lovable bauen, testen und lokal starten.
- [ ] Lovable Vite-Preset und Preview-Error-Reporting sind nicht notwendiger Buildpfad.
- [ ] Lovable OAuth-Broker ist aus dem Standardpfad entfernt.
- [ ] kein Vercel-/Lovable-/Managed-Supabase-Zwang für Build/Run/Deploy.
- [ ] Self-host-/Container-/Environment-Vertrag ist reproduzierbar dokumentiert.

## Release-Grenze

- [ ] reale Business-/Legal-/Media-Inhalte sind separat bestätigt und content-integrity-geprüft.
- [ ] Production-Deploy erst nach expliziter Freigabe.

Ein Haken wird nur nach Code-/Runtime-/DB-/Browser-Evidenz gesetzt, nicht aufgrund einer Agenten-Zusammenfassung.
