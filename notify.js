/**
 * Agent-side helper to append dashboard notifications (same files as dashboard).
 * Respects TENANT_DATA_ROOT / WORKSPACE_ID so cabinets do not share one inbox.
 */
import fs from 'fs';
import path from 'path';

const TELEGRAM_DEDUP_MS = 6 * 60 * 60 * 1000;
const NOTIFICATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const ADMIN_ONLY_TYPES = new Set(['support_message', 'tenant_error']);

function waffiWorkspaceId() {
  return String(process.env.WAFFI_WORKSPACE_ID || 'default').trim() || 'default';
}

function resolveWorkspaceId(note = {}) {
  const type = String(note.type || '');
  if (ADMIN_ONLY_TYPES.has(type)) return waffiWorkspaceId();
  if (note.workspaceId) return String(note.workspaceId).trim() || waffiWorkspaceId();
  const envWs = String(process.env.WORKSPACE_ID || '').trim();
  return envWs || waffiWorkspaceId();
}

function notificationsPathFor(workspaceId) {
  const ws = String(workspaceId || waffiWorkspaceId()).trim() || waffiWorkspaceId();
  const tenantRoot = String(process.env.TENANT_DATA_ROOT || '').trim();
  if (tenantRoot && ws !== waffiWorkspaceId()) {
    return path.join(tenantRoot, 'notifications.json');
  }
  if (ws !== waffiWorkspaceId()) {
    return path.join(process.cwd(), 'halo-tenants', ws, 'notifications.json');
  }
  return path.join(process.cwd(), 'notifications.json');
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
    const parsed = Array.isArray(data.items) ? data : { items: [] };
    return pruneOld(parsed);
  } catch {
    return { items: [] };
  }
}

function save(workspaceId, data) {
  const file = notificationsPathFor(workspaceId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(pruneOld(data), null, 2));
}

/**
 * Fire-and-forget notify. Telegram copy is handled by dashboard when it polls,
 * or we try a direct Telegram send if env is set.
 */
function telegramDue(item) {
  if (!item) return false;
  const last = Date.parse(item.lastTelegramAt || 0);
  if (last && Date.now() - last < TELEGRAM_DEDUP_MS) return false;
  return true;
}

export async function notify(note) {
  const workspaceId = resolveWorkspaceId(note);
  const data = load(workspaceId);
  const key = note.key || null;
  if (key) {
    const recent = data.items.find(
      (i) =>
        i.key === key &&
        Date.now() - Date.parse(i.createdAt || i.updatedAt || 0) < TELEGRAM_DEDUP_MS
    );
    if (recent) {
      recent.message = note.message;
      recent.title = note.title;
      recent.workspaceId = workspaceId;
      recent.updatedAt = new Date().toISOString();
      // Never re-send Telegram for the same key inside the dedup window
      // (forceTelegram must not bypass this — it caused 3× session_dead spam).
      const lastTg = data.items
        .filter((i) => i.key === key)
        .map((i) => Date.parse(i.lastTelegramAt || 0))
        .filter((t) => Number.isFinite(t) && t > 0);
      const tgRecently = lastTg.some((t) => Date.now() - t < TELEGRAM_DEDUP_MS);
      const skipTg = note.skipTelegram || (workspaceId !== waffiWorkspaceId() && note.type === 'session');
      if (!tgRecently && telegramDue(recent) && !skipTg) {
        await maybeTelegram(recent);
        recent.lastTelegramAt = new Date().toISOString();
      }
      save(workspaceId, data);
      return recent;
    }
  }
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    workspaceId,
    type: note.type || 'general',
    title: String(note.title || 'Notification'),
    message: String(note.message || ''),
    severity: note.severity || 'info',
    key,
    read: false,
    createdAt: new Date().toISOString(),
  };
  data.items.unshift(item);
  save(workspaceId, data);
  const skipTg = note.skipTelegram || (workspaceId !== waffiWorkspaceId() && note.type === 'session');
  if (telegramDue(item) && !skipTg) {
    await maybeTelegram(item);
    item.lastTelegramAt = new Date().toISOString();
    save(workspaceId, data);
  }
  return item;
}

async function maybeTelegram(item) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chat = (process.env.TELEGRAM_NOTIFY_CHAT || process.env.TELEGRAM_NOTIFY_PHONE || '').trim();
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text: `🔔 ${item.title}\n\n${item.message}`,
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.error('notify telegram:', e.message);
  }
}
