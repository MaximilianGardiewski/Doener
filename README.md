# BusinessWebFactory

Vendor-neutrale Basis für wiederverwendbare Business-Websites und operative Business-Apps.

## Status

Phase 0 / erster Slice:
- Lovable ist **nicht** Source of Truth.
- Lebtig ist als Donor-Referenz dokumentiert.
- Mcello ist das zweite Showcase-Projekt.
- Gemeinsame Domain-Module werden nur dort extrahiert, wo echte Wiederverwendung sinnvoll ist.
- Die vendor-neutralen Skills liegen unter `skills/`.
- Der Mcello-Frontend-Slice ist als ausführbare Zero-Dependency-PWA unter `apps/mcello/` vorhanden.
- Der Admin-Slice verwaltet Speisekarte, Allergene, Bestellzeiten sowie zeitgesteuerte redaktionelle Inhalte und die kontrollierte Startseiten-Reihenfolge.
- Domain-Logik liegt unter `packages/` und hat Node-Tests.

## Start

```bash
npm run check
npm run preview:mcello
```

Dann `http://127.0.0.1:4173` öffnen.

## Langfristige Zielstruktur

```text
apps/
  lebtig/
  mcello/
packages/
  core/
  auth/
  cms/
  menu-engine/
  ordering/
  notifications/
  kds/
skills/
docs/
data/
```

Die ausführbare PWA ist bewusst provider-neutral. Der nächste Integrationsslice ersetzt/erweitert den statischen Server durch die portable TanStack-Start/Supabase-Anwendung, ohne die Domain-Pakete neu zu schreiben.
