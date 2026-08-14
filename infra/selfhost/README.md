# Self-hosted Mcello backend

This directory documents the zero-additional-cost production path.

## Target

Run the Mcello application and a self-hosted Supabase stack on an existing Linux server. Do **not** expose the local-development Supabase CLI stack to the public internet.

Supabase recommends Docker for self-hosting. Use the official Docker configuration as the upstream source instead of copying a stale vendor snapshot permanently into this repository.

## Bootstrap outline

On the target Linux host:

```bash
# 1. Install/verify Git, Docker Engine and Docker Compose.
# 2. Create an isolated deployment directory outside the Git checkout.
mkdir -p /opt/mcello
cd /opt/mcello

# 3. Fetch the current official Supabase Docker self-host configuration.
git clone --depth 1 https://github.com/supabase/supabase.git upstream-supabase
mkdir -p supabase-project
cp -rf upstream-supabase/docker/* supabase-project/

# 4. Configure production secrets and URLs in supabase-project/.env.
# Never commit that file.

# 5. Start only after the environment, firewall, TLS and backup plan are reviewed.
cd supabase-project
docker compose pull
docker compose up -d
```

Then apply this repository's migrations to the self-hosted Postgres instance using a controlled migration job.

## Required before internet exposure

- Replace every example/default password and JWT secret.
- Put Studio/admin endpoints behind authentication and preferably private/VPN access.
- Reverse proxy public API endpoints through TLS.
- Do not expose PostgreSQL directly unless explicitly required and firewall-restricted.
- Configure daily database dumps plus off-host copies.
- Configure storage backup policy.
- Add health/disk monitoring.
- Test an actual restore before calling production ready.
- Pin/test Supabase upgrades in staging before production.

## App deployment

The Mcello app will be containerized separately once the real TanStack/server slice replaces the static prototype. The app must communicate with Supabase through environment variables, never hard-coded provider URLs or service-role credentials in client code.

## References

- https://supabase.com/docs/guides/self-hosting
- https://supabase.com/docs/guides/self-hosting/docker
