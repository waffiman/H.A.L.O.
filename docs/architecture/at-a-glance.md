# H.A.L.O. at a glance

A five-minute picture of the system for engineers. It shows blocks and stages
only. Follow the links for the details.

## 1. The building blocks

```mermaid
flowchart TB
  classDef ui fill:#e8f1ff,stroke:#4a7bd0
  classDef core fill:#eaf7ee,stroke:#3a9a5b
  classDef ai fill:#f3eaff,stroke:#8a5cd0
  classDef data fill:#fff4e0,stroke:#d09a3a
  classDef ext fill:#f2f2f2,stroke:#888

  subgraph L1["① Control plane"]
    Dash["Dashboard<br/>settings · CRM view · Brain prompt · sign-in"]:::ui
  end

  subgraph L2["② State"]
    direction LR
    Files[("Config & session files<br/>.env · cookies · brain/")]:::data
    CRM[("CRM<br/>Supabase / Notion")]:::data
  end

  subgraph L3["③ Outreach engine · one container"]
    direction LR
    Sched["Scheduler<br/>+ cycle lock"]:::core --> A["Stage A<br/>Acquisition"]:::core
    Sched --> B["Stage B<br/>Conversation"]:::core
  end

  subgraph L4["④ Brain"]
    direction LR
    Copy["Copy generation"]:::ai
    Score["Lead scoring"]:::ai
    Learn["Weekly analysis"]:::ai
  end

  subgraph L5["⑤ External services"]
    direction LR
    LI["LinkedIn / X"]:::ext
    Enr["Apify"]:::ext
    LLM["LLM providers"]:::ext
    TG["Telegram"]:::ext
  end

  L1 -->|writes| L2
  L2 -->|read every tick| L3
  L3 -->|asks| L4
  L3 -->|browser · enrich · alerts| L5
  L4 -->|prompts| L5
  L3 -->|lead status| L2
  L4 -->|strategy notes| L2
```

| Block | Job | Details |
|-------|-----|---------|
| Dashboard | Operator edits settings, prompts, CRM. Never runs outreach itself | [dashboard-tenancy.md](dashboard-tenancy.md) |
| Scheduler | Fires stages on timers. The lock allows one browser at a time | [scheduler-session.md](scheduler-session.md) |
| Stage A | Finds people, sends invites, sends the first message | [stage-a.md](stage-a.md) |
| Stage B | Reads replies, answers, closes silent threads | [stage-b.md](stage-b.md) |
| Brain | Writes every message, scores leads, learns weekly | [brain.md](brain.md) |
| CRM | One row per lead, in one of 4 statuses | [pipeline.md](pipeline.md) |

## 2. The stages a lead goes through

```mermaid
flowchart LR
  classDef a fill:#eaf7ee,stroke:#3a9a5b
  classDef b fill:#e8f1ff,stroke:#4a7bd0
  classDef end1 fill:#e6f7e6,stroke:#2e8b57
  classDef end2 fill:#fbe9e9,stroke:#c0392b

  S1["1 · Find<br/>People search<br/>from client portrait"]:::a
  S2["2 · Connect<br/>send invite<br/>→ Lead😴"]:::a
  S3["3 · Accept<br/>invite accepted"]:::a
  S4["4 · Research<br/>enrich profile<br/>+ score"]:::a
  S5["5 · First message<br/>ice-breaker DM<br/>→ Conversation 💬"]:::a
  S6["6 · Dialog<br/>read reply →<br/>Brain answers"]:::b
  W["Won<br/>call booked<br/>→ Active ✅"]:::end1
  L["Lost<br/>refusal or silence<br/>→ Lost❌"]:::end2

  S1 --> S2 --> S3 --> S4 --> S5 --> S6
  S6 --> W
  S6 --> L
  L -.-> S6
```

Step 6 repeats until there is an outcome. The dotted arrow means a Lost lead
who writes back returns to the dialog.

Steps **1–5 are Stage A** (green, every ~48h). Step **6 is Stage B** (blue,
every ~30 min). After **Active ✅**, a human takes over.

## 3. How one day looks

```mermaid
sequenceDiagram
  participant S as Scheduler
  participant A as Stage A
  participant B as Stage B
  participant Br as Brain
  participant CRM as CRM

  Note over S: every tick: reload .env, check what is due
  S->>A: Stage A due (~48h)
  A->>Br: write ice-breakers
  A->>CRM: new leads, Lead😴 → Conversation 💬
  loop every ~30 min (when no other job holds the lock)
    S->>B: Stage B due
    B->>Br: write replies
    B->>CRM: Conversation / Active / Lost
  end
  S->>Br: weekly analysis (no browser)
  Br->>Br: rewrite strategy notes for future messages
```

## 3 rules every engineer must know

1. **One browser at a time.** Stages never run in parallel, and `cycle.lock` enforces it.
2. **Protect the LinkedIn session.** No auto-login, no `/in/` profile visits for DMs, never save cookies without `li_at`.
3. **Four CRM statuses only**, imported from `crm/constants.js`.

The full list is in `CLAUDE.md` → "Critical safety rules".
