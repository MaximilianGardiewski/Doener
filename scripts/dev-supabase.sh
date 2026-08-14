#!/usr/bin/env bash
set -euo pipefail

command -v docker >/dev/null 2>&1 || { echo 'Docker is required.' >&2; exit 1; }

if [ ! -f supabase/config.toml ]; then
  echo 'Initializing local Supabase configuration...'
  npx supabase init
fi

echo 'Starting local Supabase stack...'
npx supabase start

echo 'Applying repository migrations to the local database...'
npx supabase db reset --local --no-seed

echo 'Local backend is ready. Run `npx supabase status` for URLs and local publishable keys.'
