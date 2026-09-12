/**
 * Lightweight analytics history for the dashboard chart.
 * Snapshots CRM counts; activity series derived from notifications.json.
 */
import fs from 'fs';
import path from 'path';
import { APP_ROOT } from './env.js';
import { listNotifications } from './notifications.js';

const HISTORY_PATH = path.join(APP_ROOT, 'analytics_history.json');
const MAX_POINTS = 4500; // ~180d of hourly CRM snapshots
const SNAPSHOT_MIN_MS = 55 * 60 * 1000; // ~hourly

const PRESET_MS = {
  '1h': 1 * 3600000,
  '6h': 6 * 3600000,
  '12h': 12 * 3600000,
  '24h': 24 * 3600000,
  '3d': 3 * 86400000,
  '7d': 7 * 86400000,
  '14d': 14 * 86400000,
  '30d': 30 * 86400000,
  '60d': 60 * 86400000,
  '90d': 90 * 86400000,
  '180d': 180 * 86400000,
  '365d': 365 * 86400000,
  '1y': 365 * 86400000,
};

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
  const lead = Number(counts['Lead😴'] || 0);
  const conversation = Number(counts['Conversation 💬'] || counts['Proposal 2️⃣'] || 0);
  const active = Number(counts['Active ✅'] || 0);
  const lost = Number(counts['Lost❌'] || 0);
  const point = {
    t: new Date().toISOString(),
    lead,
    conversation,
    // legacy keys kept so older chart points still render
    p1: 0,
    p2: conversation,
    active,
    lost,
    total: lead + conversation + active + lost,
  };
  hist.crm.push(point);
  if (hist.crm.length > MAX_POINTS) hist.crm = hist.crm.slice(-MAX_POINTS);
  writeHistory(hist);
}

function parseTs(value) {
  if (value == null || value === '') return NaN;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const s = String(value).trim();
  if (/^\d{10,13}$/.test(s)) {
    const n = Number(s);
    return s.length <= 10 ? n * 1000 : n;
  }
  // date-only → start/end of day handled by callers via endOfDay flag
  const t = Date.parse(s);
  return t;
}

function endOfLocalDayMs(isoOrDate) {
  const s = String(isoOrDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return Date.parse(`${s}T23:59:59.999Z`);
  }
  const t = parseTs(s);
  return Number.isFinite(t) ? t : NaN;
}

/**
 * Resolve [from, to] window from preset range and/or explicit from/to.
 * @returns {{ from: number, to: number, range: string, custom: boolean }}
 */
export function resolveAnalyticsWindow(opts = {}) {
  const now = Date.now();
  let range = String(opts.range || '30d').toLowerCase();
  const fromRaw = opts.from;
  const toRaw = opts.to;

  let to = Number.isFinite(parseTs(toRaw)) ? endOfLocalDayMs(toRaw) : now;
  if (!Number.isFinite(to)) to = now;
  if (to > now + 86400000) to = now;

  let from;
  const custom =
    range === 'custom' ||
    (fromRaw != null && String(fromRaw).trim() !== '' && Number.isFinite(parseTs(fromRaw)));

  if (custom && fromRaw != null && String(fromRaw).trim() !== '') {
    from = parseTs(fromRaw);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(fromRaw).trim())) {
      from = Date.parse(`${String(fromRaw).trim()}T00:00:00.000Z`);
    }
    range = 'custom';
  } else if (range === 'all') {
    from = 0;
  } else if (PRESET_MS[range] != null) {
    from = to - PRESET_MS[range];
  } else {
    // freeform like "5d", "48h", "2w"
    const m = /^(\d+)\s*(h|d|w|m)$/i.exec(range);
    if (m) {
      const n = Number(m[1]);
      const u = m[2].toLowerCase();
      const mult = u === 'h' ? 3600000 : u === 'd' ? 86400000 : u === 'w' ? 7 * 86400000 : 30 * 86400000;
      from = to - n * mult;
    } else {
      range = '30d';
      from = to - PRESET_MS['30d'];
    }
  }

  if (!Number.isFinite(from)) from = to - PRESET_MS['30d'];
  if (from > to) {
    const tmp = from;
    from = to;
    to = tmp;
  }
  // Cap absurd windows
  const maxSpan = 366 * 86400000;
  if (to - from > maxSpan) from = to - maxSpan;

  return { from, to, range, custom: range === 'custom' };
}

function inWindow(iso, from, to) {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= from && t <= to;
}

function dayKey(iso) {
  return String(iso || '').slice(0, 10);
}

function hourKey(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

function weekKey(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function pickBucket(spanMs, requested) {
  const r = String(requested || 'auto').toLowerCase();
  if (r === 'hour' || r === 'day' || r === 'week') return r;
  if (spanMs <= 3 * 86400000) return 'hour';
  if (spanMs <= 120 * 86400000) return 'day';
  return 'week';
}

function emptyActivity() {
  return {
    leads: 0,
    sync: 0,
    inbound: 0,
    connect: 0,
    sessionDead: 0,
    sessionOk: 0,
    brain: 0,
    booked: 0,
    restarts: 0,
    events: 0,
  };
}

function classifyNotification(n, bucket) {
  const type = n.type || '';
  const title = n.title || '';
  const msg = n.message || '';
  const blob = `${title} ${msg}`;
  if (type === 'leads') bucket.leads += 1;
  if (type === 'sync') bucket.sync += 1;
  if (type === 'leads' || type === 'sync') {
    // keep legacy "CRM imports" combo for charts that still want it
  }
  if (type === 'connect') bucket.connect += 1;
  if (type === 'inbox_inbound' || type === 'inbox_unknown') bucket.inbound += 1;
  if (type === 'session' && /inactive|dead|repair/i.test(title)) bucket.sessionDead += 1;
  if (type === 'session' && /restored|Active/i.test(title)) bucket.sessionOk += 1;
  if (type === 'brain_analysis') bucket.brain += 1;
  if (type === 'booked_call') bucket.booked += 1;
  if (type === 'agent_restart') bucket.restarts += 1;
  if (/ice.?break|icebreaker/i.test(blob)) bucket.ice = (bucket.ice || 0) + 1;
  if (/\bdm\b|direct message|stage\s*b/i.test(blob)) bucket.dm = (bucket.dm || 0) + 1;
  bucket.events += 1;
}

/** Bucket notification events for outreach / health tabs. */
function activityFromNotifications(from, to, bucketMode, workspaceId) {
  const { items } = listNotifications(workspaceId);
  const byKey = {};
  for (const n of items || []) {
    if (!inWindow(n.createdAt, from, to)) continue;
    let key;
    let tLabel;
    if (bucketMode === 'hour') {
      key = hourKey(n.createdAt);
      if (!key) continue;
      tLabel = `${key}:00:00.000Z`;
    } else if (bucketMode === 'week') {
      key = weekKey(n.createdAt);
      if (!key) continue;
      tLabel = `${key}T12:00:00.000Z`;
    } else {
      key = dayKey(n.createdAt);
      tLabel = `${key}T12:00:00.000Z`;
    }
    if (!byKey[key]) {
      byKey[key] = { t: tLabel, ...emptyActivity(), ice: 0, dm: 0 };
    }
    classifyNotification(n, byKey[key]);
  }
  return Object.keys(byKey)
    .sort()
    .map((k) => {
      const p = byKey[k];
      p.crmImports = (p.leads || 0) + (p.sync || 0);
      return p;
    });
}

function enrichCrmPoint(p) {
  const lead = Number(p.lead || 0);
  const conversation = Number(p.conversation ?? p.p2 ?? 0);
  const active = Number(p.active || 0);
  const lost = Number(p.lost || 0);
  const total = lead + conversation + active + lost;
  const open = lead + conversation;
  const closed = active + lost;
  const decided = active + lost;
  return {
    ...p,
    conversation,
    total: p.total != null ? Number(p.total) : total,
    open,
    closed,
    winRate: decided > 0 ? Math.round((active / decided) * 1000) / 10 : 0,
    lostRate: decided > 0 ? Math.round((lost / decided) * 1000) / 10 : 0,
    activeShare: total > 0 ? Math.round((active / total) * 1000) / 10 : 0,
    conversationShare: total > 0 ? Math.round((conversation / total) * 1000) / 10 : 0,
    leadShare: total > 0 ? Math.round((lead / total) * 1000) / 10 : 0,
    openShare: total > 0 ? Math.round((open / total) * 1000) / 10 : 0,
  };
}

function downsample(points, maxKeep) {
  if (!Array.isArray(points) || points.length <= maxKeep) return points;
  const out = [];
  const step = (points.length - 1) / (maxKeep - 1);
  for (let i = 0; i < maxKeep; i++) {
    out.push(points[Math.round(i * step)]);
  }
  return out;
}

/**
 * Build series for the dashboard chart canvas.
 * @param {{ range?: string, tab?: string, from?: string, to?: string, bucket?: string }} opts
 */
export function buildAnalyticsSeries(opts = {}) {
  const tab = opts.tab || 'pipeline';
  const window = resolveAnalyticsWindow(opts);
  const { from, to, range } = window;
  const spanMs = Math.max(0, to - from);
  const bucket = pickBucket(spanMs, opts.bucket);
  const hist = readHistory();
  const crmRaw = hist.crm.filter((p) => inWindow(p.t, from, to)).map(enrichCrmPoint);
  // Keep chart readable on long windows
  const crm = downsample(crmRaw, bucket === 'hour' ? 240 : bucket === 'week' ? 120 : 180);

  const meta = {
    ok: true,
    tab,
    range,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    bucket,
    spanMs,
    custom: window.custom,
  };

  if (tab === 'pipeline') {
    return {
      ...meta,
      metrics: [
        { id: 'total', label: 'Total leads', color: '#94a3b8' },
        { id: 'open', label: 'Open (Lead+Conv)', color: '#60a5fa' },
        { id: 'conversation', label: 'Conversation 💬', color: '#9a6dd7' },
        { id: 'active', label: 'Active ✅', color: '#4dab9a' },
        { id: 'lead', label: 'Lead😴', color: '#787774' },
        { id: 'closed', label: 'Closed (Active+Lost)', color: '#f59e0b' },
        { id: 'lost', label: 'Lost❌', color: '#e03e3e' },
      ],
      points: crm,
      note: crm.length < 2 ? 'Collecting history — open Dashboard periodically to build the chart.' : null,
    };
  }

  if (tab === 'rates') {
    return {
      ...meta,
      metrics: [
        { id: 'winRate', label: 'Win rate %', color: '#4dab9a', unit: 'pct' },
        { id: 'lostRate', label: 'Lost rate %', color: '#e03e3e', unit: 'pct' },
        { id: 'activeShare', label: 'Active share %', color: '#2dd4bf', unit: 'pct' },
        { id: 'conversationShare', label: 'Conversation share %', color: '#9a6dd7', unit: 'pct' },
        { id: 'leadShare', label: 'Lead share %', color: '#787774', unit: 'pct' },
        { id: 'openShare', label: 'Open share %', color: '#60a5fa', unit: 'pct' },
      ],
      points: crm,
      note: crm.length < 2 ? 'Collecting history — rates appear once a few CRM snapshots exist.' : null,
    };
  }

  const points = activityFromNotifications(from, to, bucket, opts.workspaceId);

  if (tab === 'outreach') {
    return {
      ...meta,
      metrics: [
        { id: 'inbound', label: 'Inbound unread', color: '#3d9a6a' },
        { id: 'connect', label: 'Connect invites', color: '#f59e0b' },
        { id: 'crmImports', label: 'CRM imports', color: '#3b82f6' },
        { id: 'leads', label: 'New leads sync', color: '#38bdf8' },
        { id: 'sync', label: 'Network sync', color: '#818cf8' },
        { id: 'brain', label: 'Brain runs', color: '#a78bfa' },
        { id: 'booked', label: 'Booked calls', color: '#f472b6' },
        { id: 'ice', label: 'Ice-breaker events', color: '#c084fc' },
        { id: 'dm', label: 'DM / Stage B events', color: '#fb7185' },
        { id: 'events', label: 'All events', color: '#94a3b8' },
      ],
      points,
      note: points.length < 1 ? 'No outreach events in this window yet.' : null,
    };
  }

  // health / session
  return {
    ...meta,
    tab: 'health',
    metrics: [
      { id: 'sessionDead', label: 'Session inactive', color: '#c45c5c' },
      { id: 'sessionOk', label: 'Session restored', color: '#3d9a6a' },
      { id: 'connect', label: 'Connect activity', color: '#f59e0b' },
      { id: 'restarts', label: 'Agent restarts', color: '#f97316' },
      { id: 'booked', label: 'Booked calls', color: '#f472b6' },
      { id: 'brain', label: 'Brain runs', color: '#a78bfa' },
      { id: 'events', label: 'All events', color: '#94a3b8' },
    ],
    points,
    note: points.length < 1 ? 'No session events in this window yet.' : null,
  };
}
