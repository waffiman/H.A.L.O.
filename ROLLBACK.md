# Rollback — restore working Stage A automation

Use this when connect-pipeline experiments break the session or legacy flow.

## Level 1 — Env only (~2–5 min)

On VPS `.env` set:

```env
STAGE_A_OUTBOUND_CONNECT=0
STAGE_A_ACCEPTANCE=0
STAGE_A_LEGACY_SYNC=1
CONNECT_DRY_RUN=0
SKIP_SYNC=0
SKIP_ENRICH=0
CONNECT_PROFILE_FALLBACK=0
OUTREACH_PAUSED=1
```

1. Paste fresh `li_at` in dashboard LinkedIn section (close personal LinkedIn tab first).
2. Restart agent: `docker compose -f docker-compose.ionos.yml restart linkedin-agent`
3. Run send-only test: `SKIP_SYNC=1 SKIP_ENRICH=1` Stage A one-shot on known Proposal 1 lead.
4. If DM ok → set `OUTREACH_PAUSED=0`.

## Level 2 — Redeploy baseline files (~10–15 min)

```bash
python scripts/_deploy-rollback-baseline.py
```

Then Level 1 env restore + fresh cookies + send-only verify.

## Level 3 — Full VPS restore

1. Restore `.env` from backup
2. Restore `cookies.json` if you saved a working copy
3. `rm -rf session_data && mkdir session_data`
4. Level 2 redeploy + Level 1 verify

## Roll back a deploy

`scripts/deploy.sh <prod|preprod> --ref <sha>` with the sha it printed. History: `.git/halo-deploy.log`.

## Remove pre-prod

Prod's data and agent aren't involved:

1. `cd /root/halo-preprod && docker compose -f docker-compose.preprod.yml down`
2. `rm /root/cold-outreach-agent/caddy-sites/preprod.caddy`
3. Recreate only Caddy: `cd /root/cold-outreach-agent && docker compose -f docker-compose.ionos.yml up -d --force-recreate --no-deps caddy`
4. Remove the `preprod.halo` DNS record.

Keep the `halo-edge` network unless prod's compose file is also reverted, since that file references it.

## Production-safe env (default after connect code deploy)

All new connect flags **OFF** = same behavior as before connect-pipeline:

```env
STAGE_A_OUTBOUND_CONNECT=0
STAGE_A_ACCEPTANCE=0
STAGE_A_LEGACY_SYNC=1
```

## Stop protocol

When you say **stop / rollback**:

1. `OUTREACH_PAUSED=1` immediately
2. Level 1 env
3. Fresh cookies + send-only test
4. Do **not** enable connect flags until you explicitly approve

## Git tag (when git available)

Before connect work: `git tag baseline-pre-connect-pipeline`

Restore: `git checkout baseline-pre-connect-pipeline`
