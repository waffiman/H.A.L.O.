/**
 * Facebook session health — isolated jar. Sentinel: c_user + xs.
 * Never writes LinkedIn / X / IG cookies.
 */
import fs from 'fs';
import path from 'path';
import { dataRoot } from './dataRoot.js';

export function fbSessionStatusFile(root = dataRoot()) {
  return path.join(root, 'fb_session_status.json');
}

export function fbCookiesFile(root = dataRoot()) {
  return path.join(root, 'fb_cookies.json');
}

export function fbSessionDataDir(root = dataRoot()) {
  return path.join(root, 'session_data_fb');
}

export const FB_COOKIE_NAMES = new Set([
  'c_user',
  'xs',
  'datr',
  'sb',
  'fr',
  'presence',
  'wd',
  'dpr',
  'oo',
]);

export function readFbSessionStatus(filePath = fbSessionStatusFile()) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function writeFbSessionStatus(patch = {}, filePath = fbSessionStatusFile()) {
  const prev = readFbSessionStatus(filePath) || {};
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2));
  return next;
}

export function markFbSessionOk(extra = {}, opts = {}) {
  return writeFbSessionStatus(
    { ok: true, reason: null, needsCookieRepair: false, ...extra },
    opts.statusFile || fbSessionStatusFile()
  );
}

export function markFbSessionDead(reason = 'auth_wall', extra = {}, opts = {}) {
  return writeFbSessionStatus(
    { ok: false, reason, needsCookieRepair: true, ...extra },
    opts.statusFile || fbSessionStatusFile()
  );
}

export function fbAuthPresent(cookiesPath = fbCookiesFile()) {
  try {
    if (!fs.existsSync(cookiesPath)) return { present: false, count: 0 };
    const list = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    const cookies = Array.isArray(list) ? list : [];
    return {
      present: cookies.some((c) => c.name === 'c_user' && c.value) && cookies.some((c) => c.name === 'xs' && c.value),
      count: cookies.length,
    };
  } catch {
    return { present: false, count: 0 };
  }
}
