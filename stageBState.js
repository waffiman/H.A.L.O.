/**
 * Stage B due tracking — Chromium opens follow the dashboard Stage B interval
 * plus random ±1…5 min jitter (stored per cycle in stage_b_state.json).
 *
 * effective gap = STAGE_B_INTERVAL_MS ± jitter
 * Optional STAGE_B_BROWSER_MIN_MS (>0) raises a floor: max(tick, floor).
 */
import fs from 'fs';
import path from 'path';

const STATE_PATH = path.join(process.cwd(), 'stage_b_state.json');
/** User-facing minimum Stage B interval (> 5 minutes). */
export const STAGE_B_MIN_GAP_MS = 6 * 60 * 1000;

export function loadStageBState() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    }
  } catch {
    /* ignore */
  }
  return { lastInboxScanAt: null, lastBrowserAt: null };
}

export function saveStageBState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function stageBBaseIntervalMs() {
  const tick = Number(process.env.STAGE_B_INTERVAL_MS || 1800000);
  return Number.isFinite(tick) && tick > 0 ? tick : 1800000;
}

/** Random ±1…5 minutes in 1-minute steps. */
export function sampleStageBJitterMs() {
  const minutes = 1 + Math.floor(Math.random() * 5);
  const sign = Math.random() < 0.5 ? -1 : 1;
  return sign * minutes * 60 * 1000;
}

/** Base interval + jitter, never below STAGE_B_MIN_GAP_MS. */
export function computeStageBNextGapMs(jitterMs = sampleStageBJitterMs()) {
  return Math.max(STAGE_B_MIN_GAP_MS, stageBBaseIntervalMs() + jitterMs);
}

function forceBrowserOpen() {
  return process.env.FORCE_STAGE_B_BROWSER === '1' || process.env.FORCE_STAGE_B_INBOX === '1';
}

function dueAtPassed(iso) {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && Date.now() >= t;
}

function legacyElapsedDue(lastAt, gapMs) {
  if (!lastAt) return true;
  const elapsed = Date.now() - Date.parse(lastAt);
  return Number.isFinite(elapsed) && elapsed >= gapMs;
}

/** Min gap between any Stage B Chromium open (inbox or silence). */
export function effectiveBrowserGapMs(state = loadStageBState()) {
  const floorRaw =
    process.env.STAGE_B_BROWSER_MIN_MS != null && process.env.STAGE_B_BROWSER_MIN_MS !== ''
      ? process.env.STAGE_B_BROWSER_MIN_MS
      : process.env.STAGE_B_INBOX_INTERVAL_MS;
  const base =
    Number.isFinite(Number(state.lastScheduledGapMs)) && state.lastScheduledGapMs > 0
      ? Number(state.lastScheduledGapMs)
      : stageBBaseIntervalMs();
  if (floorRaw == null || floorRaw === '') return base;
  const floor = Number(floorRaw);
  if (!Number.isFinite(floor) || floor <= 0) return base;
  return Math.max(base, floor);
}

export function canOpenBrowser(state = loadStageBState()) {
  if (forceBrowserOpen()) return true;
  if (dueAtPassed(state.nextBrowserDueAt)) return true;
  if (state.nextBrowserDueAt) return false;
  return legacyElapsedDue(state.lastBrowserAt, stageBBaseIntervalMs());
}

/** Inbox LinkedIn scrape — same schedule as browser (tied to dashboard Stage B interval + jitter). */
export function isInboxScanDue(state = loadStageBState()) {
  if (forceBrowserOpen()) return true;
  if (dueAtPassed(state.nextInboxScanDueAt || state.nextBrowserDueAt)) return true;
  if (state.nextInboxScanDueAt || state.nextBrowserDueAt) return false;
  return legacyElapsedDue(state.lastInboxScanAt, stageBBaseIntervalMs());
}

function scheduleNextStageBDue(state) {
  const gap = computeStageBNextGapMs();
  const due = new Date(Date.now() + gap).toISOString();
  state.nextBrowserDueAt = due;
  state.nextInboxScanDueAt = due;
  state.lastScheduledGapMs = gap;
  return gap;
}

/** Delay until the next Stage B scheduler tick (respects stored jitter target). */
export function stageBLoopDelayMs(state = loadStageBState()) {
  const dueAt = state.nextBrowserDueAt || state.nextInboxScanDueAt;
  if (dueAt) {
    const remain = Date.parse(dueAt) - Date.now();
    if (remain > 0) return remain;
    return 60 * 1000;
  }
  return computeStageBNextGapMs();
}

export function markInboxScanned() {
  const state = loadStageBState();
  const now = new Date().toISOString();
  state.lastInboxScanAt = now;
  state.lastBrowserAt = now;
  const gap = scheduleNextStageBDue(state);
  saveStageBState(state);
  console.log(
    `Stage B next run scheduled in ~${Math.round(gap / 60000)} min (base ${Math.round(stageBBaseIntervalMs() / 60000)} ±1–5 min jitter).`
  );
  return state;
}

export function markStageBBrowserRan() {
  const state = loadStageBState();
  state.lastBrowserAt = new Date().toISOString();
  saveStageBState(state);
  return state;
}

/** After any Stage B Chromium run, schedule the next jittered tick if not already set. */
export function ensureStageBScheduled(state = loadStageBState()) {
  if (state.nextBrowserDueAt && Date.parse(state.nextBrowserDueAt) > Date.now()) {
    return state;
  }
  const gap = scheduleNextStageBDue(state);
  saveStageBState(state);
  console.log(
    `Stage B next run scheduled in ~${Math.round(gap / 60000)} min (base ${Math.round(stageBBaseIntervalMs() / 60000)} ±1–5 min jitter).`
  );
  return state;
}
