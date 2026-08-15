#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to the self-hosted Postgres database}"

command -v supabase >/dev/null 2>&1 || {
  echo "Supabase CLI is required" >&2
  exit 1
}

printf '%s\n' '--- Supabase CLI ---'
supabase --version
printf '%s\n' '--- Migration plan ---'
supabase db push --db-url "$DATABASE_URL" --dry-run

if [[ "${APPLY_MIGRATIONS:-NO}" != "YES" ]]; then
  echo "Dry-run complete. Set APPLY_MIGRATIONS=YES to apply the pending migrations."
  exit 0
fi

printf '%s\n' '--- Applying migrations ---'
supabase db push --db-url "$DATABASE_URL"
printf '%s\n' '--- Migration history ---'
supabase migration list --db-url "$DATABASE_URL"
