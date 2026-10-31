/**
 * WhatsApp Web (web.whatsapp.com) session — Chromium userDataDir is the source of truth
 * (IndexedDB). storageState is a secondary snapshot.
 */
import fs from 'fs';
import path from 'path';
import { dataRoot } from './dataRoot.js';

export function waCookiesFile(root = dataRoot()) {
  return path.join(root, 'wa_cookies.json');
}

export function waStorageStateFile(root = dataRoot()) {
  return path.join(root, 'wa_storage_state.json');
}

export function waSessionStatusFile(root = dataRoot()) {
  return path.join(root, 'wa_session_status.json');
}

export function waSessionDataDir(root = dataRoot()) {
  return path.join(root, 'session_data_wa');
}

export function readWaSessionStatus(filePath = waSessionStatusFile()) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function writeWaSessionStatus(patch = {}, filePath = waSessionStatusFile()) {
  const prev = readWaSessionStatus(filePath) || {};
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2));
  return next;
}

export function markWaSessionOk(extra = {}, opts = {}) {
  return writeWaSessionStatus(
    { ok: true, reason: null, needsCookieRepair: false, ...extra },
    opts.statusFile || waSessionStatusFile()
  );
}

export function markWaSessionDead(reason = 'auth_wall', extra = {}, opts = {}) {
  return writeWaSessionStatus(
    { ok: false, reason, needsCookieRepair: true, ...extra },
    opts.statusFile || waSessionStatusFile()
  );
}

/** Heuristic: profile dir exists and status ok, or storageState has WA markers. */
export function waAuthPresent(root = dataRoot()) {
  try {
    const st = readWaSessionStatus(waSessionStatusFile(root));
    if (st?.ok === true && !st?.needsCookieRepair) {
      const dir = waSessionDataDir(root);
      if (fs.existsSync(dir)) return { present: true, count: 1, kind: 'profile' };
    }
  } catch {
    /* ignore */
  }
  try {
    const p = waStorageStateFile(root);
    if (fs.existsSync(p)) {
      const state = JSON.parse(fs.readFileSync(p, 'utf8'));
      const origins = Array.isArray(state?.origins) ? state.origins : [];
      let n = 0;
      for (const o of origins) {
        if (/whatsapp/i.test(String(o?.origin || ''))) n += (o.localStorage || []).length;
      }
      if (n > 0) return { present: true, count: n, kind: 'storage' };
    }
  } catch {
    /* ignore */
  }
  return { present: false, count: 0, kind: 'none' };
}
