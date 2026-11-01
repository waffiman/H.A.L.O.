#!/usr/bin/env bash
# Deploy origin/develop to pre-prod. Run on the VPS.
#   scripts/preprod-deploy.sh           preflight, then deploy
#   scripts/preprod-deploy.sh --check   preflight only
# Secret values are compared but never printed.
set -euo pipefail

PREPROD_ROOT="${PREPROD_ROOT:-/root/halo-preprod}"
PROD_ROOT="${PROD_ROOT:-/root/cold-outreach-agent}"
SHARED_KEYS="SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY TELEGRAM_BOT_TOKEN STRIPE_SECRET_KEY HALO_SESSION_SECRET HALO_OPS_TOKEN"

die() { echo "preprod-deploy: $*" >&2; exit 1; }

env_value() { # file key -> value without surrounding quotes
  { grep -E "^$2=" "$1" || true; } | tail -1 | cut -d= -f2- | sed -E "s/^['\"]//; s/['\"][[:space:]]*$//; s/[[:space:]]*$//"
}

preflight() {
  [ "$(cd "$PREPROD_ROOT" && pwd -P)" != "$(cd "$PROD_ROOT" && pwd -P)" ] || die "PREPROD_ROOT is the prod directory"
  [ -f "$PREPROD_ROOT/.env" ] || die "missing $PREPROD_ROOT/.env"
  [ -f "$PROD_ROOT/.env" ] || die "missing $PROD_ROOT/.env, can't compare secrets"

  local failed=0 key val
  for key in $SHARED_KEYS; do
    val="$(env_value "$PREPROD_ROOT/.env" "$key")"
    if [ -n "$val" ] && [ "$val" = "$(env_value "$PROD_ROOT/.env" "$key")" ]; then
      echo "preflight: $key has the same value as prod" >&2
      failed=1
    fi
  done
  if grep -q 'sk_live' "$PREPROD_ROOT/.env"; then
    echo "preflight: .env contains a live Stripe key" >&2
    failed=1
  fi
  for path in cookies.json session_data; do
    if [ -e "$PREPROD_ROOT/$path" ]; then
      echo "preflight: $path exists; pre-prod must not hold a LinkedIn session" >&2
      failed=1
    fi
  done
  [ "$(env_value "$PREPROD_ROOT/.env" SUPABASE_URL)" != "" ] || { echo "preflight: SUPABASE_URL is empty" >&2; failed=1; }
  [ "$failed" = 0 ] || die "preflight failed; nothing deployed"
  echo "preflight: ok"
}

preflight
[ "${1:-}" = "--check" ] && exit 0

cd "$PREPROD_ROOT"
docker network inspect halo-edge >/dev/null 2>&1 || docker network create halo-edge >/dev/null
git fetch origin develop
git reset --hard origin/develop
docker compose -f docker-compose.preprod.yml up -d --build halo-preprod-dashboard
echo "deployed $(git rev-parse --short HEAD)"
