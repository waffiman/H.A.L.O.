# Stage B — conversation

Stage B keeps dialogs going. It revives `Lost❌` leads who wrote back, replies
to `Conversation 💬` threads, and closes silent ones. It ticks every
`STAGE_B_INTERVAL_MS` (default 30m, min 6m in the UI) plus ±1–5 min jitter,
under `cycle.lock` owner `B` with `skipIfBusy: true`. It skips the tick if
Stage A holds the lock. Entry point: `runStageB()` in [`index.js`](../../index.js).

## Flow

```mermaid
flowchart TD
  classDef li stroke:#d33,stroke-width:2px
  classDef guard fill:#fff4e5,stroke:#e0a040

  T(["tickStageB"]) --> L["withCycleLock('B', skipIfBusy)"]
  L --> G{"paused / SKIP_STAGE_B /<br/>SKIP_CONVERSATION /<br/>LinkedIn off / session dead?"}:::guard
  G -->|yes| Skip(["skip"])
  G -->|no| Pre["CRM preflight (no browser)<br/>silenceDue = Conversation 💬 with<br/>Processing at ≥ SILENCE_BUSINESS_DAYS"]
  Pre --> Due{"inbox scan due or silenceDue > 0?"}
  Due -->|no| Idle(["idle: no Chromium<br/>(protects li_at)"])
  Due -->|yes| Cool{"browser cooldown elapsed<br/>or silence due?"}
  Cool -->|no| Idle
  Cool -->|yes| Open["open Chromium"]:::li

  Open --> Scrape["1 · scrapeInboxConversations<br/>desktop messaging list"]:::li
  Scrape --> Filter["drop sponsored / Recruiter InMail rows"]
  Filter --> Each{"for each unread sender:<br/>findCrmBySenderName"}
  Each -->|"Lost❌"| Revive["revive → Conversation 💬<br/>refresh Processing at<br/>no reply this cycle"]
  Each -->|not in CRM| Notify["Telegram notify once per<br/>sender+preview, never reply"]
  Each -->|"Conversation 💬"| Queue["reply queue"]
  Filter --> Read["already-read Conversation threads<br/>where lead sent last message<br/>≤ STAGE_B_READ_INBOUND_MAX"] --> Queue

  Queue --> Reply["2 · per lead: open thread from inbox list<br/>scrapeThreadMessages → threadHasInbound"]:::li
  Reply --> Decide["decideReplyForLead<br/>rescore → Copywriter"]
  Decide --> Out{"decision"}
  Out -->|stay| SendR["send reply<br/>stay Conversation 💬"]:::li
  Out -->|book accepted| Act["send confirm (+ Meet URL)<br/>→ Active ✅ + Telegram calendar link"]:::li
  Out -->|not interested| Lst["→ Lost❌"]

  SendR & Act & Lst --> Sil["3 · Silence closings<br/>skip weekends / revived ids<br/>≤ STAGE_B_SILENCE_MAX"]
  Sil --> Close["craftClosingFollowup → send<br/>→ Lost❌ (no_reply)"]:::li
  Close --> End(["persist cookies if live li_at<br/>close browser · schedule next tick"])
```

The order is strict: revive → reply → silence. A revived lead gets its reply
on the **next** cycle, so one cycle never revives and replies to the same
thread.

## One reply, end to end

```mermaid
sequenceDiagram
  autonumber
  participant SB as runStageB
  participant LI as LinkedIn messaging
  participant CRM as crmStore
  participant CA as conversationAgent
  participant SC as leadScoring / salesBrain
  participant BR as salesBrain.generateSalesMessage
  participant LLM as LLM providers
  participant TG as Telegram

  SB->>LI: open thread from inbox row
  LI-->>SB: messages (mwlite DOM scrape)
  SB->>SB: threadHasInbound(messages, ourTexts)
  SB->>CA: decideReplyForLead(lead, thread, inboundText)
  CA->>SC: rescoreLeadOnReply (Inspector, ±0–3)
  SC->>CRM: patchLead lead_score
  CA->>BR: mode = reply, booking slots injected
  BR->>LLM: Researcher → Copywriter → Inspector
  LLM-->>BR: JSON decision + text
  BR-->>CA: text, status, booked_slot_id
  CA-->>SB: decision
  SB->>LI: type + send in thread composer
  SB->>CRM: Processing at, status, append inbound+reply to notes
  opt status = Active ✅
    SB->>TG: notifyBookedCall + Add-to-Calendar link
  end
```

## Key files

| File | Function | Role |
|------|----------|------|
| `index.js` | `runStageB`, `scrapeInboxConversations`, `collectUnreadP2Leads` | Orchestration, inbox scrape |
| `conversationAgent.js` | `decideReplyForLead`, `craftClosingFollowup`, `threadHasInbound`, `namesMatch` | Reply logic |
| `leadScoring.js` | `rescoreLeadOnReply`, `heuristicReplyRescore` | Reply-time score update (fail-open) |
| `bookingSchedule.js`, `googleCalendar.js` | — | Precomputed slots, calendar link |
| `stageBState.js` | `isInboxScanDue`, `canOpenBrowser`, `ensureStageBScheduled` | Jittered cadence (`stage_b_state.json`) |

## Safety rules that apply

- Threads are opened **from the inbox list**, never by visiting `/in/` profiles
  (`STAGE_B_SCAN_ALL_P2=1` exists for debugging only).
- Unknown senders are never auto-replied.
- Abort on auth wall, and mark the session dead instead of retrying.
