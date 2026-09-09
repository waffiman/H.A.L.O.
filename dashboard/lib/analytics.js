/**
 * Lightweight analytics history for the dashboard chart.
 * Snapshots CRM counts; activity series derived from notifications.json.
 */
import fs from 'fs';
import path from 'path';
import { APP_ROOT } from './env.js';
import { listNotifications } from './notifications.js';

const HISTORY_PATH = path.join(APP_ROOT, 'analytics_history.json');
const MAX_POINTS = 900; // ~90d of hourly CRM snapshots
const SNAPSHOT_MIN_MS = 55 * 60 * 1000; // ~hourly

function readHistory() {
  try {
    if (!fs.existsSync(HISTORY_PATH)) return { crm: [] };
    const raw = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
    return { crm: Array.isArray(raw.crm) ? raw.crm : [] };
  } catch {
    return { crm: [] };
  }
}

function writeHistory(hist) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(hist, null, 2));
}

/** Append CRM snapshot if enough time passed since last point. */
export function recordCrmSnapshot(counts, { force = false } = {}) {
  if (!counts || typeof counts !== 'object') return;
  const hist = readHistory();
  const now = Date.now();
  const last = hist.crm[hist.crm.length - 1];
  if (!force && last && now - Date.parse(last.t) < SNAPSHOT_MIN_MS) return;
  const point = {
    t: new Date().toISOString(),
    lead: Number(counts['Lead😴'] || 0),
    p1: Number(counts['Proposal 1️⃣'] || 0),
    p2: Number(counts['Proposal 2️⃣'] || 0),
    active: Number(counts['Active ✅'] || 0),
    lost: Number(counts['Lost❌'] || 0),
  };
  hist.crm.push(point);
  if (hist.crm.length > MAX_POINTS) hist.crm = hist.crm.slice(-MAX_POINTS);
  writeHistory(hist);
}

function rangeMs(range) {
  if (range === '24h') return 24 * 3600000;
  if (range === '90d') return 90 * 86400000;
  if (range === '7d') return 7 * 86400000;
  return 30 * 86400000; // default 30d
}

function inRange(iso, since) {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= since;
}

function dayKey(iso) {
  return String(iso || '').slice(0, 10);
}

/** Bucket notification events by day for outreach / health tabs. */
function activityFromNotifications(since) {
  const { items } = listNotifications();
  const byDay = {};
  for (const n of items || []) {
    if (!inRange(n.createdAt, since)) continue;
    const d = dayKey(n.createdAt);
    if (!byDay[d]) {
      byDay[d] = {
        t: `${d}T12:00:00.000Z`,
        leads: 0,
        inbound: 0,
        connect: 0,
        sessionDead: 0,
        sessionOk: 0,
        brain: 0,
      };
    }
    const type = n.type || '';
    if (type === 'leads' || type === 'sync') byDay[d].leads += 1;
    if (type === 'connect') byDay[d].connect += 1;
    if (type === 'inbox_inbound' || type === 'inbox_unknown') byDay[d].inbound += 1;
    if (type === 'session' && /inactive|dead|repair/i.test(n.title || '')) byDay[d].sessionDead += 1;
    if (type === 'session' && /restored|Active/i.test(n.title || '')) byDay[d].sessionOk += 1;
    if (type === 'brain_analysis') byDay[d].brain += 1;
  }
  return Object.keys(byDay)
    .sort()
    .map((k) => byDay[k]);
}

/**
 * Build series for the dashboard chart canvas.
 * @param {{ range?: string, tab?: string }} opts
 */
export function buildAnalyticsSeries(opts = {}) {
  const range = opts.range || '30d';
  const tab = opts.tab || 'pipeline';
  const since = Date.now() - rangeMs(range);
  const hist = readHistory();
  const crm = hist.crm.filter((p) => inRange(p.t, since));

  if (tab === 'pipeline') {
    return {
      ok: true,
      tab,
      range,
      metrics: [
        { id: 'p2', label: 'Proposal 2️⃣', color: '#9a6dd7' },
        { id: 'active', label: 'Active ✅', color: '#4dab9a' },
        { id: 'p1', label: 'Proposal 1️⃣', color: '#529cca' },
        { id: 'lead', label: 'Lead😴', color: '#787774' },
        { id: 'lost', label: 'Lost❌', color: '#e03e3e' },
      ],
      points: crm,
      note: crm.length < 2 ? 'Collecting history — open Dashboard periodically to build the chart.' : null,
    };
  }

  if (tab === 'outreach') {
    const points = activityFromNotifications(since);
    return {
      ok: true,
      tab,
      range,
      metrics: [
        { id: 'inbound', label: 'Inbound unread', color: '#3d9a6a' },
        { id: 'connect', label: 'Connect invites', color: '#f59e0b' },
        { id: 'leads', label: 'CRM imports', color: '#3b82f6' },
        { id: 'brain', label: 'Brain runs', color: '#a78bfa' },
      ],
      points,
      note: points.length < 1 ? 'No outreach events in this window yet.' : null,
    };
  }

  // health
  const points = activityFromNotifications(since);
  return {
    ok: true,
    tab: 'health',
    range,
    metrics: [
      { id: 'sessionDead', label: 'Session inactive', color: '#c45c5c' },
      { id: 'sessionOk', label: 'Session restored', color: '#3d9a6a' },
      { id: 'connect', label: 'Connect activity', color: '#f59e0b' },
    ],
    points,
    note: points.length < 1 ? 'No session events in this window yet.' : null,
  };
}
