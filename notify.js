/**
 * Agent-side helper to append dashboard notifications (same file as dashboard).
 */
import fs from 'fs';
import path from 'path';

const NOTIFICATIONS_PATH = path.join(process.cwd(), 'notifications.json');

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
    const parsed = Array.isArray(data.items) ? data : { items: [] };
    return pruneOld(parsed);
  } catch {
    return { items: [] };
  }
}

function save(data) {
  fs.writeFileSync(NOTIFICATIONS_PATH, JSON.stringify(pruneOld(data), null, 2));
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
  const data = load();
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
      recent.updatedAt = new Date().toISOString();
      // Never re-send Telegram for the same key inside the dedup window
      // (forceTelegram must not bypass this — it caused 3× session_dead spam).
      const lastTg = data.items
        .filter((i) => i.key === key)
        .map((i) => Date.parse(i.lastTelegramAt || 0))
        .filter((t) => Number.isFinite(t) && t > 0);
      const tgRecently = lastTg.some((t) => Date.now() - t < TELEGRAM_DEDUP_MS);
      if (!tgRecently && telegramDue(recent) && !note.skipTelegram) {
        await maybeTelegram(recent);
        recent.lastTelegramAt = new Date().toISOString();
      }
      save(data);
      return recent;
    }
  }
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
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
  if (telegramDue(item) && !note.skipTelegram) {
    await maybeTelegram(item);
    item.lastTelegramAt = new Date().toISOString();
    save(data);
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
