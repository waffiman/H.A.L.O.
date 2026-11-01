# H.A.L.O. architecture — visual guide

A diagram-first map of how H.A.L.O. works. It complements
[`OVERVIEW.md`](../../OVERVIEW.md), which stays the operational source of truth
(env flags, ops playbook, failure history). Start here to build the mental
model, then go to OVERVIEW for the details.

| Page | What it explains |
|------|------------------|
| **[at-a-glance.md](at-a-glance.md)** | **Start here:** blocks, lead stages and a day in the life, in 5 minutes |
| [pipeline.md](pipeline.md) | The four CRM statuses and which code moves a lead between them |
| [stage-a.md](stage-a.md) | Stage A acquisition: acceptance → leftover ice → connect invites (+ X search) |
| [stage-b.md](stage-b.md) | Stage B conversation: inbox revive → replies → silence closings |
| [brain.md](brain.md) | Prompt composition, the 3-role LLM pipeline, enrich + scoring, weekly analysis, booking |
| [scheduler-session.md](scheduler-session.md) | Scheduler loop, `cycle.lock` priorities, LinkedIn session life cycle |
| [dashboard-tenancy.md](dashboard-tenancy.md) | Express dashboard, auth, tenant-scoped vs platform-shared state |
| [channels-x.md](channels-x.md) | X (Twitter) channel and DeepResearch |

**Legend used in every diagram:** nodes with a **red border** open Chromium
against LinkedIn or X. Those steps fall under the one-browser-at-a-time rule
and can burn the session.

---

## System context

```mermaid
flowchart LR
  classDef li stroke:#d33,stroke-width:2px
  classDef ext fill:#eef,stroke:#88a

  Operator(["Operator / cabinet user"])
  Ext["Chrome extension<br/>halo-session-sync"]

  subgraph VPS["IONOS VPS · /root/cold-outreach-agent"]
    Dash["outreach-dashboard<br/>Express + vanilla SPA"]
    Agent["linkedin-agent<br/>node index.js · Playwright"]:::li
    Files[("Repo-root state<br/>.env · cookies.json · session_data/<br/>*_state.json · cycle.lock · brain/")]
  end

  LinkedIn["LinkedIn"]:::ext
  X["X / Twitter"]:::ext
  CRM[("Supabase<br/>or Notion (legacy)")]:::ext
  Apify["Apify<br/>profile scrapers, web fetch"]:::ext
  LLM["LLMs<br/>Gemini · Cohere · OpenAI · OpenRouter"]:::ext
  TG["Telegram bot"]:::ext
  Stripe["Stripe"]:::ext

  Operator -->|browser| Dash
  Ext -->|POST /api/extension/sync-session| Dash
  Dash <-->|read/write| Files
  Agent <-->|read/write| Files
  Dash -->|Docker socket: recreate| Agent
  Agent -->|Chromium| LinkedIn
  Agent -->|Chromium| X
  Agent <--> CRM
  Dash <--> CRM
  Agent --> Apify
  Agent --> LLM
  Agent --> TG
  Dash --> Stripe
  Stripe -->|webhook| Dash
```

The **agent** and the **dashboard** never call each other over HTTP. They share
the host directory: the dashboard writes `.env`, `tenant.env`, `brain/*` and
`force_run_once.json`, and the agent re-reads them (`reloadEnv()` in
`index.js`) between ticks. To apply a change immediately, the dashboard
recreates the agent container through the Docker socket.

## Deploy topology

```mermaid
flowchart TB
  classDef li stroke:#d33,stroke-width:2px

  subgraph Host["VPS host: /root/cold-outreach-agent"]
    direction TB
    Tree[("repo tree<br/>code + .env + cookies.json")]
    SD[("session_data/<br/>Chromium profile")]
    Tenants[("halo-tenants/&lt;ws&gt;/<br/>per-cabinet jars + brain")]
    Sock[["/var/run/docker.sock"]]
  end

  subgraph C1["container linkedin-agent"]
    A["/app ← repo tree (live code)<br/>/app/session_data ← session_data/<br/>anonymous /app/node_modules"]:::li
  end
  subgraph C2["container outreach-dashboard"]
    D["/app-data ← repo tree (APP_ROOT)<br/>/marketing/dist (Vite build stage)<br/>127.0.0.1:3080 (local only)"]
  end
  subgraph C4["container caddy"]
    Cd["public :80 / :443<br/>HTTPS for HALO_DOMAIN<br/>→ outreach-dashboard:3080<br/>optional caddy-sites/*.caddy: pre-prod via halo-edge (OVERVIEW §2b)"]
  end
  subgraph C3["container n8n (legacy)"]
    N["not used by enrich anymore"]
  end

  Tree --- A
  SD --- A
  Tree --- D
  Tenants --- D
  Sock --- D
  Cd --> D
```

Source: [`docker-compose.ionos.yml`](../../docker-compose.ionos.yml). After any
`.env` change the agent must be **recreated**, not restarted
(`docker compose -f docker-compose.ionos.yml up -d --force-recreate linkedin-agent`).

## Module map (top-level)

```mermaid
flowchart LR
  classDef li stroke:#d33,stroke-width:2px

  index["index.js<br/>scheduler · runStageA · runStageB<br/>sendMessageToLead · inbox scrape"]:::li
  lock["cycleLock.js"]
  stA["stageAState.js"]
  stB["stageBState.js"]
  sess["sessionHealth.js"]
  conn["stageAConnect.js<br/>connectLeads.js<br/>prospectSearch.js · regionsGeo.js"]:::li
  sync["connectionsSync.js (legacy)"]:::li
  enrich["enrichAndWrite.js"]
  card["leadCard.js → deepResearch.js"]
  score["leadScoring.js"]
  conv["conversationAgent.js"]
  brain["salesBrain.js"]
  store["brainStore.js"]
  book["bookingSchedule.js<br/>googleCalendar.js"]
  analyzer["brainAnalyzer.js"]
  crm["crmStore.js"]
  supa["crm/supabaseAdapter.js"]
  notion["crm/notionAdapter.js"]
  x["xLeadSearch.js → xMessageGate / xFollow<br/>xEnrich.js"]:::li
  notify["notify.js → Telegram"]

  index --> lock & stA & stB & sess
  index --> conn & sync & enrich & conv & analyzer & x & notify
  enrich --> card & score & brain
  score --> brain
  conv --> brain & score
  brain --> store & book
  analyzer --> store
  index & conn & enrich & conv & analyzer & x --> crm
  crm --> supa & notion
```

Rule: everything talks to the CRM through **`crmStore.js`**, never an adapter
directly. `CRM_BACKEND` picks the adapter, and both adapters expose the same shape.
