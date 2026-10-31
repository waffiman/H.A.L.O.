# Dashboard and multi-tenancy

The dashboard is a bare Express server ([`dashboard/server.js`](../../dashboard/server.js))
plus a hand-written vanilla SPA (`dashboard/public/app.js`). It is the control
plane: it edits settings, Brain and CRM, and restarts the agent. It never
drives LinkedIn itself, except for session repair under lock `R`.

## Components

```mermaid
flowchart TB
  classDef owner fill:#fde8e8,stroke:#d33
  classDef li stroke:#d33,stroke-width:2px

  SPA["public/app.js<br/>vanilla SPA"] --> S["server.js"]
  Mk["/marketing<br/>Vite build (optional)"] --- S

  S --> WH["/api/billing/webhook<br/>raw body, BEFORE express.json()"]
  WH --> Bill["lib/stripeBilling.js"]
  S --> Auth["lib/tenantAuth.js<br/>scrypt + HMAC session cookie"]
  Auth --> Tn["req.tenant.workspaceId"]

  Tn --> Settings["/api/settings · /switches<br/>lib/ops.js applyDashboardPatch"]
  Tn --> CRMApi["/api/crm/*<br/>lib/crmApi.js → workspace_id filter"]
  Tn --> Brain["Brain / prompts<br/>cabinetPaths(ws)"]
  Tn --> ExtSync["/api/extension/sync-session<br/>ops.ingestCookiePaste"]
  Tn --> Repair["lib/sessionRepair.js · xSessionRepair.js<br/>→ sessionRepairWorker (lock R)"]:::li

  S --> OwnerOnly["requireOwner routes"]:::owner
  OwnerOnly --> Restart["/api/agent/restart<br/>Docker socket → recreate linkedin-agent"]
  OwnerOnly --> Secrets["/api/secrets/reveal · root .env"]
  OwnerOnly --> Prov["/api/notion/* · /api/supabase/*<br/>/api/analytics/series"]

  S --> Orch["lib/tenantOrchestrator.js<br/>other cabinets: one-shot A/B"]:::li
  Orch --> BQ["lib/browserQueue.js<br/>withBrowserLock (cycle.lock + ws)"]
  S --> TGB["lib/telegramBot.js"]
  S --> Support["lib/supportChat.js"]
```

## What is tenant-scoped and what is shared

```mermaid
flowchart LR
  subgraph Tenant["Tenant-scoped (any signed-in cabinet)"]
    direction TB
    T1["CRM rows<br/>filtered by workspace_id"]
    T2["halo-tenants/&lt;ws&gt;/<br/>tenant.env · cookies · session_data<br/>brain/ · prompts · salesPlaybook.md<br/>session_status.json · notifications"]
  end
  subgraph Shared["Platform-shared (owner only)"]
    direction TB
    P1["root .env<br/>integration keys, Supabase, Stripe, Telegram token"]
    P2["cycle.lock"]
    P3["single linkedin-agent container"]
  end
  Map["ops.js cabinetPaths(ws)<br/>default → legacy root paths"] --> T2
  Guard["applyDashboardPatch(body, ws, isOwner)<br/>strips rootOnlyKeys for non-owners"] --> T2
  Guard -. owner only .-> P1
```

- `cabinetPaths()` in `dashboard/lib/ops.js` is the **only** place that maps a
  workspace to files. WAFFi is `default` and keeps the legacy root paths.
- `/api/settings` is open to every cabinet because it only writes
  cabinet-scoped files. Any new setting that touches shared state must go into
  the `rootOnlyKeys` guard.
- New cabinets are seeded by `ensureTenantRuntime` with a **neutral** prompt,
  never a copy of WAFFi's master prompt.

## Who actually runs outreach

```mermaid
flowchart LR
  classDef li stroke:#d33,stroke-width:2px
  W["workspace default (WAFFi)"] --> Agent["long-running linkedin-agent<br/>Stage A/B scheduler"]:::li
  O["other cabinets (≤ MAX_LINKEDIN_CABINETS = 3)"] --> Orch["tenantOrchestrator<br/>sequential one-shots<br/>TENANT_DATA_ROOT + WORKSPACE_ID"]:::li
  Agent & Orch --> Lock[("cycle.lock<br/>one Chromium total")]
```

## Sign-in request

```mermaid
sequenceDiagram
  participant B as Browser
  participant S as server.js
  participant A as tenantAuth
  participant T as tenants store

  B->>S: POST /api/auth/login (rate limited)
  S->>A: verify scrypt hash
  A->>T: load tenant (email verified?)
  A-->>S: workspaceId
  S-->>B: Set-Cookie halo_session (HMAC-signed)
  B->>S: GET /api/crm/leads (cookie)
  S->>A: verify HMAC → req.tenant
  S->>S: crmApi query WHERE workspace_id = req.tenant.workspaceId
  S-->>B: leads
```

Full auth matrix: OVERVIEW §9 "Auth & authorization".
