$ErrorActionPreference = 'Stop'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is required. Install/start Docker Desktop or another Docker-compatible runtime first.'
}

Write-Host 'Starting local Supabase stack...'
npx --yes supabase@latest start

Write-Host ''
Write-Host 'Applying repository migrations and development seed...'
npx --yes supabase@latest db reset --local

# Realtime may have started before db reset rebuilt the publication. Its CDC
# poller caches publication table OIDs, so restart only Realtime after the
# migrations instead of waiting for its periodic publication refresh.
$realtimeContainer = docker ps --format '{{.Names}}' | Where-Object { $_ -like 'supabase_realtime_*' } | Select-Object -First 1
if ($realtimeContainer) {
  Write-Host "Restarting local Realtime after schema rebuild ($realtimeContainer)..."
  docker restart $realtimeContainer | Out-Null
  Start-Sleep -Seconds 2
}

Write-Host ''
Write-Host 'Writing local API credentials to ignored .env.local...'
$envOutput = npx --yes supabase@latest status -o env `
  --override-name api.url=SUPABASE_URL `
  --override-name auth.anon_key=SUPABASE_ANON_KEY `
  --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY
$envOutput | Set-Content -Encoding utf8 '.env.local'

Write-Host 'Importing provisional Mcello menu (owner confirmation remains required)...'
node scripts/import-provisional-menu.mjs

Write-Host 'Preparing random local-only admin + KDS staff credentials...'
node scripts/bootstrap-local-staff.mjs

Write-Host ''
Write-Host 'Local Mcello backend is ready.'
Write-Host 'Start the app with: npm run preview:mcello'
Write-Host 'Public: http://127.0.0.1:4173'
Write-Host 'KDS: http://127.0.0.1:4173/kds.html'
Write-Host 'Betrieb: http://127.0.0.1:4173/ops.html'
Write-Host 'Admin: http://127.0.0.1:4173/admin.html'
Write-Host 'Stop Supabase after development with: npx --yes supabase@latest stop'
