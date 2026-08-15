# Environment contract

## Browser-safe
- `PUBLIC_SITE_URL` — canonical application base URL.
- `SUPABASE_URL` — project URL.
- `SUPABASE_PUBLISHABLE_KEY` — browser-safe publishable/anon key.

## Server-only
- `SUPABASE_SERVICE_ROLE_KEY` — privileged server key; never expose to client bundles.
- `MCELLO_LOCATION_ID` — the one location exposed by this Mcello application instance. Defaults to the canonical local seed UUID.
- `MCELLO_MENU_SEED_NAMESPACE` — deterministic import namespace. Keep `mcello` for the canonical location; use a distinct value when provisioning another location.
- `WHATSAPP_PROVIDER`, `WHATSAPP_API_TOKEN`, `WHATSAPP_SENDER_ID` — adapter configuration.
- `SMS_PROVIDER`, `SMS_API_TOKEN`, `SMS_SENDER_ID` — SMS fallback adapter.
- `OTP_TTL_SECONDS` — OTP lifetime, default 300.

Provider names are intentionally abstract until a provider is selected/researched.
