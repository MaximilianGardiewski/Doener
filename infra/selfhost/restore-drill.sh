#!/usr/bin/env bash
set -euo pipefail

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL must point to a disposable same-version Supabase database}"
: "${BACKUP_FILE:?BACKUP_FILE must point to database.dump}"

[[ "${ALLOW_DESTRUCTIVE_RESTORE_TEST:-NO}" == "YES" ]] || {
  echo "Refusing destructive restore. Set ALLOW_DESTRUCTIVE_RESTORE_TEST=YES." >&2
  exit 1
}

command -v pg_restore >/dev/null 2>&1 || { echo "pg_restore is required" >&2; exit 1; }
[[ -f "$BACKUP_FILE" ]] || { echo "Backup file not found: $BACKUP_FILE" >&2; exit 1; }

case "$RESTORE_DATABASE_URL" in
  *restore*|*drill*|*staging*) ;;
  *)
    echo "Restore target URL must visibly identify a restore/drill/staging database." >&2
    exit 1
    ;;
esac

if [[ -n "${DATABASE_URL:-}" && "$DATABASE_URL" == "$RESTORE_DATABASE_URL" ]]; then
  echo "Restore target must not equal the source database." >&2
  exit 1
fi

pg_restore --list "$BACKUP_FILE" >/dev/null
pg_restore \
  --dbname="$RESTORE_DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "$BACKUP_FILE"

psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc \
  "select case when to_regclass('public.orders') is null then 0 else 1 end" \
  | grep -Fx 1 >/dev/null

printf '%s\n' 'Restore drill completed and public.orders is present.'
