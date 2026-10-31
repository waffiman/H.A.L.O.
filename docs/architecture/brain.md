# Brain — copy generation, scoring, analysis

"Brain" is every LLM-facing part of H.A.L.O. Callers (`enrichAndWrite`,
`conversationAgent`) only ever call `generateSalesMessage()` in
[`salesBrain.js`](../../salesBrain.js). Prompt assembly, provider choice and
fallbacks all live behind that one call. Brain never opens LinkedIn.

## Prompt composition

```mermaid
flowchart LR
  UP["brain/user_prompt.md<br/>master prompt (dashboard-edited)"] --> C
  MODE["prompts/&lt;mode&gt;.md<br/>ice_breaker · reply · closing_followup"] --> C
  SN["brain/strategy_notes.md<br/>(if non-empty, VPS runtime)"] --> C
  SP["brain/sales_policy.json<br/>portrait · outcome · disqualifiers · booking · smartTiming"] --> RB["buildSalesReplyBlock"]
  C["brainStore.composeBrainSystem"] --> SYS["system prompt"]
  RB --> SYS
  SYS --> GSM["salesBrain.generateSalesMessage"]
```

In a cabinet (tenant), every path resolves under `tenantPaths(ws)`. WAFFi's
`default` workspace keeps the legacy root paths.

## 3-role pipeline

```mermaid
sequenceDiagram
  participant Caller as enrich / conversationAgent
  participant GSM as generateSalesMessage
  participant R as Researcher (GEMINI_API_KEY)
  participant W as Copywriter (GEMINI_API_KEY_2)
  participant I as Inspector (COHERE_API_KEY → Gemini)
  participant Legacy as single-shot cascade

  Caller->>GSM: mode, lead, profile, thread
  alt pipeline enabled (keys present, BRAIN_PIPELINE≠0)
    GSM->>R: profile + thread
    R-->>GSM: brief (nugget, friction, angle)
    GSM->>W: system prompt + brief
    W-->>GSM: draft
    GSM->>I: draft + contract
    I-->>GSM: humanized text or reject
  else pipeline off or any step throws
    GSM->>Legacy: OpenAI → Gemini → Cohere (OpenRouter optional)
    Legacy-->>GSM: text
  end
  GSM-->>Caller: text or reply decision JSON
```

## Enrich → score → ice (one call per lead)

```mermaid
flowchart LR
  A["Apify scrape<br/>scrapeLinkedInProfile"] --> N["resolveEnrichDisplayName<br/>official name wins"]
  N --> Card["leadCard.writeBasicEnrichCard<br/>fields, links, About, timezone"]
  Card --> DR{"DeepResearch<br/>toggle on?"}
  DR -->|yes| RD["runDeepResearch<br/>website reader · Brave search<br/>fills empty fields only"]
  DR -->|no| S
  RD --> S["leadScoring.scoreLead<br/>Inspector scoreLeadIcpFit<br/>fallback: rubric 1–10"]
  S --> Ice["generateSalesMessage<br/>mode = ice_breaker"]
  Ice --> W["crmStore.updateNameAndIceBreaker"]
```

Set `LEAD_SCORE_LLM=0` to use the deterministic rubric only. The score is
informational and never changes send order.

## Book-a-call outcome

```mermaid
stateDiagram-v2
  state "Conversation 💬" as C
  state "Active ✅" as A
  [*] --> C
  C --> C : soft yes → offer 1–2 precomputed slots<br/>(bookingSchedule, lead timezone)
  C --> A : lead picks a listed slot (booked_slot_id)<br/>DM adds GOOGLE_MEET_URL · Telegram calendar link
```

The LLM never invents times. Slots are computed server-side from
`sales_policy.json → booking`, and about 5 are injected into the reply prompt.

## Weekly strategy analysis

```mermaid
flowchart TD
  T(["tickBrainAnalysis"]) --> D{"isBrainAnalysisDue<br/>now − lastRunAt ≥ BRAIN_ANALYSIS_INTERVAL_MS"}
  D -->|no| X(["skip"])
  D -->|yes| L["withCycleLock('Brain')<br/>waits like Stage A"]
  L --> Q["CRM: Conversation 💬 + Lost❌<br/>Processing at within lookback"]
  Q --> P["one LLM call per lead → findings"]
  P --> W["rewrite brain/strategy_notes.md<br/>write brain/analysis_state.json"]
  W --> N["notify"]
```

**Never deploy `strategy_notes.md` or `analysis_state.json` from local.** They
are VPS runtime state, and a local copy wipes live analysis.

## Key files

| File | Role |
|------|------|
| `salesBrain.js` | `generateSalesMessage`, `scoreLeadIcpFit`, `scoreLeadFromReply`, pipeline + fallback |
| `brainStore.js` | Paths, `composeBrainSystem`, `readSalesPolicy`, portrait helpers |
| `enrichAndWrite.js`, `leadCard.js` | Enrich orchestration |
| `leadScoring.js` | Rubric + LLM score, reply rescore |
| `brainAnalyzer.js` | `runBrainAnalysis` |
| `brainLlmHealth.js` | Provider health surfaced in the dashboard |
| `bookingSchedule.js`, `googleCalendar.js` | Slots, calendar link |
