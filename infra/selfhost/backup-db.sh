#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_ROOT="${BACKUP_ROOT:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_ROOT/$STAMP"

command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump is required" >&2; exit 1; }
command -v pg_dumpall >/dev/null 2>&1 || { echo "pg_dumpall is required" >&2; exit 1; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required" >&2; exit 1; }

umask 077
mkdir -p "$TARGET"

pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --file="$TARGET/database.dump"

pg_dumpall \
  --dbname="$DATABASE_URL" \
  --globals-only \
  --no-role-passwords \
  > "$TARGET/globals.sql"

(
  cd "$TARGET"
  sha256sum database.dump globals.sql > SHA256SUMS
)

cat > "$TARGET/README.txt" <<EOF
Mcello logical database backup
Created UTC: $STAMP
Git commit: ${GIT_COMMIT:-unknown}

This archive does NOT contain Supabase Storage object bytes, server environment
secrets, TLS private keys, or any Docker volume encryption key. Back those up
separately according to the self-host runbook and keep all copies encrypted and
off-host.
EOF

printf 'Backup created: %s\n' "$TARGET"
printf 'Verify with: (cd %q && sha256sum -c SHA256SUMS)\n' "$TARGET"
