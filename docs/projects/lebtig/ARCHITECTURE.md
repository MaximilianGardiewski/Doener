# Lebtig — Portabilitätsarchitektur

Stand: 2026-08-18

## Ziel

Lebtig wird als zweiter echter BusinessWebFactory-Consumer so portiert, dass Public UI, Auth, CMS, Media und spätere Admin-Funktionen aus Git reproduzierbar bleiben und kein Builder zur notwendigen Runtime wird.

## Schichten

```text
browser
  +-- public shell / route renderer
  +-- auth shell
  +-- later: admin/CMS shell
          |
          v
app-owned controllers + Lebtig domain
          |
  +-------+------------------+
  |                          |
@business-web/auth       @business-web/cms
  |                          |
  +-----------+--------------+
              v
      provider adapters
       +-- Supabase auth
       +-- Postgres/RLS
       +-- Storage/media
```

## Public/Auth Route Boundary

`LEBTIG_PUBLIC_AUTH_ROUTES` ist die app-owned Route-Oberfläche. Framework-Dateinamen oder ein Builder dürfen diese URLs nicht still verändern.

Die Render-Schicht darf TanStack/React/Vite als Open-Source-Implementierungswerkzeuge nutzen, aber keine Business-/Auth-Invarianten in Framework-Komponenten verstecken.

## Auth Boundary

Credential-UI spricht mit `LebtigCredentialAuthPort`. OAuth-UI spricht mit `OAuthPort`.

Supabase ist ein Adapter am Composition-Rand. Der Lovable OAuth-Broker ist nur ein Legacy-Adapter und darf nicht erneut in Route-/UI-Code gezogen werden.

Der vorhandene Bootstrap-Schutz bleibt fail-closed: geschlossener Bootstrap darf nicht allein durch UI-Manipulation Self-Service-Sign-up erlauben.

## CMS Boundary

Shared CMS enthält nur generische Publication-/Media-Primitiven. Lebtig-spezifische Inhaltsmodelle wie Mittagstisch, Wochenangebote, Rezepte und Seiten bleiben in der App.

Ein vollständiger CMS-Vertical-Slice wird vor der breiten Admin-Portierung bewiesen. Backend/RLS bleibt die Autoritätsgrenze; UI-Permissions sind nur Bedienlogik.

## Media Boundary

Öffentliche Inhalte referenzieren stabile app-owned Media-IDs/URLs. Provider-/Bucket-Pfade werden nicht als öffentlicher Inhaltsvertrag verwendet.

Lebtig-spezifische Limits und Usage-Regeln bleiben außerhalb des Shared Packages. Storage-Schreibrechte und Löschschutz werden server-/datenbankseitig abgesichert.

## Datenbankgrenze

Lebtig erhält keinen künstlichen Mcello-Ordering-/KDS-Schemaanteil. Der kommende Schema-Abgleich soll gemeinsame Auth/CMS/Media-Muster extrahieren, während Metzgerei-spezifische Tabellen und Policies app-owned bleiben.

Migrationen müssen von Git aus reproduzierbar sein. Ein Managed-Supabase-Projekt ist keine Voraussetzung für den Entwicklungs- oder späteren Self-host-Pfad.

## Build / Hosting Boundary

Der portable Standardpfad soll aus normalen Open-Source-Werkzeugen bestehen. Lovable-Vite-Preset, Preview-Error-Reporting und Lovable-Hosting werden als Exit-Kandidaten behandelt und nicht in neue Kernlogik eingebaut.

Zielkriterium: Ein sauberer Clone kann Lebtig bauen, testen und starten, ohne Zugriff auf den ursprünglichen Builder.

## Sicherheits- und Kostenregeln

- Secrets nie in Git oder Browserbundles.
- keine Production-Mutation ohne ausdrückliche Freigabe.
- keine neue notwendige monatliche SaaS-Abhängigkeit allein aus Bequemlichkeit.
- Auth/RLS/Storage werden gegen effektiven Zustand und Rollen getestet.
- Design-/Builder-Werkzeuge sind optional; relevante Ergebnisse werden als Code/Tokens/Assets ins Repo überführt.
