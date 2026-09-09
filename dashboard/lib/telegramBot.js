/**
 * Shared WAFFi Telegram bot — /start replies with chat ID for notification setup.
 * Webhook route must stay outside dashboard Basic auth.
 */
import { readEnvFile } from './env.js';
import { dashboardPublicUrl } from './sessionRepair.js';

export const WAFFI_TELEGRAM_BOT_USERNAME =
  (process.env.WAFFI_TELEGRAM_BOT_USERNAME || 'notioncalen_bot').trim();
export const WAFFI_TELEGRAM_BOT_URL = `https://t.me/${WAFFI_TELEGRAM_BOT_USERNAME}`;

let cachedBotInfo = null;
let cachedAvatar = null;
const AVATAR_CACHE_MS = 6 * 60 * 60 * 1000;

export const WAFFI_TELEGRAM_BOT_AVATAR_FALLBACK = '/waffi-telegram-bot.png';

function botToken(env = readEnvFile()) {
  return (process.env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || '').trim();
}

function startReplyText(chatId) {
  return [
    'Welcome to WAFFi — glad to have you here.',
    '',
    'Your Chat ID:',
    `<code>${chatId}</code>`,
    '',
    'Copy the number above and paste it into your notification settings when you are ready.',
  ].join('\n');
}

export async function telegramApi(method, body, env = readEnvFile()) {
  const token = botToken(env);
  if (!token) throw new Error('Telegram bot token not configured');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    throw new Error(data.description || `Telegram API ${method} failed (${res.status})`);
  }
  return data.result;
}

export async function sendTelegramChatMessage(chatId, text, env = readEnvFile()) {
  return telegramApi(
    'sendMessage',
    {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    },
    env
  );
}

export async function handleTelegramWebhook(update) {
  const message = update?.message || update?.edited_message;
  if (!message?.chat?.id) return;

  const text = String(message.text || '').trim();
  if (text !== '/start' && !text.startsWith('/start ')) return;

  const chatId = message.chat.id;
  await sendTelegramChatMessage(chatId, startReplyText(chatId));
}

export function webhookPath() {
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  return secret ? `/api/telegram/webhook/${secret}` : '/api/telegram/webhook';
}

export function webhookPublicUrl() {
  const base = dashboardPublicUrl().replace(/\/$/, '');
  return `${base}${webhookPath()}`;
}

export async function fetchWaffiBotInfo(env = readEnvFile()) {
  if (cachedBotInfo) return cachedBotInfo;
  const token = botToken(env);
  if (!token) return null;
  try {
    const me = await telegramApi('getMe', {}, env);
    cachedBotInfo = {
      id: me.id,
      username: me.username || WAFFI_TELEGRAM_BOT_USERNAME,
      displayName: me.first_name || 'WAFFi',
      url: me.username ? `https://t.me/${me.username}` : WAFFI_TELEGRAM_BOT_URL,
      photoUrl: '/api/telegram/bot-avatar',
    };
    return cachedBotInfo;
  } catch {
    return {
      username: WAFFI_TELEGRAM_BOT_USERNAME,
      displayName: 'WAFFi',
      url: WAFFI_TELEGRAM_BOT_URL,
      photoUrl: WAFFI_TELEGRAM_BOT_AVATAR_FALLBACK,
    };
  }
}

/** Fetches bot profile photo from Telegram; falls back to null if unset. */
export async function fetchBotAvatarFromTelegram(env = readEnvFile()) {
  const token = botToken(env);
  if (!token) return null;

  const me = await telegramApi('getMe', {}, env);
  const photos = await telegramApi('getUserProfilePhotos', { user_id: me.id, limit: 1 }, env);
  const sizes = photos?.photos?.[0];
  if (!sizes?.length) return null;

  const largest = sizes[sizes.length - 1];
  const file = await telegramApi('getFile', { file_id: largest.file_id }, env);
  if (!file?.file_path) return null;

  const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  const res = await fetch(fileUrl);
  if (!res.ok) return null;

  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType, fetchedAt: Date.now() };
}

export async function getBotAvatarCached(env = readEnvFile(), { force = false } = {}) {
  if (
    !force &&
    cachedAvatar &&
    Date.now() - cachedAvatar.fetchedAt < AVATAR_CACHE_MS
  ) {
    return cachedAvatar;
  }
  try {
    const fresh = await fetchBotAvatarFromTelegram(env);
    if (fresh) {
      cachedAvatar = fresh;
      return cachedAvatar;
    }
  } catch (e) {
    console.warn('[telegram] bot avatar fetch failed:', e.message || e);
  }
  return cachedAvatar;
}

export function warmBotAvatarCache(env = readEnvFile()) {
  return getBotAvatarCached(env).catch(() => null);
}

export async function registerTelegramWebhook(env = readEnvFile()) {
  const token = botToken(env);
  if (!token) return { ok: false, reason: 'no_token' };
  if ((process.env.TELEGRAM_SET_WEBHOOK || '1').trim() === '0') {
    return { ok: false, reason: 'disabled' };
  }

  const url = webhookPublicUrl();
  try {
    await telegramApi('setWebhook', { url, allowed_updates: ['message'] }, env);
    console.log(`[telegram] webhook set → ${url}`);
    return { ok: true, url };
  } catch (e) {
    console.warn('[telegram] webhook registration failed:', e.message || e);
    return { ok: false, reason: e.message || String(e) };
  }
}

export function getTelegramIntegrationMeta(env = readEnvFile()) {
  const chat = (env.TELEGRAM_NOTIFY_CHAT || env.TELEGRAM_NOTIFY_PHONE || '').trim();
  return {
    waffiBotUsername: WAFFI_TELEGRAM_BOT_USERNAME,
    waffiBotUrl: WAFFI_TELEGRAM_BOT_URL,
    botPhotoUrl: '/api/telegram/bot-avatar',
    botPhotoFallback: WAFFI_TELEGRAM_BOT_AVATAR_FALLBACK,
    chatIdSet: Boolean(chat),
    notifyChat: chat,
    botTokenConfigured: Boolean(botToken(env)),
  };
}
