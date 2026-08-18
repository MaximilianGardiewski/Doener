# Mcello V1 — Database Migration Audit

Stand: 2026-08-18

## Ziel

Dieser Audit bewertet die aktuelle Supabase/PostgreSQL-Migrationshistorie vor dem ersten echten Production-Deploy. Er dient ausdrücklich **nicht** dazu, die bisherige Historie zu vernichten oder Migrationen blind zu squashen.

Die bestehende Historie bleibt die nachvollziehbare Entwicklungs- und Sicherheitsreferenz. Eine eventuell später erzeugte V1-Baseline wäre ausschließlich ein zusätzlicher, sauberer Installationsstartpunkt für neue Instanzen.

## Reproduzierbarer Audit

```bash
npm run audit:db
```

Das Script `scripts/audit-db-v1.mjs` inventarisiert alle Dateien unter `supabase/migrations/`, prüft harte Dateihygiene und zeigt historische Function-Neudefinitionen sowie den `SECURITY DEFINER`-Umfang an.

Der Audit ist Bestandteil von `npm run check` und damit CI-pflichtig.

## Ergebnis vom 18.08.2026

| Metrik | Ergebnis |
|---|---:|
| SQL-Migrationen | 41 |
| Größe der Historie | 304559 Bytes |
| Erste Migration | `20260814190100_platform_core_part1.sql` |
| Letzte Migration | `20260818010000_product_media_backoffice.sql` |
| In der Historie erzeugte Tabellen | 28 |
| In der Historie erzeugte Types | 7 |
| Unterschiedliche definierte Functions | 97 |
| Function-Definitionen insgesamt | 126 |
| Später erneut definierte Functions | 18 |
| `SECURITY DEFINER`-Vorkommen | 118 |
| Fehlerhafte Migrationsdateinamen | 0 |
| Doppelte Migrationstimestamps | 0 |

## Wichtigste Befunde

### 1. Die Migrationshistorie ist formal gesund

Alle 41 Migrationen besitzen einen eindeutigen 14-stelligen Timestamp und einen gültigen Dateinamen. Es gibt keine doppelten Migrationstimestamps.

Zusätzlich wurde die Historie bereits wiederholt durch die Self-host DB-Drills geprüft: leerer Rebuild aus Git-Migrationen, direkter `supabase db push --db-url ... --dry-run` sowie ein echter `pg_dump -> DROP -> pg_restore`-Roundtrip sind grün.

**Folgerung:** Es gibt keinen Grund, die existierende Historie aus Reparaturgründen zu löschen oder neu zu schreiben.

### 2. Die Historie ist inzwischen konsolidierungswürdig

18 Functions wurden im Verlauf der schnellen V1-Entwicklung mehrfach neu definiert. Das ist für die Entwicklungsphase funktional legitim, macht den finalen Datenbankvertrag aber schwerer zu lesen und zu auditieren.

Größte Hotspots:

| Function | Historische Definitionen |
|---|---:|
| `get_public_menu` | 5 |
| `admin_get_catalog` | 3 |
| `get_public_order_status` | 3 |
| `server_claim_notification_outbox` | 3 |
| `server_create_verified_order` | 3 |
| `server_get_checkout_product` | 3 |
| `server_get_shop_state` | 3 |
| `staff_accept_order` | 3 |
| `staff_set_shop_override` | 3 |
| `get_public_content` | 2 |
| `get_public_media_descriptor` | 2 |
| `get_public_shop_state` | 2 |
| `protect_web_order_gate` | 2 |
| `protect_web_order_item_availability` | 2 |
| `server_get_pending_order_edit_context` | 2 |
| `server_get_slot_capacity` | 2 |
| `server_replace_pending_order` | 2 |
| `server_shop_accepts_order` | 2 |

Besonders `get_public_menu` wurde durch Allergene, Content Snapshot, Gallery Media und Product Media schrittweise erweitert und liegt deshalb in fünf historischen Fassungen vor.

**Folgerung:** Vor dem ersten Production-Deploy ist eine separate, saubere Clean-Install-V1-Baseline für neue Installationen sinnvoll zu prüfen.

### 3. `SECURITY DEFINER` bleibt eine große Sicherheitsoberfläche

Der historische SQL-Stand enthält 118 `SECURITY DEFINER`-Vorkommen. Diese Zahl ist kein Fehler an sich: Viele privilegierte RPC-Grenzen sind absichtlich datenbankseitig gekapselt.

Sie bedeutet aber, dass die bestehenden Regeln zwingend erhalten bleiben:

- keine impliziten Public-/Anon-Rechte,
- explizites `REVOKE`/`GRANT`,
- enger `search_path`,
- rollen- und locationspezifische Autorisierung,
- CI-/Integrationstests für Admin/Staff/Service-/Public-Grenzen.

Der reine Audit zählt diese Oberfläche nur. Die vorhandenen Schema-/RLS-/Security-Definer-Tests bleiben die Autorität für die tatsächliche Privilegienkorrektheit.

## Empfehlung für eine V1-Baseline

Vor dem ersten echten Production-Deploy soll entschieden werden, ob zusätzlich zur Historie eine **Clean-Install-V1-Baseline** für neue Instanzen erzeugt wird.

Dabei gelten folgende Regeln:

1. **Historische Migrationen bleiben erhalten und referenzierbar.** Keine destruktive Bereinigung der Entwicklungsgeschichte.
2. Eine Baseline ist ein zusätzlicher Installationspfad, kein Ersatz für die Audit-Historie.
3. Die Baseline muss den finalen Schema-/Function-/Grant-/RLS-/Storage-Vertrag abbilden, nicht einfach Textfragmente der 41 Dateien aneinanderhängen.
4. Vor Freigabe muss die Baseline mindestens bestehen:
   - leerer Datenbank-Rebuild,
   - Schema-/RLS-/Security-Guards,
   - kompletter Supabase-Integrationstest,
   - Self-host `db push --dry-run`,
   - echter Backup-/Restore-Drill,
   - Vergleich der relevanten finalen Functions/Constraints/Policies mit dem historisch aufgebauten Schema.
5. Bestehende Installationen dürfen niemals still auf eine Baseline umgestellt werden, wenn sie bereits Migrationshistorie besitzen.
6. Vor dem ersten Production-Deploy bleibt die bestehende 41-Migrationen-Kette der kanonische, vollständig getestete Installationspfad, solange die neue Baseline nicht separat bewiesen wurde.

## Entscheidung aus diesem Audit

**Kein Squash und keine Löschung der bisherigen Migrationen.**

Die Historie ist technisch gesund, aber durch 18 mehrfach definierte Functions bereits komplex genug, dass eine zusätzliche Clean-Install-Baseline vor dem ersten Production-Deploy einen echten Wartungs- und Auditvorteil bieten kann.

Bis eine solche Baseline separat implementiert und vollständig verifiziert ist, bleibt die vorhandene Migrationskette unverändert die Source of Truth.
