#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_business-web-factory}"
SCHEMA="mcello_release_restore_drill"
DUMP="/tmp/mcello-release-restore-drill.dump"
SENTINEL="restore-ok-20260815"

cleanup() {
  docker exec "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "drop schema if exists $SCHEMA cascade" >/dev/null 2>&1 || true
  docker exec "$DB_CONTAINER" rm -f "$DUMP" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup

docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL
create schema $SCHEMA;
create table $SCHEMA.restore_probe (
  id integer primary key,
  marker text not null,
  created_at timestamptz not null default now()
);
insert into $SCHEMA.restore_probe(id, marker) values (1, '$SENTINEL');
SQL

docker exec "$DB_CONTAINER" pg_dump \
  -U postgres \
  -d postgres \
  --format=custom \
  --no-owner \
  --schema="$SCHEMA" \
  --file="$DUMP"

docker exec "$DB_CONTAINER" pg_restore --list "$DUMP" >/dev/null

docker exec "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "drop schema $SCHEMA cascade" >/dev/null

docker exec "$DB_CONTAINER" pg_restore \
  -U postgres \
  -d postgres \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "$DUMP"

actual="$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -Atc "select marker from $SCHEMA.restore_probe where id=1")"
[[ "$actual" == "$SENTINEL" ]] || {
  echo "restore sentinel mismatch: $actual" >&2
  exit 1
}

printf 'Self-host Postgres dump/restore drill passed: %s\n' "$actual"
