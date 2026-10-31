# Scheduler, cycle lock and LinkedIn session

The agent is one long-running Node process (`node index.js`) with three
self-rescheduling loops. They coordinate through `cycle.lock` so that only
**one Chromium-bearing job runs at a time**. This is the most important
invariant in the system.

## Scheduler loop

```mermaid
flowchart TD
  Boot(["container start"]) --> Flag{"force_run_once.json?<br/>(dashboard Save and restart)"}
  Flag -->|yes| Once["consumeForceRunOnceFlag<br/>run enabled stages once: A then B<br/>Stage A with CONNECT_PRIORITY"]
  Flag -->|no| Cold{"cold recreate, LinkedIn +<br/>outbound connect on,<br/>BOOT_FORCE_STAGE_A=1 (opt-in)?"}
  Cold -->|yes| ForceA["force one Stage A"]
  Cold -->|no| Loops
  Once --> Loops
  ForceA --> Loops

  subgraph Loops["setTimeout loops (reloadEnv() each tick)"]
    LA["loopA → tickStageA<br/>isStageADue (48h)"]
    LB["loopB → tickStageB<br/>stageBLoopDelayMs (30m ± jitter)"]
    LBr["tickBrainAnalysis<br/>isBrainAnalysisDue (7d)"]
  end
  LA --> LockA["withCycleLock('A', wait)"]
  LB --> LockB["withCycleLock('B', skipIfBusy)"]
  LBr --> LockBr["withCycleLock('Brain', wait)"]
```

`reloadEnv()` re-reads `.env` between ticks, so most dashboard settings apply
without a restart. Container-level env still needs `--force-recreate`.

## Cycle lock

```mermaid
flowchart LR
  subgraph Owners["cycle.lock owners (priority high → low)"]
    direction TB
    R["R · session repair<br/>(dashboard Sign in)"]
    A["A · Stage A"]
    Br["Brain · analysis (no browser)"]
    B["B · Stage B"]
    C["C · connect one-shot"]
  end
  R -->|"clears preempted A/B locks<br/>after dashboard stops agent"| A
  A ---|"same tier: wait up to LOCK_WAIT_MS"| Br
  Br -->|"B and C skip if busy"| B
  B --- C
```

| Behavior | Detail |
|----------|--------|
| Wait vs skip | `A` and `Brain` wait (`skipIfBusy: false`). `B` and `C` skip the tick |
| Stale | A lock older than `LOCK_STALE_MS` (3h) is cleared |
| Multi-cabinet | `dashboard/lib/browserQueue.js` `withBrowserLock` extends the same lock with `workspaceId` |
| Files | `cycleLock.js`, `cycle.lock` (gitignored) |

Never add a code path that opens a second browser in parallel. That includes
probe browsers "just to check" the session.

## LinkedIn session life cycle

```mermaid
stateDiagram-v2
  state "ok" as OK
  state "dead<br/>stages auto-paused" as Dead
  state "repair in progress<br/>(lock R)" as Repair
  state "challenge" as Ch {
    state "app_approval" as App
    state "pin (email/SMS/authenticator)" as Pin
    state "captcha" as Cap
    state "identity_document<br/>cannot finish in H.A.L.O." as Id
  }

  [*] --> OK : cookies.json with li_at
  OK --> Dead : auth wall / missing li_at<br/>markSessionDead
  Dead --> Repair : dashboard Sign in
  Dead --> OK : extension sync or cookie paste<br/>markSessionOk
  Repair --> Ch : sessionRepairWorker classifies
  Ch --> OK : li_at harvested<br/>copy repair profile → session_data
  Repair --> OK : no challenge
  Ch --> Dead : timeout / failure
```

On `markSessionDead`, `sessionHealth.js` snapshots which stages were on into
`stagesPausedBySession` and writes `SKIP_STAGE_A=1`, `SKIP_STAGE_B=1`,
`SKIP_CONVERSATION=1`, `OUTREACH_PAUSED=1`. `markSessionOk` restores exactly
that snapshot. A Telegram notification fires on each transition.

## Session rules (from production incidents)

1. `ALLOW_AUTO_LOGIN` stays `0`. Password login from the VPS kicks the operator's real browser.
2. `persistSessionCookies` skips the write when the live context has no `li_at`.
3. Never open `/in/` profiles to DM.
4. After a fresh cookie paste, wipe the old Chromium cookie DB in `session_data/`.
5. X has its own isolated health (`xSessionHealth.js`) and never touches LinkedIn's files.

Full list of known `li_at` kill causes: OVERVIEW §7.
