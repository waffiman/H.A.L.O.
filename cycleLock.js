/**
 * Shared cycle lock so Stage A and Stage B never run in parallel.
 * Stage A has priority: Stage B skips immediately if lock is held.
 */
import fs from 'fs';
import path from 'path';

const LOCK_PATH = path.join(process.cwd(), 'cycle.lock');

let memOwner = null;
let memSince = 0;

/** Stale lock older than 3h → treat as free */
export const LOCK_STALE_MS = 3 * 60 * 60 * 1000;

function readLockFile() {
  try {
    if (!fs.existsSync(LOCK_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
    return raw;
  } catch {
    return null;
  }
}

function writeLockFile(owner) {
  const payload = { owner, pid: process.pid, since: new Date().toISOString() };
  fs.writeFileSync(LOCK_PATH, JSON.stringify(payload), 'utf8');
}

function clearLockFile() {
  try {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
  } catch {
    /* ignore */
  }
}

/** Drop cycle.lock (e.g. repair container killed mid-run). */
export function releaseCycleLock() {
  memOwner = null;
  memSince = 0;
  clearLockFile();
}

export function isLockHeld() {
  if (memOwner) return { held: true, owner: memOwner, since: memSince };
  const file = readLockFile();
  if (!file?.owner) return { held: false };
  // Stale lock older than 3h → treat as free
  const sinceMs = Date.parse(file.since || '') || 0;
  if (sinceMs && Date.now() - sinceMs > LOCK_STALE_MS) {
    clearLockFile();
    return { held: false };
  }
  return { held: true, owner: file.owner, since: file.since };
}

export function stageARunning() {
  const s = isLockHeld();
  return s.held && s.owner === 'A';
}

/** Owner string if cycle.lock is held (in-process Stage A/B/C/Brain/R), else null. */
export function activeAutomationOwner() {
  const s = isLockHeld();
  return s.held ? s.owner : null;
}

/**
 * @param {'A'|'B'|'C'|'Brain'|'R'} owner
 * @param {() => Promise<any>} fn
 * @param {{ waitMs?: number, skipIfBusy?: boolean }} opts
 *   - Stage B / Connect (C): skipIfBusy true (default) — if lock held, skip
 *   - Stage A / Brain: waitMs to wait for the other owner to finish
 */
export async function withCycleLock(owner, fn, opts = {}) {
  const skipIfBusy =
    opts.skipIfBusy !== undefined
      ? opts.skipIfBusy
      : owner === 'B' || owner === 'C';
  const waitMs = Number(
    opts.waitMs ??
      (owner === 'A' || owner === 'Brain' ? Number(process.env.LOCK_WAIT_MS || 900000) : 0)
  );
  const started = Date.now();

  while (true) {
    const state = isLockHeld();
    if (!state.held && !memOwner) break;

    if (skipIfBusy) {
      console.log(`Stage ${owner} skipped — lock held by ${state.owner || memOwner}`);
      return { skipped: true, reason: 'lock_held' };
    }

    // Stage A / Brain wait for the other holder
    if (Date.now() - started >= waitMs) {
      console.log(
        `${owner} could not acquire lock within ${waitMs}ms (held by ${state.owner || memOwner}) — skip`
      );
      return { skipped: true, reason: 'lock_timeout' };
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  if (skipIfBusy && isLockHeld().held) {
    return { skipped: true, reason: 'lock_held' };
  }

  memOwner = owner;
  memSince = Date.now();
  writeLockFile(owner);
  console.log(`Cycle lock acquired by Stage ${owner}`);
  try {
    const result = await fn();
    return { skipped: false, result };
  } finally {
    memOwner = null;
    memSince = 0;
    clearLockFile();
    console.log(`Cycle lock released by Stage ${owner}`);
  }
}
