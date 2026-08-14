$ErrorActionPreference = 'Stop'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is required. Install/start Docker Desktop or another Docker-compatible runtime first.'
}

if (-not (Test-Path 'supabase/config.toml')) {
  Write-Host 'Initializing local Supabase configuration...'
  npx supabase init
}

Write-Host 'Starting local Supabase stack...'
npx supabase start

Write-Host ''
Write-Host 'Applying repository migrations to the local database...'
npx supabase db reset --local --no-seed

Write-Host ''
Write-Host 'Local backend is ready. Run `npx supabase status` for URLs and local publishable keys.'
