#!/usr/bin/env bash
set -euo pipefail

command -v docker >/dev/null 2>&1 || { echo 'Docker is required.' >&2; exit 1; }

SUPABASE="npx --yes supabase@latest"

echo 'Starting local Supabase stack...'
$SUPABASE start

echo 'Applying repository migrations and development seed...'
$SUPABASE db reset --local

# Realtime may have started before db reset rebuilt the publication. The CDC
# poller caches publication table OIDs, so restart only the local Realtime
# container after migrations to make postgres_changes available immediately.
REALTIME_CONTAINER="$(docker ps --format '{{.Names}}' | grep '^supabase_realtime_' | head -n1 || true)"
if [[ -n "$REALTIME_CONTAINER" ]]; then
  echo "Restarting local Realtime after schema rebuild ($REALTIME_CONTAINER)..."
  docker restart "$REALTIME_CONTAINER" >/dev/null
  sleep 2
fi

echo 'Writing local API credentials to ignored .env.local...'
$SUPABASE status -o env \
  --override-name api.url=SUPABASE_URL \
  --override-name auth.anon_key=SUPABASE_ANON_KEY \
  --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY \
  > .env.local

MCELLO_LOCATION_ID="${MCELLO_LOCATION_ID:-00000000-0000-4000-8000-000000000001}"
MCELLO_MENU_SEED_NAMESPACE="${MCELLO_MENU_SEED_NAMESPACE:-mcello}"
printf 'MCELLO_LOCATION_ID=%s\nMCELLO_MENU_SEED_NAMESPACE=%s\n' \
  "$MCELLO_LOCATION_ID" "$MCELLO_MENU_SEED_NAMESPACE" >> .env.local
export MCELLO_LOCATION_ID MCELLO_MENU_SEED_NAMESPACE

echo 'Importing provisional Mcello menu (owner confirmation remains required)...'
node scripts/import-provisional-menu.mjs

echo 'Preparing random local-only admin + KDS staff credentials...'
node scripts/bootstrap-local-staff.mjs

echo ''
echo 'Local Mcello backend is ready.'
echo 'Start the app with: npm run preview:mcello'
echo 'Open: http://127.0.0.1:4173'
echo 'KDS: http://127.0.0.1:4173/kds.html'
echo 'Betrieb: http://127.0.0.1:4173/ops.html'
echo 'Admin: http://127.0.0.1:4173/admin.html'
echo 'Stop Supabase after development with: npx --yes supabase@latest stop'
