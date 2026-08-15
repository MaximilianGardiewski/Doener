#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-infra/selfhost/app.env}"

fail() {
  printf 'SELFHOST PREFLIGHT FAILED: %s\n' "$*" >&2
  exit 1
}

[[ -f "$ENV_FILE" ]] || fail "missing environment file: $ENV_FILE"

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

require_value() {
  local name="$1"
  local value="${!name:-}"
  [[ -n "$value" ]] || fail "$name is required"
  [[ "$value" != *"example.invalid"* ]] || fail "$name still contains example.invalid"
  [[ "$value" != *"replace-with"* ]] || fail "$name still contains a placeholder"
}

require_https() {
  local name="$1"
  local value="${!name:-}"
  [[ "$value" == https://* ]] || fail "$name must use https:// in production"
  [[ "$value" != *"localhost"* && "$value" != *"127.0.0.1"* ]] || fail "$name must not point at localhost in production"
}

require_value PUBLIC_SITE_URL
require_value SUPABASE_URL
require_value SUPABASE_ANON_KEY
require_value SUPABASE_SERVICE_ROLE_KEY
require_value MCELLO_LOCATION_ID
require_https PUBLIC_SITE_URL
require_https SUPABASE_URL

[[ "$MCELLO_LOCATION_ID" =~ ^[0-9a-fA-F-]{36}$ ]] || fail "MCELLO_LOCATION_ID must be a UUID"
[[ ${#SUPABASE_ANON_KEY} -ge 40 ]] || fail "SUPABASE_ANON_KEY looks too short"
[[ ${#SUPABASE_SERVICE_ROLE_KEY} -ge 40 ]] || fail "SUPABASE_SERVICE_ROLE_KEY looks too short"

if [[ -n "${WHATSAPP_PROVIDER:-}${SMS_PROVIDER:-}" ]]; then
  [[ "${ALLOW_PAID_MESSAGING:-NO}" == "YES" ]] || fail "messaging provider configured without ALLOW_PAID_MESSAGING=YES"
fi

if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf 'Git commit: %s\n' "$(git rev-parse HEAD)"
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    fail "tracked Git working tree is dirty"
  fi
fi

if command -v docker >/dev/null 2>&1; then
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required"
else
  fail "Docker is required"
fi

printf 'Self-host production preflight passed for %s\n' "$PUBLIC_SITE_URL"
