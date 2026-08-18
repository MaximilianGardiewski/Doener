# Lebtig Supabase/Postgres Boundary

Dieser Ordner ist die app-spezifische Datenbankgrenze für Lebtig.

## Warum separat?

Die Root-Historie `supabase/migrations/` gehört zur bestehenden Mcello/V1-Datenbankgeschichte. Lebtig hat einen eigenen Donor-Schema-Verlauf mit anderem Rollenmodell (`admin | moderator`) und anderen CMS-/Media-Tabellen. Die Historien werden deshalb nicht vermischt.

## Portierungsregel

- keine der historischen Donor-Migrationen wird blind kopiert;
- die erste Lebtig-Migration wird als Clean-Install-Baseline aus dem verifizierten **effektiven Endzustand** erstellt;
- Business-/Seed-Inhalte werden nicht Teil der Schema-Baseline;
- RLS, Grants, SECURITY-DEFINER-Funktionen, Trigger und Storage-Policies werden lokal als effektive DB-Sicherheit getestet;
- `anon`, `authenticated` ohne Rolle, `moderator` und `admin` müssen explizit gegengeprüft werden;
- Production-Migrationen oder Managed-Supabase-Mutationen benötigen weiterhin separate Freigabe.

Siehe `docs/projects/lebtig/SCHEMA_RLS_COMPARE.md` für das aktuelle Inventar und die abgeleitete Rollenmatrix.
