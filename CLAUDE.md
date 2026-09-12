# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

**H.A.L.O.** (Headless Automated Lead Operator) — a LinkedIn cold-outreach automation
built by WAFFi. A Playwright agent drives a real LinkedIn session through a two-stage
pipeline; an Express dashboard is the control plane. Everything runs as Docker
containers on an IONOS VPS (`/root/cold-outreach-agent`), not on a PaaS.

- **Stage A (acquisition)** — promote accepted invites → drain `Proposal 1️⃣`
  (Apify enrich + LLM ice-breaker + DM) → send N connection invites from the Brain
  portrait search. Default interval 48h.
- **Stage B (conversation)** — scrape the inbox, LLM-reply to unread `Proposal 2️⃣`,
  revive `Lost❌` leads that wrote back, send silence closings. Default 30m + jitter.
- **Brain** — LLM copy generation (3-role Researcher→Copywriter→Inspector pipeline)
  plus a weekly strategy-analysis tick that rewrites `brain/strategy_notes.md`.

**[`OVERVIEW.md`](OVERVIEW.md) is the operational source of truth** (616 lines: status
glossary, per-phase tables, env reference, ops playbook, known failure modes). Read it
before changing pipeline behavior, and update it *in the same change* when you alter
Stage A/B behavior, env flags, CRM fields, dashboard UI, cookie rules, or deploy
topology (its §14 rule).

## Layout

| Area | Files |
|------|-------|
| Agent core / scheduler / all Playwright DM logic | `index.js` (~3.3k lines: `runStageA`, `runStageB`, `processLeads`, `tick*`) |
| Connect & acceptance | `stageAConnect.js`, `connectLeads.js`, `prospectSearch.js`, `regionsGeo.js` |
| Legacy My Network import | `connectionsSync.js` |
| Enrich + copy | `enrichAndWrite.js`, `salesBrain.js`, `brainStore.js`, `messageQuality.js`, `prompts/*.md`, `brain/` |
| Brain analysis | `brainAnalyzer.js`, `brainLlmHealth.js` |
| Conversation | `conversationAgent.js`, `bookingSchedule.js`, `googleCalendar.js` |
| CRM abstraction | `crmStore.js` → `crm/notionAdapter.js` \| `crm/supabaseAdapter.js` (`crm/constants.js`, `crm/leadFields.js`, `crm/supabaseRest.js`) |
| Session | `sessionHealth.js`, `sessionRepairWorker.js`, `sessionRepairLink.js` |
| Coordination | `cycleLock.js` (`cycle.lock`), `stageAState.js`, `stageBState.js` |
| Dashboard | `dashboard/server.js` (routes), `dashboard/lib/ops.js` (settings ↔ `.env`), `dashboard/lib/*`, `dashboard/public/app.js` (5.4k-line vanilla SPA) |
| Schema | `sql/halo_crm_leads.sql`, `sql/halo_tenants.sql`, `sql/migrate_lead_enrich_fields.sql` |
| Deploy | `Dockerfile`, `dashboard/Dockerfile`, `docker-compose.ionos.yml` (production) |

## Conventions

- **ESM everywhere** (`"type": "module"`), Node 20/22, plain `.js` — no TypeScript,
  no bundler, no build step, no linter, no test suite. Verification is one-shot
  scripts against the live VPS (`scripts/run-stage-*.js`, `run-connect-once.js`).
- **No framework on either side.** Backend is bare Express; frontend is hand-written
  DOM code in `dashboard/public/app.js`. Match the surrounding style rather than
  introducing React/build tooling.
- **Behavior is env-driven.** Nearly every branch reads `process.env` at call time
  (`index.js:reloadEnv()` re-reads `.env` between ticks). New behavior gets a flag,
  defaults to off, and lands in OVERVIEW §10.
- **State lives in gitignored JSON at the repo root** (`cycle.lock`,
  `*_state.json`, `session_status.json`, `cookies.json`, `notifications.json`).
  Never commit them; `.gitignore` already covers the patterns.
- **CRM statuses are exactly five** and the emoji are part of the value — import them
  from `crm/constants.js`, never re-type the literals or invent a sixth status.
- **Always go through `crmStore.js`**, not an adapter directly. `CRM_BACKEND` selects
  Notion (legacy) or Supabase (current default in `.env.example`); both adapters must
  keep the same shape.
- Comments and log lines are terse and English; some UI copy and older comments are
  Russian. Keep new code English.

## Critical safety rules

These come from production incidents; violating them burns the LinkedIn session.

1. **One Chromium-bearing job at a time** — Stage A, Stage B, connect one-shot, Brain
   analysis, or session repair. `cycleLock.js` enforces it (`A`|`B`|`C`|`Brain`|`R`;
   stale after 3h). Never add a code path that opens a second browser in parallel.
2. **`ALLOW_AUTO_LOGIN` stays `0`.** Password login from the VPS rotates tokens and
   kicks the operator's real browser.
3. **Never persist cookies without a live `li_at`** — `persistSessionCookies` skips the
   write instead of overwriting a good jar.
4. **Never open `/in/` public profiles to DM.** Compose by name via
   `/messaging/compose`; profile visits hit the guest auth wall.
5. **Leftover ice sends and new-lead import never share one Stage A run** — the second
   Chromium lifetime on a datacenter IP kills the token (OVERVIEW §12).
6. Brain analysis must never touch LinkedIn — Notion/Supabase + LLM only.

## Secrets and deploy hygiene

- `.env`, `cookies.json`, `session_data/`, `halo-tenants/`, and all operator VPS
  scripts (`scripts/_*`, `scripts/deploy-*`, `scripts/*cookie*`, `scripts/vps-*`, …)
  are deliberately **not in git**. `.env.example` is the only env template; add new
  keys there without values.
- **Never deploy `brain/strategy_notes.md` or `brain/analysis_state.json` from local** —
  they are VPS runtime state and local copies will wipe live analysis results.
- After changing `.env` on the VPS the agent must be *recreated*, not restarted:
  `docker compose -f docker-compose.ionos.yml up -d --force-recreate linkedin-agent`.
- Rollback procedure (flags to flip, order of verification): [`ROLLBACK.md`](ROLLBACK.md).

## Multi-tenant — read this before touching the dashboard

**The CRM is multi-tenant; the agent is not.** Know which side you are on.

- **Tenant-scoped (works):** every `/api/crm/*` route passes
  `req.tenant.workspaceId` into the query, and both adapters filter on
  `workspace_id`. Lead data is genuinely isolated. Keep it that way — never add a
  CRM query that doesn't take a workspace.
- **Global / WAFFi-only (by design, enforced):** `.env`, `cookies.json`,
  `session_data/`, `brain/`, `cycle.lock`, and the single `linkedin-agent`
  container. `tenantPaths()` in `dashboard/lib/tenantRuntime.js` is currently
  used **only** by `ensureTenantRuntime` at registration — nothing reads a
  tenant's `cookies.json` / `brain/` / `tenant.env` yet, so a non-`default`
  cabinet has a CRM but no outreach automation.

Because of that split, everything that reads or writes global config is gated to
`role === 'owner'` by `requireOwner` in `dashboard/server.js`, and non-owners get
a redacted `GET /api/settings`. **Do not relax those gates to "make the UI work"
for a tenant** — a non-owner reaching `POST /api/settings` or
`/api/agent/restart` rewrites WAFFi's production config and recreates the live
LinkedIn agent. The correct fix is to route the surface through
`tenantPaths(req.tenant.workspaceId)` and give that tenant its own agent, not to
drop the check.

Auth is `dashboard/lib/tenantAuth.js` (scrypt passwords, HMAC session cookies);
see OVERVIEW.md §9 "Auth & authorization" for the full matrix. Billing is
`dashboard/lib/stripeBilling.js` — the webhook route must stay registered before
`express.json()` so signature verification sees raw bytes.

The WAFFi workspace id is `default` and keeps the legacy root paths — preserve
that special case in any path logic.

## Local runs

**Dashboard** (safe — no LinkedIn session involved):

```bash
cd dashboard && npm install
# ops.js imports '../bookingSchedule.js'; the container gets it via COPY, so
# from source you need a copy at dashboard/bookingSchedule.js (gitignored):
cp ../bookingSchedule.js .
# Point APP_ROOT at a sandbox dir holding .env + brain/ + prompts/ so a local
# run never writes into the repo. It needs DASHBOARD_PASSWORD set (auth now
# fails closed) and will generate HALO_SESSION_SECRET into that .env on boot.
APP_ROOT=/path/to/sandbox PORT=3080 node server.js
```

Without Supabase credentials the CRM pages show zeros; everything else (settings,
Brain, prompts, integrations) renders from `APP_ROOT`.

**Agent** — `node index.js` drives a real LinkedIn session from `cookies.json`.
Do not start it casually: per OVERVIEW §7 a second concurrent session burns
`li_at`, and the production agent runs on the VPS. Confirm with the operator
before starting the agent or a connect one-shot.
