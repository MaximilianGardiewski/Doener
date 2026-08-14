$ErrorActionPreference = 'Stop'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is required. Install/start Docker Desktop or another Docker-compatible runtime first.'
}

Write-Host 'Starting local Supabase stack...'
npx --yes supabase@latest start

Write-Host ''
Write-Host 'Applying repository migrations and development seed...'
npx --yes supabase@latest db reset --local

Write-Host ''
Write-Host 'Writing local API credentials to ignored .env.local...'
$envOutput = npx --yes supabase@latest status -o env `
  --override-name api.url=SUPABASE_URL `
  --override-name auth.anon_key=SUPABASE_ANON_KEY `
  --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY
$envOutput | Set-Content -Encoding utf8 '.env.local'

Write-Host 'Importing provisional Mcello menu (owner confirmation remains required)...'
node scripts/import-provisional-menu.mjs

Write-Host 'Preparing random local-only KDS staff credentials...'
node scripts/bootstrap-local-staff.mjs

Write-Host ''
Write-Host 'Local Mcello backend is ready.'
Write-Host 'Start the app with: npm run preview:mcello'
Write-Host 'Open: http://127.0.0.1:4173'
Write-Host 'Stop Supabase after development with: npx --yes supabase@latest stop'
