/**
 * Lightweight notification store for the outreach dashboard.
 * File: APP_ROOT/notifications.json
 */
import fs from 'fs';
import path from 'path';
import { APP_ROOT, get, readEnvFile } from './env.js';

export const NOTIFICATIONS_PATH = path.join(APP_ROOT, 'notifications.json');

const TELEGRAM_DEDUP_MS = 6 * 60 * 60 * 1000;
const NOTIFICATION_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

function pruneOld(data) {
  const cutoff = Date.now() - NOTIFICATION_RETENTION_MS;
  const items = Array.isArray(data.items) ? data.items : [];
  data.items = items.filter((i) => {
    const t = Date.parse(i.createdAt || i.updatedAt || 0);
    return Number.isFinite(t) && t >= cutoff;
  });
  return data;
}

function load() {
  try {
    if (!fs.existsSync(NOTIFICATIONS_PATH)) return { items: [] };
    const data = JSON.parse(fs.readFileSync(NOTIFICATIONS_PATH, 'utf8'));
    if (!Array.isArray(data.items)) return { items: [] };
    return pruneOld(data);
  } catch {
    return { items: [] };
  }
}

function save(data) {
  fs.writeFileSync(NOTIFICATIONS_PATH, JSON.stringify(pruneOld(data), null, 2));
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @param {{ type?: string, title: string, message: string, severity?: 'info'|'warn'|'error', key?: string }} note
 */
export function addNotification(note) {
  const data = load();
  const key = note.key || null;
  if (key) {
    const recent = data.items.find(
      (i) => i.key === key && Date.now() - Date.parse(i.createdAt || i.lastTelegramAt || 0) < TELEGRAM_DEDUP_MS
    );
    if (recent) {
      recent.message = note.message;
      recent.title = note.title;
      recent.updatedAt = new Date().toISOString();
      save(data);
      return recent;
    }
  }
  const item = {
    id: uid(),
    type: note.type || 'general',
    title: String(note.title || 'Notification'),
    message: String(note.message || ''),
    severity: note.severity || 'info',
    key,
    read: false,
    createdAt: new Date().toISOString(),
  };
  data.items.unshift(item);
  save(data);
  if (!note.skipTelegram) {
    const alreadySent = key
      ? data.items.some(
          (i) => i.key === key && i.lastTelegramAt && Date.now() - Date.parse(i.lastTelegramAt) < TELEGRAM_DEDUP_MS
        )
      : false;
    if (!alreadySent) {
      item.lastTelegramAt = new Date().toISOString();
      save(data);
      sendTelegramCopy(item).catch(() => {});
    }
  }
  return item;
}

export function listNotifications() {
  const data = load();
  save(data);
  const unread = data.items.filter((i) => !i.read).length;
  return { ok: true, items: data.items, unread };
}

export function markNotificationRead(id) {
  const data = load();
  const item = data.items.find((i) => i.id === id);
  if (!item) return { ok: false, error: 'not found' };
  item.read = true;
  item.readAt = new Date().toISOString();
  save(data);
  return { ok: true, item, unread: data.items.filter((i) => !i.read).length };
}

export function markAllNotificationsRead() {
  const data = load();
  const now = new Date().toISOString();
  for (const i of data.items) {
    if (!i.read) {
      i.read = true;
      i.readAt = now;
    }
  }
  save(data);
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
export function syncSessionNotifications(session, cookies) {
  if (session && session.ok === false) {
    addNotification({
      key: 'session_dead',
      type: 'session',
      severity: 'error',
      title: 'LinkedIn session inactive',
      message: `LinkedIn session is no longer valid${session.reason ? ` (${session.reason})` : ''}. Open H.A.L.O. → LinkedIn and Sign in (email/password + app approval if asked).`,
    });
  }
  if (cookies && cookies.present === false) {
    addNotification({
      key: 'session_missing_li_at',
      type: 'session',
      severity: 'error',
      title: 'LinkedIn li_at cookie missing',
      message: 'No valid LinkedIn session on the server. Use Sign in on the LinkedIn page (email/password + app approval).',
    });
  }
}
