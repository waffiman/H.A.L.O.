/**
 * Telegram Web (web.telegram.org/a) session — mostly localStorage (GramJS),
 * not EditThisCookie cookies. Prefer Playwright storageState.
 */
import fs from 'fs';
import path from 'path';
import { dataRoot } from './dataRoot.js';

export function tgCookiesFile(root = dataRoot()) {
  return path.join(root, 'tg_cookies.json');
}

export function tgStorageStateFile(root = dataRoot()) {
  return path.join(root, 'tg_storage_state.json');
}

export function tgSessionStatusFile(root = dataRoot()) {
  return path.join(root, 'tg_session_status.json');
}

export function tgSessionDataDir(root = dataRoot()) {
  return path.join(root, 'session_data_tg');
}

/** Legacy / Fragment-style cookies — rarely present on Web A. */
export const TG_COOKIE_NAMES = new Set([
  'stel_token',
  'stel_ssid',
  'stel_ton',
  'stel_dt',
  'stel_web_auth',
  'stel_ln',
]);

/** localStorage keys that mean “logged into Telegram Web A/K”. */
const TG_AUTH_LS_RE = /auth_key|user_auth|_auth|account\d+|dc\d+_auth/i;

export function isTelegramCookieDomain(domain) {
  const d = String(domain || '')
    .replace(/^\./, '')
    .toLowerCase();
  return d === 'telegram.org' || d.endsWith('.telegram.org') || d === 'web.telegram.org';
}

function storageHasAuth(state) {
  if (!state || typeof state !== 'object') return false;
  const origins = Array.isArray(state.origins) ? state.origins : [];
  for (const origin of origins) {
    const items = Array.isArray(origin?.localStorage) ? origin.localStorage : [];
    for (const item of items) {
      const name = String(item?.name || '');
      const value = String(item?.value || '');
      if (value && TG_AUTH_LS_RE.test(name)) return true;
    }
  }
  // Flat localStorage dump: { "dc2_auth_key": "..." }
  if (!origins.length) {
    for (const [k, v] of Object.entries(state)) {
      if (k === 'cookies' || k === 'origins') continue;
      if (v && TG_AUTH_LS_RE.test(k)) return true;
    }
  }
  return false;
}

export function tgAuthPresent(root = dataRoot()) {
  try {
    const storagePath = tgStorageStateFile(root);
    if (fs.existsSync(storagePath)) {
      const state = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
      if (storageHasAuth(state)) {
        const origins = Array.isArray(state.origins) ? state.origins : [];
        const n = origins.reduce((acc, o) => acc + (o.localStorage?.length || 0), 0);
        return { present: true, count: n || Object.keys(state).length, kind: 'storage' };
      }
    }
  } catch {
    /* fall through */
  }
  try {
    const file = tgCookiesFile(root);
    if (!fs.existsSync(file)) return { present: false, count: 0 };
    const list = JSON.parse(fs.readFileSync(file, 'utf8'));
    const arr = Array.isArray(list) ? list : [];
    const hasToken = arr.some(
      (c) => (c.name === 'stel_token' || c.name === 'stel_ssid') && c.value
    );
    return { present: hasToken, count: arr.length, kind: hasToken ? 'cookies' : 'none' };
  } catch {
    return { present: false, count: 0 };
  }
}

export function readTgSessionStatus(root = dataRoot()) {
  try {
    const p = tgSessionStatusFile(root);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function markTgSessionOk(extra = {}, root = dataRoot()) {
  const payload = {
    ok: true,
    needsCookieRepair: false,
    updatedAt: new Date().toISOString(),
    ...extra,
  };
  fs.writeFileSync(tgSessionStatusFile(root), JSON.stringify(payload, null, 2));
  return payload;
}

export function markTgSessionDead(reason, root = dataRoot()) {
  const payload = {
    ok: false,
    needsCookieRepair: true,
    reason: String(reason || 'dead'),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(tgSessionStatusFile(root), JSON.stringify(payload, null, 2));
  return payload;
}

/**
 * Normalize pasted JSON into Playwright storageState shape.
 * Accepts: full storageState, { origins }, or flat localStorage map.
 */
export function normalizeTgStoragePaste(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('Empty paste');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Could not parse JSON');
  }
  if (Array.isArray(data?.origins)) {
    if (!storageHasAuth(data)) {
      throw new Error('No Telegram auth keys in storage (look for *auth_key* in localStorage)');
    }
    return data;
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    // Flat map from DevTools → Application → Local Storage export helpers
    const entries = Object.entries(data)
      .filter(([k]) => k !== 'cookies' && k !== 'origins')
      .map(([name, value]) => ({ name, value: String(value ?? '') }));
    if (!entries.some((e) => TG_AUTH_LS_RE.test(e.name) && e.value)) {
      throw new Error(
        'Telegram Web A does not use cookies for login. Paste localStorage (keys like dc2_auth_key) or use phone + code on this page.'
      );
    }
    return {
      cookies: Array.isArray(data.cookies) ? data.cookies : [],
      origins: [
        {
          origin: 'https://web.telegram.org',
          localStorage: entries,
        },
      ],
    };
  }
  if (Array.isArray(data)) {
    throw new Error(
      'EditThisCookie JSON is empty on Telegram Web A — session lives in localStorage, not cookies. Use phone + code, or paste localStorage JSON.'
    );
  }
  throw new Error('Unrecognized Telegram session JSON');
}
