#!/usr/bin/env bash
set -euo pipefail

: "${MCELLO_PUBLIC_URL:?MCELLO_PUBLIC_URL is required}"
: "${SUPABASE_PUBLIC_URL:?SUPABASE_PUBLIC_URL is required}"

DISK_PATH="${DISK_PATH:-/}"
MIN_FREE_PERCENT="${MIN_FREE_PERCENT:-15}"

curl --fail --silent --show-error --max-time 10 \
  "$MCELLO_PUBLIC_URL/api/health" >/dev/null

# A reachable Auth endpoint may answer 401 without credentials; network/TLS failure
# or a 5xx response is the condition this probe is intended to detect.
auth_code="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 10 \
  "$SUPABASE_PUBLIC_URL/auth/v1/" || true)"
case "$auth_code" in
  200|400|401|403|404) ;;
  *)
    echo "Supabase public gateway unhealthy: HTTP ${auth_code:-none}" >&2
    exit 1
    ;;
esac

used="$(df -P "$DISK_PATH" | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
[[ "$used" =~ ^[0-9]+$ ]] || { echo "Could not read disk utilization" >&2; exit 1; }
free=$((100 - used))
if (( free < MIN_FREE_PERCENT )); then
  echo "Disk free space below threshold: ${free}% < ${MIN_FREE_PERCENT}%" >&2
  exit 1
fi

printf 'Health OK: app=%s supabase_http=%s disk_free=%s%%\n' \
  "$MCELLO_PUBLIC_URL" "$auth_code" "$free"
