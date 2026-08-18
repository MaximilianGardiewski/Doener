# Lebtig — Schema-/RLS-Vergleich

Stand: 2026-08-18

Basis: verifizierter Lebtig-Donor-Snapshot `abb54c73f42b784d7c66cd1e1d468b532a67f065`, neun Donor-Migrationen vom 14.08.2026 sowie die bereits portierten BusinessWebFactory-Auth-/CMS-/Media-Contracts.

Dieses Dokument ist **kein** Production-Migrationsplan und bestätigt **keine** Business-Inhalte. Es beschreibt den effektiven technischen Donor-Zustand und die sichere Portierungsgrenze.

## Harte Migrationsgrenze

Lebtig erhält eine **eigene app-spezifische Supabase/Postgres-Migrationshistorie unter `apps/lebtig/supabase/`**. Die vorhandene Root-Historie `supabase/migrations/` bleibt Mcello/V1 zugeordnet und wird nicht mit den neun historischen Lebtig-Donor-Migrationen vermischt.

Die Donor-Historie wird nicht 1:1 kopiert. Für Lebtig wird aus dem **effektiven Endzustand** eine reviewbare Clean-Install-Baseline abgeleitet und anschließend gegen lokale RLS-/Rollen-Tests geprüft.

## Effektiver Donor-Scope

### Rollen und Profile

- Rollen-Enum: `admin | moderator`
- `profiles`
- `user_roles`
- `has_role(user_id, role)`
- `is_staff()` für `admin` und `moderator`
- Bootstrap-Trigger für das erste Admin-Konto
- Schutz gegen Entfernen/Ändern der letzten Admin-Rolle
- späterer Signup erhält **nicht automatisch** Moderatorrechte

### CMS / Public Content

- `site_settings`
- `pages`
- `lunch_weeks` + `lunch_items`
- `offer_weeks` + `offer_items`
- `news`
- `recipes`
- `party_requests`

### Media

- `media`-Metadaten
- Storage-Bucket-Verträge für `media`
- Storage-Objekte sind staff-only; öffentliche Auslieferung muss über die app-owned stabile `/media/:id`-Grenze erfolgen.

## Relevante nachträgliche Security-Korrekturen im Donor

Die Donor-Historie enthält mehrere Korrekturen, die in einer Clean-Install-Baseline **direkt im sicheren Endzustand** landen müssen:

1. `has_role` und `is_staff` sind nicht für `anon/public` ausführbar; nur `authenticated` erhält die nötigen Execute-Rechte.
2. Trigger-/Helper-Funktionen wie `handle_new_user`, `protect_last_admin` und `touch_updated_at` sind nicht direkt durch Clients ausführbar.
3. Das erste Admin-Bootstrap wird mit Advisory Lock gegen parallele Signups serialisiert.
4. Nach geschlossenem Bootstrap erhalten neue Benutzer **keine automatische Redaktionsrolle**.
5. `is_bootstrap_open()` ist im finalen Zustand nicht anonym ausführbar; der Status muss serverseitig abgefragt und als minimaler Boolean an die Auth-UI gegeben werden.
6. `lunch_items` und `offer_items` sind anonym nur lesbar, wenn die jeweilige Parent-Woche veröffentlicht und zeitlich sichtbar ist; ein pauschales `using (true)` ist nicht zulässig.
7. Profile sind für Mitarbeitende bzw. den eigenen Benutzer lesbar; eigener Profile-Insert/Update ist an `auth.uid()` gebunden.
8. Die letzte Admin-Rolle ist zusätzlich auf DB-Ebene vor Update/Delete geschützt.

## Rollenmatrix für die Portierung

| Bereich | anon | authenticated ohne Rolle | moderator | admin |
| --- | --- | --- | --- | --- |
| veröffentlichte Public-Inhalte lesen | ja | nicht als Redaktionsrecht | ja | ja |
| eigene Profildaten | nein | eigenes Profil | eigenes Profil | eigenes Profil |
| Lunch/Offers/News/Recipes bearbeiten | nein | nein | ja | ja |
| freie Pages / Navigation / Settings strukturell verwalten | nein | nein | nein | ja |
| Media verwalten | nein | nein | ja | ja |
| Party-Anfrage anlegen | ja | ja | ja | ja |
| Party-Anfragen lesen/status/notiz | nein | nein | ja | ja |
| Party-Anfragen löschen | nein | nein | nein | ja |
| Rollen/Benutzer verwalten | nein | nein | nein | ja |

Die Matrix folgt den bereits portierten Lebtig-Rollencontracts; UI-Guards ersetzen die RLS-Policies nicht.

## Donor-Seed ist keine Production-Wahrheit

Eine Donor-Migration enthält Business-Settings, Öffnungszeiten, Kontaktangaben, WhatsApp-/Telefonwerte, Beispiel-Mittagstisch, Wochenangebote, News, Rezepte und eine Beispiel-CMS-Seite. Diese Daten sehen teilweise real aus, sind im Repo aber **nicht als owner-bestätigte Production-Fakten belegt**.

Daher gilt:

- kein automatischer Import dieses Seed-Blocks in die Clean-Install-Migration;
- keine Übernahme als Production-Default;
- strukturierte Beispieldaten dürfen höchstens separat als eindeutig gekennzeichnete Test-/Dev-Fixture entstehen;
- echte Business-Daten werden erst nach belegter Herkunft/Freigabe integriert.

## Nächster Implementierungsschritt

1. app-spezifische `apps/lebtig/supabase/`-Struktur anlegen;
2. Clean-Install-Baseline aus dem effektiven Endzustand erstellen, ohne Business-Seed;
3. lokale Rollen-/RLS-Testmatrix für anon, authenticated-no-role, moderator und admin;
4. Storage-Policies und stabile `/media/:id`-Auslieferung getrennt testen;
5. erst danach den ersten CMS-Vertical-Slice (Login → Edit → Preview → Publish → Public Read → Archive/Copy) an Persistenz anbinden.

Kein Managed-Supabase-Projekt, keine Production-Mutation und keine neue Providerkosten sind für diesen Schritt erforderlich.
