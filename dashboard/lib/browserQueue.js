/**
 * Global Chromium / automation mutex for multi-cabinet VPS.
 * Extends cycle.lock with workspaceId so only one browser job runs at a time.
 */
import fs from 'fs';
import path from 'path';
import { APP_ROOT } from './env.js';

const LOCK_PATH = path.join(APP_ROOT, 'cycle.lock');
export const LOCK_STALE_MS = 3 * 60 * 60 * 1000;

function readLock() {
  try {
    if (!fs.existsSync(LOCK_PATH)) return null;
    return JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeLock(payload) {
  fs.writeFileSync(LOCK_PATH, JSON.stringify(payload, null, 2), 'utf8');
}

function clearLock() {
  try {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
  } catch {
    /* ignore */
  }
}

export function browserLockStatus() {
  const file = readLock();
  if (!file?.owner) return { held: false };
  const sinceMs = Date.parse(file.since || '') || 0;
  if (sinceMs && Date.now() - sinceMs > LOCK_STALE_MS) {
    clearLock();
    return { held: false };
  }
  return {
    held: true,
    owner: file.owner,
    workspaceId: file.workspaceId || 'default',
    since: file.since,
  };
}

/**
 * Run fn while holding the global browser lock for a cabinet.
 * @param {{ owner: string, workspaceId: string, skipIfBusy?: boolean, waitMs?: number }} opts
 */
export async function withBrowserLock(opts, fn) {
  const owner = String(opts.owner || 'job');
  const workspaceId = String(opts.workspaceId || 'default');
  const skipIfBusy = opts.skipIfBusy !== false;
  const waitMs = Number(opts.waitMs) || 0;
  const started = Date.now();

  while (true) {
    const st = browserLockStatus();
    if (!st.held) break;
    if (skipIfBusy && waitMs <= 0) {
      return { skipped: true, reason: 'busy', heldBy: st };
    }
    if (Date.now() - started >= waitMs) {
      return { skipped: true, reason: 'timeout', heldBy: st };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  writeLock({
    owner,
    workspaceId,
    pid: process.pid,
    since: new Date().toISOString(),
  });
  try {
    const result = await fn();
    return { skipped: false, result };
  } finally {
    const cur = readLock();
    if (cur?.owner === owner && String(cur.workspaceId || '') === workspaceId) {
      clearLock();
    }
  }
}
