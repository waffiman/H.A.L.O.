/**
 * X session health — isolated from LinkedIn sessionHealth.js.
 * Never writes cookies.json / session_status.json / SKIP_STAGE_*.
 */
import fs from 'fs';
import path from 'path';
import { dataRoot } from './dataRoot.js';

export function xSessionStatusFile(root = dataRoot()) {
  return path.join(root, 'x_session_status.json');
}

export function xCookiesFile(root = dataRoot()) {
  return path.join(root, 'x_cookies.json');
}

export function readXSessionStatus(filePath = xSessionStatusFile()) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function writeXSessionStatus(patch = {}, filePath = xSessionStatusFile()) {
  const prev = readXSessionStatus(filePath) || {};
  const next = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2));
  return next;
}

export function markXSessionOk(extra = {}, opts = {}) {
  const statusFile = opts.statusFile || xSessionStatusFile();
  return writeXSessionStatus(
    {
      ok: true,
      reason: null,
      needsCookieRepair: false,
      ...extra,
    },
    statusFile
  );
}

export function markXSessionDead(reason = 'auth_wall', extra = {}, opts = {}) {
  const statusFile = opts.statusFile || xSessionStatusFile();
  return writeXSessionStatus(
    { ok: false, reason, needsCookieRepair: true, ...extra },
    statusFile
  );
}

export function xAuthTokenPresent(cookiesPath = xCookiesFile()) {
  try {
    if (!fs.existsSync(cookiesPath)) return { present: false, count: 0 };
    const list = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    const cookies = Array.isArray(list) ? list : [];
    return {
      present: cookies.some((c) => c.name === 'auth_token' && c.value),
      count: cookies.length,
    };
  } catch {
    return { present: false, count: 0 };
  }
}
