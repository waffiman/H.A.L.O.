/**
 * Instagram session health — isolated from LinkedIn / X jars.
 * Sentinel cookie: sessionid. Never writes cookies.json / x_cookies.json.
 */
import fs from 'fs';
import path from 'path';
import { dataRoot } from './dataRoot.js';

export function igSessionStatusFile(root = dataRoot()) {
  return path.join(root, 'ig_session_status.json');
}

export function igCookiesFile(root = dataRoot()) {
  return path.join(root, 'ig_cookies.json');
}

export function igSessionDataDir(root = dataRoot()) {
  return path.join(root, 'session_data_ig');
}

export function readIgSessionStatus(filePath = igSessionStatusFile()) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function writeIgSessionStatus(patch = {}, filePath = igSessionStatusFile()) {
  const prev = readIgSessionStatus(filePath) || {};
  const next = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2));
  return next;
}

export function markIgSessionOk(extra = {}, opts = {}) {
  const statusFile = opts.statusFile || igSessionStatusFile();
  return writeIgSessionStatus(
    {
      ok: true,
      reason: null,
      needsCookieRepair: false,
      ...extra,
    },
    statusFile
  );
}

export function markIgSessionDead(reason = 'auth_wall', extra = {}, opts = {}) {
  const statusFile = opts.statusFile || igSessionStatusFile();
  return writeIgSessionStatus(
    { ok: false, reason, needsCookieRepair: true, ...extra },
    statusFile
  );
}

export function igSessionIdPresent(cookiesPath = igCookiesFile()) {
  try {
    if (!fs.existsSync(cookiesPath)) return { present: false, count: 0 };
    const list = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    const cookies = Array.isArray(list) ? list : [];
    return {
      present: cookies.some((c) => c.name === 'sessionid' && c.value),
      count: cookies.length,
    };
  } catch {
    return { present: false, count: 0 };
  }
}

/** Cookie names needed for web API + Playwright (from EditThisCookie Instagram jar). */
export const IG_COOKIE_NAMES = new Set([
  'sessionid',
  'csrftoken',
  'ds_user_id',
  'mid',
  'ig_did',
  'rur',
  'datr',
  'ig_nrcb',
]);
