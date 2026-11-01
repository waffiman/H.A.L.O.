#!/usr/bin/env bash
# Deploy the latest GitHub main to prod or pre-prod. Run on the VPS.
#
#   scripts/deploy.sh <prod|preprod> [--dry-run] [--ref <branch|sha>] [--yes]
#   scripts/deploy.sh <prod|preprod> --init     one-time git setup (see below)
#
# --dry-run  show what would change and run every check, without changing anything
# --ref      deploy something other than main (a test branch, or a sha to roll back)
# --yes      skip the prod confirmation prompt
#
# --init on prod only adds .git: it never changes a working file. On pre-prod it
# clones into an empty directory. Both need a GitHub deploy key (or DEPLOY_REMOTE).
#
# What it refuses to do:
#  - overwrite local code that isn't in the target commit (undeployed work)
#  - restart anything while a browser job is running on prod
#  - start a stopped linkedin-agent, or touch n8n
#  - replace brain/, prompts/ or salesPlaybook.md (edited live in the dashboard)
#  - deploy pre-prod with prod's secrets or a LinkedIn session
#
# Everything is inside main(), called on the last line: the reset below can
# replace this file while it runs, and bash reads scripts incrementally.
set -euo pipefail

die() { echo "deploy: $*" >&2; exit 1; }

PROTECTED_PATHS="brain prompts salesPlaybook.md"
BROWSER_JOB_RE='^(linkedin-repair|x-repair|tg-repair|wa-repair|connect-test|halo-tenant-.*)$'
SHARED_SECRET_KEYS="SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY TELEGRAM_BOT_TOKEN STRIPE_SECRET_KEY HALO_SESSION_SECRET HALO_OPS_TOKEN"

env_value() { # file key -> value without surrounding quotes; never printed by callers
  { grep -E "^$2=" "$1" || true; } | tail -1 | cut -d= -f2- |
    sed -E "s/^['\"]//; s/['\"][[:space:]]*$//; s/[[:space:]]*$//"
}

# --- setup ------------------------------------------------------------------

init_repo() {
  case "$TARGET" in
    prod)
      [ -f "$ROOT/docker-compose.ionos.yml" ] || die "$ROOT doesn't look like prod"
      [ ! -d "$ROOT/.git" ] || die "$ROOT is already a git repo"
      cd "$ROOT"
      git init -q
      git config core.fileMode false
      git remote add origin "$REMOTE"
      git fetch -q origin main
      git reset -q --mixed origin/main # index only; working files untouched
      ;;
    preprod)
      [ ! -e "$ROOT" ] || [ -z "$(ls -A "$ROOT")" ] || die "$ROOT is not empty"
      git clone -q "$REMOTE" "$ROOT"
      cd "$ROOT"
      git config core.fileMode false
      ;;
  esac
  echo "init: $ROOT tracks $(git rev-parse --short HEAD). No containers were changed."
  print_drift_report origin/main
}

# --- checks -----------------------------------------------------------------

differs_from() { # target path -> true if the working file isn't what target has
  local want have
  want="$(git rev-parse -q --verify "$1:$2" 2>/dev/null || true)"
  have=""
  [ -f "$2" ] && have="$(git hash-object --no-filters -- "$2")"
  [ "$want" != "$have" ]
}

# Local changes the deploy would destroy: files edited or added here that the
# target doesn't already contain. Files that target already matches are fine,
# which covers "scp'd to the server, then pushed to main".
find_drift() {
  local target="$1" path
  {
    git diff --name-only HEAD -- . ':(exclude)brain' ':(exclude)prompts' ':(exclude)salesPlaybook.md'
    git ls-files --others --exclude-standard -- . ':(exclude)brain' ':(exclude)prompts' |
      while IFS= read -r path; do
        git cat-file -e "$target:$path" 2>/dev/null && echo "$path"
      done
  } | sort -u | while IFS= read -r path; do
    differs_from "$target" "$path" && echo "$path"
  done
  return 0
}

print_drift_report() {
  local drift untracked
  drift="$(find_drift "$1")"
  untracked="$(git ls-files --others --exclude-standard -- . ':(exclude)brain' ':(exclude)prompts')"
  if [ -n "$drift" ]; then
    echo "Would block a deploy (local changes not in the target):"
    echo "$drift" | sed 's/^/  /'
  fi
  if [ -n "$untracked" ]; then
    echo "Only on this server, not in git (a deploy leaves them, but they should be committed or removed):"
    echo "$untracked" | sed 's/^/  /'
  fi
  return 0
}

check_no_browser_job() {
  local jobs
  jobs="$(docker ps --format '{{.Names}}' | grep -E "$BROWSER_JOB_RE" || true)"
  [ -z "$jobs" ] || die "browser job running, try again when it ends: $(echo "$jobs" | tr '\n' ' ')"
  # Same 3h staleness rule as cycleLock.js
  if [ -n "$(find "$ROOT/cycle.lock" -mmin -180 2>/dev/null)" ]; then
    die "cycle.lock is held (a stage is running), try again when it's free"
  fi
}

check_preprod_env() {
  local failed=0 key val path prod_real
  prod_real="$(cd "$PROD_ROOT" 2>/dev/null && pwd -P)" || die "missing $PROD_ROOT, can't compare secrets"
  [ "$(pwd -P)" != "$prod_real" ] || die "pre-prod directory is the prod directory"
  [ -f .env ] || die "missing $ROOT/.env"
  [ -f "$PROD_ROOT/.env" ] || die "missing $PROD_ROOT/.env, can't compare secrets"
  for key in $SHARED_SECRET_KEYS; do
    val="$(env_value .env "$key")"
    if [ -n "$val" ] && [ "$val" = "$(env_value "$PROD_ROOT/.env" "$key")" ]; then
      echo "preflight: $key has the same value as prod" >&2
      failed=1
    fi
  done
  if grep -q 'sk_live' .env; then echo "preflight: .env contains a live Stripe key" >&2; failed=1; fi
  for path in cookies.json session_data; do
    if [ -e "$path" ]; then echo "preflight: $path exists; pre-prod must not hold a LinkedIn session" >&2; failed=1; fi
  done
  # Allowed: the dashboard runs without a CRM, its pages just show zeros.
  if [ -z "$(env_value .env SUPABASE_URL)" ]; then echo "preflight: warning, SUPABASE_URL is empty, CRM pages will show zeros" >&2; fi
  [ "$failed" = 0 ] || die "pre-prod preflight failed; nothing deployed"
}

# --- deploy steps -----------------------------------------------------------

update_code() {
  local target="$1" backup paths="" p
  backup="$(mktemp)"
  for p in $PROTECTED_PATHS; do [ -e "$p" ] && paths="$paths $p"; done
  # shellcheck disable=SC2086
  [ -z "$paths" ] || tar -cf "$backup" $paths
  git reset -q --hard "$target"
  if [ -n "$paths" ]; then
    # shellcheck disable=SC2086
    rm -rf $paths
    tar -xf "$backup"
  fi
  rm -f "$backup"
}

health_check() {
  local i
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    curl -fsS -m 3 "$HEALTH_URL" >/dev/null 2>&1 && return 0
    sleep 3
  done
  return 1
}

changed() { # paths... -> true if any changed between FROM and TO
  [ "$FIRST_DEPLOY" = 0 ] || return 0 # nothing recorded: can't assume containers match git
  [ -n "$(git diff --name-only "$FROM" "$TO" -- "$@")" ]
}

deploy_prod() {
  local compose="docker compose -f docker-compose.ionos.yml" agent_running renew=""
  docker network inspect halo-edge >/dev/null 2>&1 || docker network create halo-edge >/dev/null
  agent_running="$(docker inspect -f '{{.State.Running}}' linkedin-agent 2>/dev/null || echo false)"
  mkdir -p caddy-sites
  $compose config -q

  $compose build outreach-dashboard halo-ops
  if changed Dockerfile package.json package-lock.json; then
    $compose build linkedin-agent
    renew="--renew-anon-volumes" # the old anonymous node_modules would hide new packages
  fi

  $compose up -d --no-deps halo-ops outreach-dashboard

  if changed Caddyfile docker-compose.ionos.yml; then
    docker run --rm -e HALO_DOMAIN="$(env_value .env HALO_DOMAIN)" \
      -v "$ROOT/Caddyfile:/etc/caddy/Caddyfile:ro" -v "$ROOT/caddy-sites:/etc/caddy/sites:ro" \
      caddy:2.8.4 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 ||
      die "new Caddyfile is invalid; caddy left running on the old one"
    echo "caddy: recreating (HTTPS drops for a few seconds)"
    $compose up -d --no-deps --force-recreate caddy
  fi

  if [ "$agent_running" = "true" ]; then
    # Code is bind-mounted, so the running process needs a fresh start to load it.
    $compose up -d --no-deps --force-recreate $renew linkedin-agent
    echo "linkedin-agent: recreated on the new code"
  else
    echo "linkedin-agent: was stopped, left stopped (it runs the new code when started)"
  fi
}

deploy_preprod() {
  docker network inspect halo-edge >/dev/null 2>&1 || docker network create halo-edge >/dev/null
  docker compose -f docker-compose.preprod.yml up -d --build --no-deps halo-preprod-dashboard
}

# --- main -------------------------------------------------------------------

main() {
  TARGET="${1:-}"
  case "$TARGET" in
    prod | preprod) shift ;;
    *) die "usage: scripts/deploy.sh <prod|preprod> [--dry-run] [--ref <branch|sha>] [--yes] | --init" ;;
  esac

  local ref=main dry_run=0 assume_yes=0 do_init=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --ref) [ $# -ge 2 ] || die "--ref needs a value"; ref="$2"; shift 2 ;;
      --dry-run) dry_run=1; shift ;;
      --yes) assume_yes=1; shift ;;
      --init) do_init=1; shift ;;
      *) die "unknown option: $1" ;;
    esac
  done

  PROD_ROOT="${PROD_ROOT:-/root/cold-outreach-agent}"
  REMOTE="${DEPLOY_REMOTE:-git@github.com:waffiman/H.A.L.O..git}"
  if [ "$TARGET" = prod ]; then
    ROOT="$PROD_ROOT"
    HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3080/api/health}"
  else
    ROOT="${PREPROD_ROOT:-/root/halo-preprod}"
    HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3081/api/health}"
  fi

  exec 9>"${DEPLOY_LOCK:-/tmp/halo-deploy.lock}"
  flock -n 9 || die "another deploy is running"

  if [ "$do_init" = 1 ]; then
    init_repo
    return 0
  fi

  [ -d "$ROOT/.git" ] || die "$ROOT isn't a git checkout yet; run: scripts/deploy.sh $TARGET --init"
  cd "$ROOT"

  git fetch -q origin
  local to
  to="$(git rev-parse -q --verify "origin/$ref^{commit}" 2>/dev/null || git rev-parse -q --verify "$ref^{commit}" 2>/dev/null)" ||
    die "unknown ref: $ref"
  TO="$to"
  FIRST_DEPLOY=1
  FROM="$(git rev-parse HEAD)"
  if [ -f .git/halo-deployed ]; then
    FIRST_DEPLOY=0
    FROM="$(cat .git/halo-deployed)"
  fi

  local drift
  drift="$(find_drift "$TO")"
  if [ -n "$drift" ]; then
    echo "These local files differ from $ref and would be overwritten:" >&2
    echo "$drift" | sed 's/^/  /' >&2
    die "nothing deployed. Commit them to git and push, or remove them, then retry"
  fi

  if [ "$TARGET" = prod ]; then check_no_browser_job; else check_preprod_env; fi

  echo "$TARGET: $(git rev-parse --short "$FROM") -> $(git rev-parse --short "$TO") ($ref)"
  if [ "$FIRST_DEPLOY" = 0 ] && [ "$FROM" = "$TO" ]; then
    echo "Already deployed; nothing to do."
    return 0
  fi
  git log --oneline "$FROM..$TO" 2>/dev/null | head -20 | sed 's/^/  /'
  local skipped
  skipped="$(git diff --name-only "$FROM" "$TO" -- $PROTECTED_PATHS)"
  if [ -n "$skipped" ]; then
    echo "Not deployed, because these are edited live (apply by hand if wanted):"
    echo "$skipped" | sed 's/^/  /'
  fi

  if [ "$dry_run" = 1 ]; then
    echo "Dry run: checks passed, nothing changed."
    return 0
  fi

  if [ "$TARGET" = prod ] && [ "$assume_yes" != 1 ]; then
    [ -t 0 ] || die "prod needs --yes when run without a terminal"
    local answer
    read -r -p "Deploy to PROD? Type 'prod' to continue: " answer
    [ "$answer" = prod ] || die "cancelled"
  fi

  local rollback="scripts/deploy.sh $TARGET --ref $(git rev-parse --short "$FROM")"
  update_code "$TO"
  if [ "$TARGET" = prod ]; then deploy_prod; else deploy_preprod; fi

  if ! health_check; then
    echo "Health check failed: $HEALTH_URL" >&2
    die "the new code is in place but unhealthy. To roll back: $rollback"
  fi

  echo "$TO" >.git/halo-deployed
  echo "$(date -u +%FT%TZ) $TARGET $FROM -> $TO ($ref)" >>.git/halo-deploy.log
  echo "Deployed $(git rev-parse --short "$TO") to $TARGET; health ok."
  echo "To roll back: $rollback"
}

main "$@"
