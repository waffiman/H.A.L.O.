/**
 * Per-cabinet notification store.
 * WAFFi default: APP_ROOT/notifications.json
 * Other cabinets: APP_ROOT/halo-tenants/<workspaceId>/notifications.json
 *
 * Admin-only types (support_message, tenant_error) always land on the WAFFi cabinet.
 */
import fs from 'fs';
import path from 'path';
import { APP_ROOT, get, readEnvFile } from './env.js';
import { waffiWorkspaceId } from './tenants.js';
import { tenantPaths, ensureTenantRuntime } from './tenantRuntime.js';

/** @deprecated Prefer notificationsPathFor(workspaceId) — kept for imports that expect a path. */
export const NOTIFICATIONS_PATH = path.join(APP_ROOT, 'notifications.json');

const TELEGRAM_DEDUP_MS = 6 * 60 * 60 * 1000;
const NOTIFICATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const ADMIN_ONLY_TYPES = new Set(['support_message', 'tenant_error']);

function normalizeWorkspaceId(workspaceId) {
  const ws = String(workspaceId || '').trim();
  return ws || waffiWorkspaceId();
}

/** Resolve which cabinet should own this notification. */
export function resolveNotificationWorkspace(note = {}) {
  const type = String(note.type || '');
  if (ADMIN_ONLY_TYPES.has(type)) return waffiWorkspaceId();
  return normalizeWorkspaceId(note.workspaceId);
}

export function notificationsPathFor(workspaceId) {
  const ws = normalizeWorkspaceId(workspaceId);
  const paths = tenantPaths(ws);
  if (!paths.isLegacy) {
    try {
      ensureTenantRuntime(ws);
    } catch {
      /* ignore */
    }
  }
  return path.join(paths.root, 'notifications.json');
}

function pruneOld(data) {
  const cutoff = Date.now() - NOTIFICATION_RETENTION_MS;
  const items = Array.isArray(data.items) ? data.items : [];
  data.items = items.filter((i) => {
    const t = Date.parse(i.createdAt || i.updatedAt || 0);
    return Number.isFinite(t) && t >= cutoff;
  });
  return data;
}

function load(workspaceId) {
  const file = notificationsPathFor(workspaceId);
  try {
    if (!fs.existsSync(file)) return { items: [] };
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(data.items)) return { items: [] };
    return pruneOld(data);
  } catch {
    return { items: [] };
  }
}

function save(workspaceId, data) {
  const file = notificationsPathFor(workspaceId);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(pruneOld(data), null, 2));
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @param {{ type?: string, title: string, message: string, severity?: 'info'|'warn'|'error', key?: string, workspaceId?: string, skipTelegram?: boolean }} note
 */
export function addNotification(note) {
  const targetWs = resolveNotificationWorkspace(note);
  const data = load(targetWs);
  const key = note.key || null;
  if (key) {
    const recent = data.items.find(
      (i) => i.key === key && Date.now() - Date.parse(i.createdAt || i.lastTelegramAt || 0) < TELEGRAM_DEDUP_MS
    );
    if (recent) {
      recent.message = note.message;
      recent.title = note.title;
      recent.workspaceId = targetWs;
      recent.updatedAt = new Date().toISOString();
      save(targetWs, data);
      return recent;
    }
  }
  const item = {
    id: uid(),
    workspaceId: targetWs,
    type: note.type || 'general',
    title: String(note.title || 'Notification'),
    message: String(note.message || ''),
    severity: note.severity || 'info',
    key,
    read: false,
    createdAt: new Date().toISOString(),
  };
  data.items.unshift(item);
  save(targetWs, data);
  if (!note.skipTelegram) {
    const alreadySent = key
      ? data.items.some(
          (i) => i.key === key && i.lastTelegramAt && Date.now() - Date.parse(i.lastTelegramAt) < TELEGRAM_DEDUP_MS
        )
      : false;
    if (!alreadySent) {
      item.lastTelegramAt = new Date().toISOString();
      save(targetWs, data);
      sendTelegramCopy(item).catch(() => {});
    }
  }
  return item;
}

export function listNotifications(workspaceId) {
  const ws = normalizeWorkspaceId(workspaceId);
  const data = load(ws);
  // Harden: never leak rows tagged for another cabinet (legacy global file).
  data.items = data.items.filter((i) => {
    const rowWs = String(i.workspaceId || '').trim();
    if (!rowWs) return ws === waffiWorkspaceId(); // untagged legacy → WAFFi only
    return rowWs === ws;
  });
  save(ws, data);
  const unread = data.items.filter((i) => !i.read).length;
  return { ok: true, items: data.items, unread, workspaceId: ws };
}

export function markNotificationRead(id, workspaceId) {
  const ws = normalizeWorkspaceId(workspaceId);
  const data = load(ws);
  const item = data.items.find((i) => i.id === id);
  if (!item) return { ok: false, error: 'not found' };
  const rowWs = String(item.workspaceId || '').trim();
  if (rowWs && rowWs !== ws) return { ok: false, error: 'not found' };
  item.read = true;
  item.readAt = new Date().toISOString();
  save(ws, data);
  return { ok: true, item, unread: data.items.filter((i) => !i.read).length };
}

export function markAllNotificationsRead(workspaceId) {
  const ws = normalizeWorkspaceId(workspaceId);
  const data = load(ws);
  const now = new Date().toISOString();
  for (const i of data.items) {
    const rowWs = String(i.workspaceId || '').trim();
    if (rowWs && rowWs !== ws) continue;
    if (!i.read) {
      i.read = true;
      i.readAt = now;
    }
  }
  save(ws, data);
  return { ok: true, unread: 0 };
}

/**
 * Telegram: TELEGRAM_BOT_TOKEN + TELEGRAM_NOTIFY_CHAT (chat id preferred; phone stored for display).
 * Bots cannot message by phone alone — chat id is required after user starts the bot.
 */
async function sendTelegramCopy(item) {
  const env = readEnvFile();
  const token = (env.TELEGRAM_BOT_TOKEN || get('TELEGRAM_BOT_TOKEN') || '').trim();
  const chat = (env.TELEGRAM_NOTIFY_CHAT || env.TELEGRAM_NOTIFY_PHONE || '').trim();
  if (!token || !chat) return;

  const text = `🔔 ${item.title}\n\n${item.message}\n\n(${item.severity || 'info'})`;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chat,
      text,
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('Telegram notify failed:', res.status, body.slice(0, 200));
  }
}

/** Sync session health into notifications (idempotent via key). */
export function syncSessionNotifications(session, cookies, workspaceId) {
  const ws = normalizeWorkspaceId(workspaceId);
  let flagged = false;
  if (session && session.ok === false) {
    addNotification({
      workspaceId: ws,
      key: `session_dead_${ws}`,
      type: 'session',
      severity: 'error',
      title: 'LinkedIn session inactive',
      message: `LinkedIn session is no longer valid${session.reason ? ` (${session.reason})` : ''}. Open H.A.L.O. → LinkedIn and Sign in (email/password + app approval if asked).`,
      // Tenant session alerts stay in-cabinet; avoid spamming shared admin Telegram for every trial user.
      skipTelegram: ws !== waffiWorkspaceId(),
    });
    flagged = true;
  }
  if (cookies && cookies.present === false) {
    addNotification({
      workspaceId: ws,
      key: `session_missing_li_at_${ws}`,
      type: 'session',
      severity: 'error',
      title: 'LinkedIn li_at cookie missing',
      message: 'No valid LinkedIn session on the server. Use Sign in on the LinkedIn page (email/password + app approval).',
      skipTelegram: ws !== waffiWorkspaceId(),
    });
    flagged = true;
  }
  if (flagged && workspaceId) {
    import('./supportChat.js')
      .then(({ flagTenantError }) =>
        flagTenantError(workspaceId, {
          title: session?.ok === false ? 'LinkedIn session inactive' : 'LinkedIn li_at missing',
          message: session?.reason || 'Session / cookie error',
        })
      )
      .catch(() => {});
  }
}
