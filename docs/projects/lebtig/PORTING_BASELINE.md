# Lebtig — Verifizierte Portierungsbaseline

Stand: 2026-08-18

Diese Datei beschreibt den belegten technischen Portierungsstand von Lebtig in die BusinessWebFactory. Sie ist kein Ersatz für ein owner-bestätigtes Produkt-Decision-Ledger.

## Verifizierte Donor-Basis

- Lovable-Projekt: `18d92034-aaee-4d76-8209-393d47b3949c`
- verifizierter Snapshot: `abb54c73f42b784d7c66cd1e1d468b532a67f065`
- Donor-Technik: TanStack Start, TypeScript, Vite, Supabase, Public-/Admin-Routen, Auth, CMS, Media, PWA und E2E
- bekannte Vendor-Kopplungen: Lovable OAuth-Broker, Lovable Vite-Preset, Preview-Error-Reporting, Hosting/Deployment und verwaltete Supabase-Instanz

## Bereits im Monorepo portiert

### Shared Auth

Lebtig konsumiert `@business-web/auth` und behält seine eigene Rollen-Sprache `admin|moderator`. Der gemeinsame Auth-Baustein kennt keine Lebtig-Sonderrolle.

Der Google-OAuth-Flow ist hinter `OAuthPort` gekapselt. Native Supabase-OAuth ist der portable Default; der Lovable-Broker ist nur eine explizite Übergangsbridge.

E-Mail/Passwort läuft über den app-owned `LebtigCredentialAuthPort`. Die konkrete Supabase-Implementierung wird am Composition-Rand injiziert.

### Shared CMS / Media

Lebtig konsumiert `@business-web/cms` für gemeinsame Publishing- und Image-Metadaten-Primitiven. Mittagstisch, Wochenangebote, News, Rezepte und Seiten bleiben Lebtig-Domain.

Die Lebtig-Media-Regeln bleiben app-spezifisch: privater `media`-Bucket, stabile `/media/:id`-Links, JPG/PNG/WebP/AVIF, 5-MB-Grenze, Pflicht-Alt-Text bis 180 Zeichen, Focal-Point und Delete-Schutz über Usage-Queries.

### Public/Auth Route Contracts

`apps/lebtig/src/routes/manifest.ts` pinnt 17 verifizierte Public-/Auth-Routen einschließlich dynamischer News-/Recipe-/CMS-Page-/Media-Routen und Sitemap.

Admin-Routen sind bewusst noch ausgeschlossen. Der Grund ist nicht fehlende UI, sondern der noch ausstehende Schema-/RLS-Abgleich.

`apps/lebtig/src/auth/route-controller.ts` bildet Sign-in, Bootstrap-gebundenes Sign-up, Pending Verification und Google OAuth framework-neutral ab. Direkte Lovable-/Supabase-Imports gehören nicht in diese Route-/UI-Grenze.

## Noch nicht portiert oder bewiesen

- echte ausführbare Public/Auth Render-Shell im Monorepo
- reproduzierbare Lebtig-Preview-/Build-Composition ohne Lovable-Preset
- Public/Auth/Mobile/Legacy-Redirect-E2E im Monorepo
- app-spezifischer Lebtig-Migrations-/Schema-Pfad
- vollständiger Auth/RLS/Storage-Abgleich für anon/authenticated/moderator/admin
- Admin-/CMS-Routen im Monorepo
- Entfernung der verbleibenden Lovable Build-/Preview-/Runtime-Kopplungen
- eigener Self-host-/Clean-clone-Nachweis für Lebtig

## Kosten- und Portabilitätsregel

Der Port soll keine neue notwendige monatliche SaaS-Abhängigkeit erzeugen. Bevorzugt werden GitHub als Source of Truth, Open-Source-/lokale Build-Werkzeuge sowie lokales/self-hostbares PostgreSQL/Supabase. Externe Design-/Builder-Werkzeuge werden nur bei konkretem Nutzen zugeschaltet und dürfen keine alleinige Projektwahrheit halten.

## Nächste sichere Reihenfolge

1. Public/Auth Render-Shell gegen die bereits vorhandenen app-owned Contracts.
2. Lebtig-Preview/Build und Public/Auth/Mobile/Legacy-E2E in GitHub CI.
3. Lebtig-Schema-/Migration-/RLS-Abgleich, ohne Mcello-spezifische Ordering-Tabellen aufzuzwingen.
4. genau ein vollständiger CMS-Vertical-Slice als Runtime-/Security-Beweis.
5. weitere Admin-/CMS-Routen schrittweise übernehmen.
6. Lovable-Vite-/Preview-/Runtime-Kopplungen entfernen und Clean-clone/Self-host beweisen.

Jeder Schritt bleibt ein reviewbarer PR. Production bleibt separat freigabepflichtig.
