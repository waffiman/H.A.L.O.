/**
 * Supabase pause guard — read-only wake pings when the agent won't touch CRM for >7 days.
 * Does not write data, acquire cycle locks, or start automation.
 */
import fs from 'fs';
import path from 'path';
import { APP_ROOT, readEnvFile } from './env.js';
import { crmBackend, supabaseConfigured } from './crmApi.js';
import { readHostCycleLock, connectOneShotRunning, repairContainerRunning } from './sessionRepair.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
/** Ping at most every 5 days — under Supabase's ~7-day free-tier pause window. */
const KEEPALIVE_INTERVAL_MS = 5 * DAY_MS;
/** Re-check settings when guard is off (stages may be toggled). */
const IDLE_RECHECK_MS = DAY_MS;
/** If a ping is due but automation is busy, retry later — not on a tight loop. */
const BUSY_RETRY_MS = 12 * 60 * 60 * 1000;

const STATE_PATH = path.join(APP_ROOT, 'supabase_keepalive_state.json');

let timer = null;
let pingInFlight = false;
let schedulerStarted = false;

function readState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return { lastPingAt: null, lastOk: null, lastError: null };
    return {
      lastPingAt: null,
      lastOk: null,
      lastError: null,
      ...JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')),
    };
  } catch {
    return { lastPingAt: null, lastOk: null, lastError: null };
  }
}

function writeState(patch) {
  const next = { ...readState(), ...patch };
  fs.writeFileSync(STATE_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function stageRuntime(env = readEnvFile()) {
  const linkedinOn = env.CHANNEL_LINKEDIN_ENABLED !== '0';
  const outreachOn = env.OUTREACH_PAUSED !== '1';
  const stageAOn = linkedinOn && outreachOn && env.SKIP_STAGE_A !== '1';
  const stageBOn =
    linkedinOn && outreachOn && env.SKIP_STAGE_B !== '1' && env.SKIP_CONVERSATION !== '1';
  const stageAMs = Number(env.STAGE_A_INTERVAL_MS || 172800000);
  const stageBMs = Number(env.STAGE_B_INTERVAL_MS || 1800000);
  return { stageAOn, stageBOn, stageAMs, stageBMs, linkedinOn, outreachOn };
}

/** Shortest CRM touch interval from enabled stages; Infinity if none will run. */
export function effectiveCrmTouchMs(env = readEnvFile()) {
  const { stageAOn, stageBOn, stageAMs, stageBMs } = stageRuntime(env);
  const intervals = [];
  if (stageAOn) intervals.push(stageAMs);
  if (stageBOn) intervals.push(stageBMs);
  if (!intervals.length) return Infinity;
  return Math.min(...intervals);
}

export function analyzeSupabaseKeepaliveNeed(env = readEnvFile()) {
  if (crmBackend(env) !== 'supabase' || !supabaseConfigured(env)) {
    return {
      needed: false,
      reason: 'not_supabase',
      effectiveTouchMs: null,
      effectiveTouchDays: null,
    };
  }

  const rt = stageRuntime(env);
  const touchMs = effectiveCrmTouchMs(env);
  const needed = touchMs > WEEK_MS;

  let reason = 'agent_covers_crm';
  if (!rt.linkedinOn || !rt.outreachOn) {
    reason = !rt.linkedinOn ? 'linkedin_channel_off' : 'outreach_paused';
  } else if (!rt.stageAOn && !rt.stageBOn) {
    reason = 'both_stages_off';
  } else if (rt.stageAOn && rt.stageBOn && rt.stageAMs > WEEK_MS && rt.stageBMs > WEEK_MS) {
    reason = 'both_intervals_over_week';
  } else if (rt.stageAOn && !rt.stageBOn && rt.stageAMs > WEEK_MS) {
    reason = 'stage_a_interval_over_week';
  } else if (!rt.stageAOn && rt.stageBOn && rt.stageBMs > WEEK_MS) {
    reason = 'stage_b_interval_over_week';
  }

  return {
    needed,
    reason,
    ...rt,
    effectiveTouchMs: Number.isFinite(touchMs) ? touchMs : null,
    effectiveTouchDays: Number.isFinite(touchMs) ? Math.round(touchMs / 86400000) : null,
  };
}

function automationBusy() {
  const lockOwner = readHostCycleLock();
  if (lockOwner) return { busy: true, detail: `cycle_lock_${lockOwner}` };
  if (connectOneShotRunning()) return { busy: true, detail: 'connect_oneshot' };
  if (repairContainerRunning()) return { busy: true, detail: 'repair_worker' };
  return { busy: false, detail: null };
}

/** Read-only PostgREST HEAD — wakes paused Supabase, changes nothing. */
export async function pingSupabaseWake(env = readEnvFile()) {
  const url = String(env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const workspace = String(env.WORKSPACE_ID || 'default').trim() || 'default';
  if (!url || !key) throw new Error('Supabase credentials missing');

  const endpoint = `${url}/rest/v1/leads?select=id&workspace_id=eq.${encodeURIComponent(workspace)}&limit=0`;
  const res = await fetch(endpoint, {
    method: 'HEAD',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=exact',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `Supabase wake ping failed (${res.status})`);
  }
  return { ok: true, at: new Date().toISOString(), status: res.status };
}

function computeNextDelayMs(env = readEnvFile()) {
  const analysis = analyzeSupabaseKeepaliveNeed(env);
  if (!analysis.needed) return IDLE_RECHECK_MS;

  const state = readState();
  const lastPingMs = state.lastPingAt ? Date.parse(state.lastPingAt) : 0;
  if (!lastPingMs) return 0;

  const remaining = lastPingMs + KEEPALIVE_INTERVAL_MS - Date.now();
  return remaining > 0 ? remaining : 0;
}

function scheduleNext(delayMs) {
  if (timer) clearTimeout(timer);
  const ms = delayMs ?? computeNextDelayMs();
  timer = setTimeout(() => {
    tick().catch((e) => console.warn('[supabase-keepalive] tick error:', e.message || e));
  }, Math.max(0, ms));
  if (typeof timer.unref === 'function') timer.unref();
}

export function getSupabaseKeepaliveStatus(env = readEnvFile()) {
  const analysis = analyzeSupabaseKeepaliveNeed(env);
  const state = readState();
  const busy = automationBusy();
  const lastPingMs = state.lastPingAt ? Date.parse(state.lastPingAt) : 0;
  const due =
    analysis.needed &&
    (!lastPingMs || Date.now() - lastPingMs >= KEEPALIVE_INTERVAL_MS);
  return {
    ...analysis,
    active: analysis.needed,
    intervalDays: KEEPALIVE_INTERVAL_MS / DAY_MS,
    lastPingAt: state.lastPingAt,
    lastOk: state.lastOk,
    lastError: state.lastError,
    nextPingDue: analysis.needed && lastPingMs
      ? new Date(lastPingMs + KEEPALIVE_INTERVAL_MS).toISOString()
      : analysis.needed
        ? 'soon'
        : null,
    pingDueNow: due,
    automationBusy: busy.busy,
    automationDetail: busy.detail,
  };
}

async function tick() {
  if (pingInFlight) {
    scheduleNext(BUSY_RETRY_MS);
    return;
  }

  const env = readEnvFile();
  const analysis = analyzeSupabaseKeepaliveNeed(env);
  if (!analysis.needed) {
    scheduleNext(IDLE_RECHECK_MS);
    return;
  }

  const state = readState();
  const lastPingMs = state.lastPingAt ? Date.parse(state.lastPingAt) : 0;
  if (lastPingMs && Date.now() - lastPingMs < KEEPALIVE_INTERVAL_MS) {
    scheduleNext();
    return;
  }

  const busy = automationBusy();
  if (busy.busy) {
    console.log(`[supabase-keepalive] skipped — ${busy.detail}`);
    scheduleNext(BUSY_RETRY_MS);
    return;
  }

  pingInFlight = true;
  try {
    await pingSupabaseWake(env);
    writeState({ lastPingAt: new Date().toISOString(), lastOk: true, lastError: null });
    console.log('[supabase-keepalive] wake ping OK (read-only)');
  } catch (e) {
    writeState({ lastPingAt: new Date().toISOString(), lastOk: false, lastError: e.message || String(e) });
    console.warn('[supabase-keepalive] wake ping failed:', e.message || e);
  } finally {
    pingInFlight = false;
    scheduleNext();
  }
}

export function startSupabaseKeepaliveScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const boot = setTimeout(() => {
    tick().catch((e) => console.warn('[supabase-keepalive] initial tick:', e.message || e));
  }, 15000);
  if (typeof boot.unref === 'function') boot.unref();
  console.log('[supabase-keepalive] scheduler started (adaptive)');
}
