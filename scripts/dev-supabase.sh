#!/usr/bin/env bash
set -euo pipefail

command -v docker >/dev/null 2>&1 || { echo 'Docker is required.' >&2; exit 1; }

SUPABASE="npx --yes supabase@latest"

echo 'Starting local Supabase stack...'
$SUPABASE start

echo 'Applying repository migrations and development seed...'
$SUPABASE db reset --local

echo 'Writing local API credentials to ignored .env.local...'
$SUPABASE status -o env \
  --override-name api.url=SUPABASE_URL \
  --override-name auth.anon_key=SUPABASE_ANON_KEY \
  --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY \
  > .env.local

echo 'Preparing random local-only KDS staff credentials...'
node scripts/bootstrap-local-staff.mjs

echo ''
echo 'Local Mcello backend is ready.'
echo 'Start the app with: npm run preview:mcello'
echo 'Open: http://127.0.0.1:4173'
echo 'Stop Supabase after development with: npx --yes supabase@latest stop'
