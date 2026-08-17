# Mcello Self-Host Release Runbook

Stand: 2026-08-15

Ziel ist ein reproduzierbarer Mcello-Release auf einem eigenen Linux-Server, ohne Lovable-/Vercel-Runtime-Abhängigkeit und ohne den lokalen Supabase-CLI-Stack ins Internet zu stellen.

Dieses Verzeichnis enthält **unsere** App-, Release-, Backup- und Prüfgrenzen. Die offizielle Supabase-Docker-Konfiguration wird nicht dauerhaft vendort, sondern für jede Staging-/Production-Basis aus einem **explizit geprüften und gepinnten Upstream-Commit/Tag** bezogen.

## Aktuelle Supabase-Baseline

Vor jedem Upgrade den Supabase-Changelog prüfen. Für die aktuelle 2026-Baseline sind insbesondere relevant:

- Self-hosted Supabase verwendet inzwischen Postgres 17 als Default. Ein bestehendes PG15-Datenverzeichnis darf nicht einfach mit dem PG17-Image gestartet werden.
- Envoy (`api-gw` / `supabase-envoy`) ersetzt Kong als Default-API-Gateway. Kong bleibt nur ein Kompatibilitäts-Override.
- `API_EXTERNAL_URL` enthält den `/auth/v1`-Prefix.
- Production benötigt TLS vor dem API-Gateway. Die offiziellen Docker-Dateien bringen Caddy-/Nginx-Overrides mit; WebSocket-Unterstützung für Realtime muss erhalten bleiben.
- Self-hosting bedeutet: Backups, Restore, Updates, Monitoring und Security-Hardening liegen bei uns.

Offizielle Referenzen:

- https://supabase.com/docs/guides/self-hosting
- https://supabase.com/docs/guides/self-hosting/docker
- https://supabase.com/docs/guides/self-hosting/self-hosted-proxy-https
- https://supabase.com/changelog?tags=self-hosted

## 1. Server-Grundlage

Empfohlene Trennung auf dem Host:

```text
/opt/mcello/
  app/                 # Git checkout dieses Repositories
  supabase-upstream/   # gepinnter Supabase-Upstream
  supabase-project/    # aktive Docker-Konfiguration + .env
  backups/             # lokale verschlüsselte Zwischenablage, zusätzlich off-host
```

Vor Internet-Exposure:

- Linux und Docker Engine/Compose aktuell patchen.
- SSH nur mit Keys, idealerweise IP-/VPN-beschränkt.
- Öffentlich nur 80/443 öffnen.
- PostgreSQL 5432, Supabase Gateway-Port 8000 und Studio **nicht** frei ins Internet stellen.
- Studio/Admin bevorzugt nur über VPN/private Netzgrenze erreichbar machen.
- Host-Firewall plus Provider-Firewall verwenden, falls vorhanden.
- NTP/Zeitsynchronisation aktiv halten.
- Ausreichend SSD-Platz plus Alarmierung für freien Speicher vorsehen.

## 2. Supabase reproduzierbar beziehen

Nicht blind `master` aktualisieren. Zuerst in Staging einen konkreten Supabase-Commit/Tag prüfen und diesen Wert dokumentieren.

Beispiel:

```bash
cd /opt/mcello
git clone https://github.com/supabase/supabase.git supabase-upstream
cd supabase-upstream
git checkout <REVIEWED_SUPABASE_COMMIT_OR_TAG>

mkdir -p /opt/mcello/supabase-project
cp -rf docker/* /opt/mcello/supabase-project/
```

Danach Keys/Secrets ausschließlich mit der zu **diesem** Upstream gehörenden offiziellen Utility erzeugen. Keine Example-Secrets verwenden.

Wichtige URL-Werte in `supabase-project/.env`:

```text
SUPABASE_PUBLIC_URL=https://api.<domain>
API_EXTERNAL_URL=https://api.<domain>/auth/v1
SITE_URL=https://<public-mcello-domain>
```

Die App nutzt aktuell die weiterhin unterstützten Legacy-JWT-Keys `ANON_KEY` und `SERVICE_ROLE_KEY` als `SUPABASE_ANON_KEY` bzw. `SUPABASE_SERVICE_ROLE_KEY`. Self-hosted Supabase kann diese parallel zu den neuen `sb_publishable_*`/`sb_secret_*` Keys betreiben. Die opaque-key Runtime-Migration ist bewusst ein eigener Compatibility-Slice und kein stiller Secret-Austausch.

## 3. TLS / Reverse Proxy

Supabase hinter den offiziellen Caddy- oder Nginx-Override stellen; nicht den Gateway-Port direkt veröffentlichen. Bei einem vorhandenen Reverse Proxy gelten mindestens:

- TLS-Zertifikat mit automatischer Erneuerung.
- HTTP -> HTTPS Redirect.
- WebSocket Upgrade/Forwarding für Realtime.
- `X-Forwarded-*` Header korrekt setzen.
- Gateway-internen HTTP-Port nur im Docker-/Host-Netz halten.

Die Mcello-App aus `compose.app.yml` bindet absichtlich nur an:

```text
127.0.0.1:4173
```

Der öffentliche Reverse Proxy terminiert TLS und proxyt auf diesen Loopback-Port. Dadurch ist Node nicht direkt aus dem Internet erreichbar.

## 4. App-Environment

```bash
cd /opt/mcello/app
cp infra/selfhost/app.env.example infra/selfhost/app.env
chmod 600 infra/selfhost/app.env
vim infra/selfhost/app.env
```

Vor jedem Production-Release:

```bash
bash infra/selfhost/preflight.sh infra/selfhost/app.env
```

Der Preflight verweigert unter anderem:

- HTTP/localhost als öffentliche URLs,
- Example-/Placeholder-Werte,
- zu kurze API-Key-Werte,
- bezahlte Messaging-Konfiguration ohne `ALLOW_PAID_MESSAGING=YES`,
- einen veränderten tracked Git-Checkout,
- fehlendes Docker Compose v2.

## 5. Migrationen aus Git

Die Migrationen unter `supabase/migrations/` sind die kanonische Schema-Historie. Self-hosted Releases werden per direkter DB-URL gefahren; ein Managed-Supabase-Link ist nicht erforderlich.

Zuerst immer nur planen:

```bash
export DATABASE_URL='postgresql://...'
bash infra/selfhost/apply-migrations.sh
```

Das führt `supabase db push --db-url ... --dry-run` aus.

Erst nach Backup, Review und freigegebenem Wartungsfenster:

```bash
export APPLY_MIGRATIONS=YES
bash infra/selfhost/apply-migrations.sh
```

Der Script-Ende zeigt anschließend die Migration-Historie. `db reset` gehört **nicht** in Production.

## 6. App bauen/starten

Auf einem exakt gewählten Git-Commit/Tag:

```bash
git status --short
git rev-parse HEAD

MCELLO_APP_ENV_FILE=./infra/selfhost/app.env \
  docker compose -f infra/selfhost/compose.app.yml build --pull mcello-app

MCELLO_APP_ENV_FILE=./infra/selfhost/app.env \
  docker compose -f infra/selfhost/compose.app.yml up -d mcello-app
```

Die App läuft im Container:

- als User `node`,
- mit read-only Root-Filesystem,
- ohne Linux-Capabilities,
- mit `no-new-privileges`,
- mit kleinem `/tmp` tmpfs,
- mit Docker-Healthcheck auf `/api/health`.

Für einen streng reproduzierbaren Release zusätzlich die resultierende Image-ID/Digest zusammen mit Git-SHA und gepinntem Supabase-Upstream-SHA im Release-Protokoll festhalten.

## 7. Backup

### Datenbank

```bash
export DATABASE_URL='postgresql://...'
export BACKUP_ROOT=/opt/mcello/backups
export GIT_COMMIT="$(git rev-parse HEAD)"
bash infra/selfhost/backup-db.sh
```

Erzeugt pro Lauf:

```text
<timestamp>/database.dump
<timestamp>/globals.sql
<timestamp>/SHA256SUMS
<timestamp>/README.txt
```

Dateirechte entstehen mit `umask 077`.

### Zusätzlich zwingend sichern

Der logische DB-Dump enthält **nicht** automatisch:

- Supabase Storage Objektbytes/Volume,
- `.env`/Secrets,
- TLS Private Keys,
- gegebenenfalls für Vault/verschlüsselte Inhalte erforderliche Volume-/Encryption-Keys.

Diese Daten separat nach der eingesetzten offiziellen Supabase-Docker-Version sichern. Mindestens eine Kopie muss verschlüsselt und **off-host** liegen. Backup-Retention und Löschfristen dokumentieren.

## 8. Restore-Drill

Ein Backup ist erst belastbar, wenn ein Restore funktioniert.

Niemals in die Quelle zurückrestoren. Eine frische, disposable **gleiche Supabase/Postgres-Version** als Drill-/Staging-Ziel bereitstellen und dann:

```bash
export RESTORE_DATABASE_URL='postgresql://.../mcello_restore_drill'
export BACKUP_FILE='/opt/mcello/backups/<timestamp>/database.dump'
export ALLOW_DESTRUCTIVE_RESTORE_TEST=YES
bash infra/selfhost/restore-drill.sh
```

Der Script verweigert Ziele, die nicht sichtbar `restore`, `drill` oder `staging` heißen, verweigert Source==Target, nutzt `pg_restore --exit-on-error` und prüft anschließend `public.orders`.

GitHub Actions führt zusätzlich bei jedem relevanten Infrastruktur-Change einen echten `pg_dump -> DROP -> pg_restore -> Sentinel` Roundtrip im Supabase-Postgres aus (`tests/selfhost-backup-restore.integration.sh`).

Für Production-Readiness trotzdem regelmäßig einen vollständigen Staging-DR-Drill inklusive Storage-Dateien und Operator-Login durchführen und Ergebnis/Datum protokollieren.

## 9. Monitoring

Minimaler externer Probe:

```bash
export MCELLO_PUBLIC_URL='https://<public-mcello-domain>'
export SUPABASE_PUBLIC_URL='https://api.<domain>'
export MIN_FREE_PERCENT=15
bash infra/selfhost/healthcheck.sh
```

Überwachen/alerten:

- Mcello `/api/health`,
- Supabase TLS/Gateway/Auth-Erreichbarkeit,
- Docker Container Health/Restarts,
- Host CPU/RAM/Load,
- Disk frei/inodes,
- Backup-Alter und letzte erfolgreiche Restore-Übung,
- TLS-Zertifikat-Ablauf,
- relevante Container-/Reverse-Proxy-Fehlerlogs.

Optional kann der offizielle self-hosted Logs-Override von Supabase verwendet werden; er ist nicht Teil des Default-Stacks und benötigt zusätzliche Ressourcen.

## 10. Release-Reihenfolge

1. Changelog + gepinnten Supabase-Upstream prüfen.
2. Git-Commit für Mcello festlegen; Working Tree sauber.
3. Production-Preflight.
4. Aktuelles DB- und Storage-Backup erstellen + Checksummen prüfen.
5. Migration-Dry-Run prüfen.
6. Freigegebene Migrationen anwenden.
7. App-Image aus dem freigegebenen Git-Commit bauen.
8. App neu starten.
9. `/api/health`, Public Page, Supabase-Gateway und Realtime prüfen.
10. KDS/Admin nur intern prüfen.
11. Monitoring/Backup-Jobs kontrollieren.
12. Release-SHA, Image-Digest, Supabase-Upstream-SHA und Ergebnis protokollieren.

## Rollback-Grundsatz

- **App:** vorherige Git-/Image-Version wieder starten.
- **DB:** keine improvisierten Reverse-Migrationen. Bei destruktiver/inkompatibler Migration aus dem geprüften Backup in den vorgesehenen Restore-Prozess zurückkehren.
- **Supabase Upgrade:** nur nach Staging-Test und entsprechendem offiziellen Upgrade-/Rollback-Verfahren; insbesondere PG15 -> PG17 niemals durch simplen Image-Wechsel.

Dieses Runbook deployt nichts automatisch nach Production. Es definiert und testet den reproduzierbaren Pfad, den ein freigegebener Release später benutzt.
